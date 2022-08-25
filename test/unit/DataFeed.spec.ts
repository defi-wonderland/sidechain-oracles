import { ethers } from 'hardhat';
import { ContractTransaction } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { DataFeed, DataFeed__factory, IUniswapV3Factory, IUniswapV3Pool, IConnextSenderAdapter, IOracleSidechain } from '@typechained';
import { smock, MockContract, MockContractFactory, FakeContract } from '@defi-wonderland/smock';
import { evm, wallet } from '@utils';
import { UNI_FACTORY } from '@utils/constants';
import { toBN } from '@utils/bn';
import { readArgFromEvent } from '@utils/event-utils';
import { onlyGovernance } from '@utils/behaviours';
import chai, { expect } from 'chai';

chai.use(smock.matchers);

describe('DataFeed.sol', () => {
  let randomUser: SignerWithAddress;
  let governance: SignerWithAddress;
  let dataFeed: MockContract<DataFeed>;
  let dataFeedFactory: MockContractFactory<DataFeed__factory>;
  let connextSenderAdapter: FakeContract<IConnextSenderAdapter>;
  let fakeAdapter: FakeContract<IConnextSenderAdapter>;
  let uniswapV3Factory: FakeContract<IUniswapV3Factory>;
  let uniswapV3Pool: FakeContract<IUniswapV3Pool>;
  let tx: ContractTransaction;
  let snapshotId: string;

  const randomDataReceiverAddress = wallet.generateRandomAddress();
  const randomDataReceiverAddress2 = wallet.generateRandomAddress();
  const randomDestinationDomainId = 3;
  const randomDestinationDomainId2 = 34;
  const randomChainId = 32;
  const randomChainId2 = 22;

  const randomToken0 = wallet.generateRandomAddress();
  const randomToken1 = wallet.generateRandomAddress();
  const randomFee = 3000;

  before(async () => {
    [, randomUser, governance] = await ethers.getSigners();

    connextSenderAdapter = await smock.fake('IConnextSenderAdapter');
    fakeAdapter = await smock.fake('IConnextSenderAdapter');
    uniswapV3Factory = await smock.fake('IUniswapV3Factory', {
      address: UNI_FACTORY,
    });
    uniswapV3Pool = await smock.fake('IUniswapV3Pool');
    uniswapV3Factory.getPool.returns(uniswapV3Pool.address);

    dataFeedFactory = await smock.mock('DataFeed');
    dataFeed = await dataFeedFactory.deploy(governance.address);

    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('constructor(...)', () => {
    it('should initialize governance to the address passed to the constructor', async () => {
      expect(await dataFeed.governance()).to.eq(governance.address);
    });
  });

  describe('sendObservations(...)', () => {
    let secondsNow: number;
    let secondsAgo = 30;
    let delta1 = 20;
    let delta2 = 10;
    let secondsAgos = [secondsAgo, secondsAgo - delta1, secondsAgo - (delta1 + delta2)];
    let blockTimestamp1: number;
    let blockTimestamp2: number;
    let tickCumulative = 3000;
    let tickCumulativesDelta1: number;
    let tickCumulativesDelta2: number;
    let tickCumulatives: number[];
    let arithmeticMeanTick1: number;
    let arithmeticMeanTick2: number;

    context('when the adapter is not whitelisted', () => {
      it('should revert', async () => {
        await expect(
          dataFeed
            .connect(randomUser)
            .sendObservations(connextSenderAdapter.address, randomChainId, randomToken0, randomToken1, randomFee, secondsAgos)
        ).to.be.revertedWith('UnallowedAdapter()');
      });
    });

    context('when the adapter is whitelisted but the domain id is not set', () => {
      it('should revert', async () => {
        await dataFeed.connect(governance).whitelistAdapter(connextSenderAdapter.address, true);
        await expect(
          dataFeed
            .connect(randomUser)
            .sendObservations(connextSenderAdapter.address, randomChainId, randomToken0, randomToken1, randomFee, secondsAgos)
        ).to.be.revertedWith('DestinationDomainIdNotSet()');
      });
    });

    context('when the adapter is whitelisted, the domain id is set, but the receiver is not set', () => {
      it('should revert', async () => {
        await dataFeed.connect(governance).whitelistAdapter(connextSenderAdapter.address, true);
        await dataFeed.connect(governance).setDestinationDomainId(connextSenderAdapter.address, randomChainId, randomDestinationDomainId);
        await expect(
          dataFeed
            .connect(randomUser)
            .sendObservations(connextSenderAdapter.address, randomChainId, randomToken0, randomToken1, randomFee, secondsAgos)
        ).to.be.revertedWith('ReceiverNotSet()');
      });
    });

    context('when the adapter is whitelisted and the domain id and receiver are set', () => {
      beforeEach(async () => {
        await dataFeed.connect(governance).whitelistAdapter(connextSenderAdapter.address, true);
        await dataFeed.connect(governance).setDestinationDomainId(connextSenderAdapter.address, randomChainId, randomDestinationDomainId);
        await dataFeed.connect(governance).setReceiver(connextSenderAdapter.address, randomDestinationDomainId, randomDataReceiverAddress);
        connextSenderAdapter.bridgeObservations.reset();
      });

      it('should revert if secondsAgos is unsorted', async () => {
        let secondsAgos = [secondsAgo - (delta1 + delta2), secondsAgo - delta1, secondsAgo];
        let tickCumulatives = [0, 0, 0];
        uniswapV3Pool.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
        await expect(
          dataFeed.sendObservations(connextSenderAdapter.address, randomChainId, randomToken0, randomToken1, randomFee, secondsAgos)
        ).to.be.revertedWith(
          'VM Exception while processing transaction: reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)'
        );
      });

      it('should revert if secondsAgos has a repeated input', async () => {
        let secondsAgos = [secondsAgo, secondsAgo];
        let tickCumulatives = [0, 0];
        uniswapV3Pool.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
        await expect(
          dataFeed.sendObservations(connextSenderAdapter.address, randomChainId, randomToken0, randomToken1, randomFee, secondsAgos)
        ).to.be.revertedWith('VM Exception while processing transaction: reverted with panic code 0x12 (Division or modulo division by zero)');
      });

      context('when the oracle has no data', () => {
        beforeEach(async () => {
          secondsNow = (await ethers.provider.getBlock('latest')).timestamp + 1;
          blockTimestamp1 = secondsNow - secondsAgos[0];
          blockTimestamp2 = secondsNow - secondsAgos[1];
        });

        it('should revert if secondsAgos provides insufficient datapoints', async () => {
          let secondsAgos = [secondsAgo];
          let tickCumulatives = [0];
          uniswapV3Pool.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
          await expect(
            dataFeed.sendObservations(connextSenderAdapter.address, randomChainId, randomToken0, randomToken1, randomFee, secondsAgos)
          ).to.be.revertedWith('InvalidSecondsAgos()');
        });

        // arithmeticMeanTick = tickCumulativesDelta / delta
        context('when the arithmetic mean tick is truncated', () => {
          before(async () => {
            tickCumulativesDelta1 = 2000;
            tickCumulativesDelta2 = 1000;
            tickCumulatives = [
              tickCumulative,
              tickCumulative + tickCumulativesDelta1,
              tickCumulative + (tickCumulativesDelta1 + tickCumulativesDelta2),
            ];
            arithmeticMeanTick1 = Math.trunc(tickCumulativesDelta1 / delta1);
            arithmeticMeanTick2 = Math.trunc(tickCumulativesDelta2 / delta2);
            uniswapV3Pool.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
          });

          it('should update lastPoolStateBridged', async () => {
            let lastBlockTimestampBridged = secondsNow - secondsAgos[2];
            let expectedLastPoolStateBridged = [lastBlockTimestampBridged, toBN(tickCumulatives[2]), arithmeticMeanTick2];
            await dataFeed.sendObservations(connextSenderAdapter.address, randomChainId, randomToken0, randomToken1, randomFee, secondsAgos);
            let lastPoolStateBridged = await dataFeed.lastPoolStateBridged();
            expect(lastPoolStateBridged).to.eql(expectedLastPoolStateBridged);
          });

          it('should call bridgeObservations with the correct arguments', async () => {
            let observationData1 = [blockTimestamp1, arithmeticMeanTick1];
            let observationData2 = [blockTimestamp2, arithmeticMeanTick2];
            let observationsData = [observationData1, observationData2];
            await dataFeed.sendObservations(connextSenderAdapter.address, randomChainId, randomToken0, randomToken1, randomFee, secondsAgos);
            expect(connextSenderAdapter.bridgeObservations).to.have.been.calledOnceWith(
              randomDataReceiverAddress,
              randomDestinationDomainId,
              observationsData,
              randomToken0,
              randomToken1,
              randomFee
            );
          });

          it('should emit DataSent', async () => {
            let observationData1 = [blockTimestamp1, arithmeticMeanTick1];
            let observationData2 = [blockTimestamp2, arithmeticMeanTick2];
            let observationsData = [observationData1, observationData2];
            let tx = await dataFeed.sendObservations(
              connextSenderAdapter.address,
              randomChainId,
              randomToken0,
              randomToken1,
              randomFee,
              secondsAgos
            );
            let eventBridgeSenderAdapter = await readArgFromEvent(tx, 'DataSent', '_bridgeSenderAdapter');
            let eventDataReceiver = await readArgFromEvent(tx, 'DataSent', '_dataReceiver');
            let eventDestinationDomainId = await readArgFromEvent(tx, 'DataSent', '_destinationDomainId');
            let eventObservationsData = await readArgFromEvent(tx, 'DataSent', '_observationsData');
            expect(eventBridgeSenderAdapter).to.eq(connextSenderAdapter.address);
            expect(eventDataReceiver).to.eq(randomDataReceiverAddress);
            expect(eventDestinationDomainId).to.eq(randomDestinationDomainId);
            expect(eventObservationsData).to.eql(observationsData);
          });
        });

        // arithmeticMeanTick = tickCumulativesDelta / delta
        context('when the arithmetic mean tick is rounded to negative infinity', () => {
          before(async () => {
            tickCumulativesDelta1 = -2001;
            tickCumulativesDelta2 = -1002;
            tickCumulatives = [
              tickCumulative,
              tickCumulative + tickCumulativesDelta1,
              tickCumulative + (tickCumulativesDelta1 + tickCumulativesDelta2),
            ];
            arithmeticMeanTick1 = Math.floor(tickCumulativesDelta1 / delta1);
            arithmeticMeanTick2 = Math.floor(tickCumulativesDelta2 / delta2);
            uniswapV3Pool.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
          });

          it('should update lastPoolStateBridged', async () => {
            let lastBlockTimestampBridged = secondsNow - secondsAgos[2];
            let expectedLastPoolStateBridged = [lastBlockTimestampBridged, toBN(tickCumulatives[2]), arithmeticMeanTick2];
            await dataFeed.sendObservations(connextSenderAdapter.address, randomChainId, randomToken0, randomToken1, randomFee, secondsAgos);
            let lastPoolStateBridged = await dataFeed.lastPoolStateBridged();
            expect(lastPoolStateBridged).to.eql(expectedLastPoolStateBridged);
          });

          it('should call bridgeObservations with the correct arguments', async () => {
            let observationData1 = [blockTimestamp1, arithmeticMeanTick1];
            let observationData2 = [blockTimestamp2, arithmeticMeanTick2];
            let observationsData = [observationData1, observationData2];
            await dataFeed.sendObservations(connextSenderAdapter.address, randomChainId, randomToken0, randomToken1, randomFee, secondsAgos);
            expect(connextSenderAdapter.bridgeObservations).to.have.been.calledOnceWith(
              randomDataReceiverAddress,
              randomDestinationDomainId,
              observationsData,
              randomToken0,
              randomToken1,
              randomFee
            );
          });

          it('should emit DataSent', async () => {
            let observationData1 = [blockTimestamp1, arithmeticMeanTick1];
            let observationData2 = [blockTimestamp2, arithmeticMeanTick2];
            let observationsData = [observationData1, observationData2];
            let tx = await dataFeed.sendObservations(
              connextSenderAdapter.address,
              randomChainId,
              randomToken0,
              randomToken1,
              randomFee,
              secondsAgos
            );
            let eventBridgeSenderAdapter = await readArgFromEvent(tx, 'DataSent', '_bridgeSenderAdapter');
            let eventDataReceiver = await readArgFromEvent(tx, 'DataSent', '_dataReceiver');
            let eventDestinationDomainId = await readArgFromEvent(tx, 'DataSent', '_destinationDomainId');
            let eventObservationsData = await readArgFromEvent(tx, 'DataSent', '_observationsData');
            expect(eventBridgeSenderAdapter).to.eq(connextSenderAdapter.address);
            expect(eventDataReceiver).to.eq(randomDataReceiverAddress);
            expect(eventDestinationDomainId).to.eq(randomDestinationDomainId);
            expect(eventObservationsData).to.eql(observationsData);
          });
        });
      });

      context('when the oracle has data', () => {
        let delta0: number;
        let lastBlockTimestampBridged: number;
        let lastTickCumulativeBridged: number;
        let lastArithmeticMeanTickBridged = 200;
        let tickCumulativesDelta0: number;
        let arithmeticMeanTick0: number;

        beforeEach(async () => {
          secondsNow = (await ethers.provider.getBlock('latest')).timestamp + 1;
          lastBlockTimestampBridged = secondsNow - secondsAgo - delta0;
          lastTickCumulativeBridged = tickCumulative - tickCumulativesDelta0;
          blockTimestamp1 = secondsNow - secondsAgos[0];
          blockTimestamp2 = secondsNow - secondsAgos[1];
          await dataFeed.setVariable('lastPoolStateBridged', {
            blockTimestamp: lastBlockTimestampBridged,
            tickCumulative: lastTickCumulativeBridged,
            //arithmeticMeanTick: lastArithmeticMeanTickBridged,
          });
        });

        context('when the data to be sent is old compared with that of the oracle', () => {
          before(async () => {
            delta0 = -40;
            tickCumulativesDelta0 = 8000;
            tickCumulatives = [0, 0, 0];
            uniswapV3Pool.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
          });

          it('should revert', async () => {
            await expect(
              dataFeed.sendObservations(connextSenderAdapter.address, randomChainId, randomToken0, randomToken1, randomFee, secondsAgos)
            ).to.be.revertedWith(
              'VM Exception while processing transaction: reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)'
            );
          });
        });

        context('when the data to be sent is continuous with that of the oracle', () => {
          before(async () => {
            delta0 = 0;
            tickCumulativesDelta0 = 0;
            tickCumulatives = [0, 0, 0];
            uniswapV3Pool.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
          });

          it('should revert', async () => {
            await expect(
              dataFeed.sendObservations(connextSenderAdapter.address, randomChainId, randomToken0, randomToken1, randomFee, secondsAgos)
            ).to.be.revertedWith(
              'VM Exception while processing transaction: reverted with panic code 0x12 (Division or modulo division by zero)'
            );
          });
        });

        context('when the data to be sent is discontinuous with that of the oracle', () => {
          before(async () => {
            delta0 = 40;
            tickCumulativesDelta0 = 0;
          });

          it('should be able to bridge 1 datapoint', async () => {
            let secondsAgos = [secondsAgo];
            let tickCumulatives = [tickCumulative];
            uniswapV3Pool.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
            let tx = await dataFeed.sendObservations(
              connextSenderAdapter.address,
              randomChainId,
              randomToken0,
              randomToken1,
              randomFee,
              secondsAgos
            );
            let eventObservationsData = (await readArgFromEvent(
              tx,
              'DataSent',
              '_observationsData'
            )) as IOracleSidechain.ObservationDataStructOutput[];
            expect(eventObservationsData.length).to.eq(1);
          });

          // arithmeticMeanTick = tickCumulativesDelta / delta
          context('when the arithmetic mean tick is truncated', () => {
            before(async () => {
              tickCumulativesDelta0 = 4000;
              tickCumulativesDelta1 = 2000;
              tickCumulativesDelta2 = 1000;
              tickCumulatives = [
                tickCumulative,
                tickCumulative + tickCumulativesDelta1,
                tickCumulative + (tickCumulativesDelta1 + tickCumulativesDelta2),
              ];
              arithmeticMeanTick0 = Math.trunc(tickCumulativesDelta0 / delta0);
              arithmeticMeanTick1 = Math.trunc(tickCumulativesDelta1 / delta1);
              arithmeticMeanTick2 = Math.trunc(tickCumulativesDelta2 / delta2);
              uniswapV3Pool.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
            });

            it('should update lastPoolStateBridged', async () => {
              let lastBlockTimestampBridged = secondsNow - secondsAgos[2];
              let expectedLastPoolStateBridged = [lastBlockTimestampBridged, toBN(tickCumulatives[2]), arithmeticMeanTick2];
              await dataFeed.sendObservations(connextSenderAdapter.address, randomChainId, randomToken0, randomToken1, randomFee, secondsAgos);
              let lastPoolStateBridged = await dataFeed.lastPoolStateBridged();
              expect(lastPoolStateBridged).to.eql(expectedLastPoolStateBridged);
            });

            it('should call bridgeObservations with the correct arguments', async () => {
              let observationData0 = [lastBlockTimestampBridged, arithmeticMeanTick0];
              let observationData1 = [blockTimestamp1, arithmeticMeanTick1];
              let observationData2 = [blockTimestamp2, arithmeticMeanTick2];
              let observationsData = [observationData0, observationData1, observationData2];
              await dataFeed.sendObservations(connextSenderAdapter.address, randomChainId, randomToken0, randomToken1, randomFee, secondsAgos);
              expect(connextSenderAdapter.bridgeObservations).to.have.been.calledOnceWith(
                randomDataReceiverAddress,
                randomDestinationDomainId,
                observationsData,
                randomToken0,
                randomToken1,
                randomFee
              );
            });

            it('should emit DataSent', async () => {
              let observationData0 = [lastBlockTimestampBridged, arithmeticMeanTick0];
              let observationData1 = [blockTimestamp1, arithmeticMeanTick1];
              let observationData2 = [blockTimestamp2, arithmeticMeanTick2];
              let observationsData = [observationData0, observationData1, observationData2];
              let tx = await dataFeed.sendObservations(
                connextSenderAdapter.address,
                randomChainId,
                randomToken0,
                randomToken1,
                randomFee,
                secondsAgos
              );
              let eventBridgeSenderAdapter = await readArgFromEvent(tx, 'DataSent', '_bridgeSenderAdapter');
              let eventDataReceiver = await readArgFromEvent(tx, 'DataSent', '_dataReceiver');
              let eventDestinationDomainId = await readArgFromEvent(tx, 'DataSent', '_destinationDomainId');
              let eventObservationsData = await readArgFromEvent(tx, 'DataSent', '_observationsData');
              expect(eventBridgeSenderAdapter).to.eq(connextSenderAdapter.address);
              expect(eventDataReceiver).to.eq(randomDataReceiverAddress);
              expect(eventDestinationDomainId).to.eq(randomDestinationDomainId);
              expect(eventObservationsData).to.eql(observationsData);
            });
          });

          // arithmeticMeanTick = tickCumulativesDelta / delta
          context('when the arithmetic mean tick is rounded to negative infinity', () => {
            before(async () => {
              tickCumulativesDelta0 = -4001;
              tickCumulativesDelta1 = -2001;
              tickCumulativesDelta2 = -1002;
              tickCumulatives = [
                tickCumulative,
                tickCumulative + tickCumulativesDelta1,
                tickCumulative + (tickCumulativesDelta1 + tickCumulativesDelta2),
              ];
              arithmeticMeanTick0 = Math.floor(tickCumulativesDelta0 / delta0);
              arithmeticMeanTick1 = Math.floor(tickCumulativesDelta1 / delta1);
              arithmeticMeanTick2 = Math.floor(tickCumulativesDelta2 / delta2);
              uniswapV3Pool.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
            });

            it('should update lastPoolStateBridged', async () => {
              let lastBlockTimestampBridged = secondsNow - secondsAgos[2];
              let expectedLastPoolStateBridged = [lastBlockTimestampBridged, toBN(tickCumulatives[2]), arithmeticMeanTick2];
              await dataFeed.sendObservations(connextSenderAdapter.address, randomChainId, randomToken0, randomToken1, randomFee, secondsAgos);
              let lastPoolStateBridged = await dataFeed.lastPoolStateBridged();
              expect(lastPoolStateBridged).to.eql(expectedLastPoolStateBridged);
            });

            it('should call bridgeObservations with the correct arguments', async () => {
              let observationData0 = [lastBlockTimestampBridged, arithmeticMeanTick0];
              let observationData1 = [blockTimestamp1, arithmeticMeanTick1];
              let observationData2 = [blockTimestamp2, arithmeticMeanTick2];
              let observationsData = [observationData0, observationData1, observationData2];
              await dataFeed.sendObservations(connextSenderAdapter.address, randomChainId, randomToken0, randomToken1, randomFee, secondsAgos);
              expect(connextSenderAdapter.bridgeObservations).to.have.been.calledOnceWith(
                randomDataReceiverAddress,
                randomDestinationDomainId,
                observationsData,
                randomToken0,
                randomToken1,
                randomFee
              );
            });

            it('should emit DataSent', async () => {
              let observationData0 = [lastBlockTimestampBridged, arithmeticMeanTick0];
              let observationData1 = [blockTimestamp1, arithmeticMeanTick1];
              let observationData2 = [blockTimestamp2, arithmeticMeanTick2];
              let observationsData = [observationData0, observationData1, observationData2];
              let tx = await dataFeed.sendObservations(
                connextSenderAdapter.address,
                randomChainId,
                randomToken0,
                randomToken1,
                randomFee,
                secondsAgos
              );
              let eventBridgeSenderAdapter = await readArgFromEvent(tx, 'DataSent', '_bridgeSenderAdapter');
              let eventDataReceiver = await readArgFromEvent(tx, 'DataSent', '_dataReceiver');
              let eventDestinationDomainId = await readArgFromEvent(tx, 'DataSent', '_destinationDomainId');
              let eventObservationsData = await readArgFromEvent(tx, 'DataSent', '_observationsData');
              expect(eventBridgeSenderAdapter).to.eq(connextSenderAdapter.address);
              expect(eventDataReceiver).to.eq(randomDataReceiverAddress);
              expect(eventDestinationDomainId).to.eq(randomDestinationDomainId);
              expect(eventObservationsData).to.eql(observationsData);
            });
          });
        });
      });
    });
  });

  describe('fetchObservations(...)', () => {
    let secondsNow: number;
    let secondsAgo = 30;
    let delta1 = 20;
    let delta2 = 10;
    let secondsAgos = [secondsAgo, secondsAgo - delta1, secondsAgo - (delta1 + delta2)];
    let blockTimestamp1: number;
    let blockTimestamp2: number;
    let tickCumulative = 3000;
    let tickCumulativesDelta1: number;
    let tickCumulativesDelta2: number;
    let tickCumulatives: number[];
    let arithmeticMeanTick1: number;
    let arithmeticMeanTick2: number;
    const stitch = true;

    it('should revert if secondsAgos is unsorted', async () => {
      let secondsAgos = [secondsAgo - (delta1 + delta2), secondsAgo - delta1, secondsAgo];
      let tickCumulatives = [0, 0, 0];
      uniswapV3Pool.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
      await expect(dataFeed.fetchObservations(uniswapV3Pool.address, secondsAgos, stitch)).to.be.reverted;
    });

    it('should revert if secondsAgos has a repeated input', async () => {
      let secondsAgos = [secondsAgo, secondsAgo];
      let tickCumulatives = [0, 0];
      uniswapV3Pool.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
      await expect(dataFeed.fetchObservations(uniswapV3Pool.address, secondsAgos, stitch)).to.be.reverted;
    });

    context('when the oracle has no data', () => {
      beforeEach(async () => {
        secondsNow = (await ethers.provider.getBlock('latest')).timestamp;
        blockTimestamp1 = secondsNow - secondsAgos[0];
        blockTimestamp2 = secondsNow - secondsAgos[1];
      });

      it('should revert if secondsAgos provides insufficient datapoints', async () => {
        let secondsAgos = [secondsAgo];
        let tickCumulatives = [0];
        uniswapV3Pool.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
        await expect(dataFeed.fetchObservations(uniswapV3Pool.address, secondsAgos, stitch)).to.be.revertedWith('InvalidSecondsAgos()');
      });

      // arithmeticMeanTick = tickCumulativesDelta / delta
      context('when the arithmetic mean tick is truncated', () => {
        before(async () => {
          tickCumulativesDelta1 = 2000;
          tickCumulativesDelta2 = 1000;
          tickCumulatives = [
            tickCumulative,
            tickCumulative + tickCumulativesDelta1,
            tickCumulative + (tickCumulativesDelta1 + tickCumulativesDelta2),
          ];
          arithmeticMeanTick1 = Math.trunc(tickCumulativesDelta1 / delta1);
          arithmeticMeanTick2 = Math.trunc(tickCumulativesDelta2 / delta2);
          uniswapV3Pool.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
        });

        it('should return the observations data', async () => {
          let observationData1 = [blockTimestamp1, arithmeticMeanTick1];
          let observationData2 = [blockTimestamp2, arithmeticMeanTick2];
          let expectedObservationsData = [observationData1, observationData2];
          let [observationsData] = await dataFeed.fetchObservations(uniswapV3Pool.address, secondsAgos, stitch);
          expect(observationsData).to.eql(expectedObservationsData);
        });

        it('should return the last pool state', async () => {
          let lastBlockTimestamp = secondsNow - secondsAgos[2];
          let expectedLastPoolState = [lastBlockTimestamp, toBN(tickCumulatives[2]), arithmeticMeanTick2];
          let [, lastPoolState] = await dataFeed.fetchObservations(uniswapV3Pool.address, secondsAgos, stitch);
          expect(lastPoolState).to.eql(expectedLastPoolState);
        });
      });

      // arithmeticMeanTick = tickCumulativesDelta / delta
      context('when the arithmetic mean tick is rounded to negative infinity', () => {
        before(async () => {
          tickCumulativesDelta1 = -2001;
          tickCumulativesDelta2 = -1002;
          tickCumulatives = [
            tickCumulative,
            tickCumulative + tickCumulativesDelta1,
            tickCumulative + (tickCumulativesDelta1 + tickCumulativesDelta2),
          ];
          arithmeticMeanTick1 = Math.floor(tickCumulativesDelta1 / delta1);
          arithmeticMeanTick2 = Math.floor(tickCumulativesDelta2 / delta2);
          uniswapV3Pool.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
        });

        it('should return the observations data', async () => {
          let observationData1 = [blockTimestamp1, arithmeticMeanTick1];
          let observationData2 = [blockTimestamp2, arithmeticMeanTick2];
          let expectedObservationsData = [observationData1, observationData2];
          let [observationsData] = await dataFeed.fetchObservations(uniswapV3Pool.address, secondsAgos, stitch);
          expect(observationsData).to.eql(expectedObservationsData);
        });

        it('should return the last pool state', async () => {
          let lastBlockTimestamp = secondsNow - secondsAgos[2];
          let expectedLastPoolState = [lastBlockTimestamp, toBN(tickCumulatives[2]), arithmeticMeanTick2];
          let [, lastPoolState] = await dataFeed.fetchObservations(uniswapV3Pool.address, secondsAgos, stitch);
          expect(lastPoolState).to.eql(expectedLastPoolState);
        });
      });
    });

    context('when the oracle has data', () => {
      let delta0: number;
      let lastBlockTimestampBridged: number;
      let lastTickCumulativeBridged: number;
      let lastArithmeticMeanTickBridged = 200;
      let tickCumulativesDelta0: number;
      let arithmeticMeanTick0: number;

      beforeEach(async () => {
        secondsNow = (await ethers.provider.getBlock('latest')).timestamp;
        lastBlockTimestampBridged = secondsNow - secondsAgo - delta0;
        lastTickCumulativeBridged = tickCumulative - tickCumulativesDelta0;
        blockTimestamp1 = secondsNow - secondsAgos[0];
        blockTimestamp2 = secondsNow - secondsAgos[1];
        await dataFeed.setVariable('lastPoolStateBridged', {
          blockTimestamp: lastBlockTimestampBridged,
          tickCumulative: lastTickCumulativeBridged,
          //arithmeticMeanTick: lastArithmeticMeanTickBridged,
        });
      });

      context('when the data to be fetched is old compared with that of the oracle', () => {
        before(async () => {
          delta0 = -40;
          tickCumulativesDelta0 = 8000;
          tickCumulatives = [0, 0, 0];
          uniswapV3Pool.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
        });

        it('should revert', async () => {
          await expect(dataFeed.fetchObservations(uniswapV3Pool.address, secondsAgos, stitch)).to.be.reverted;
        });
      });

      context('when the data to be fetched is continuous with that of the oracle', () => {
        before(async () => {
          delta0 = 0;
          tickCumulativesDelta0 = 0;
          tickCumulatives = [0, 0, 0];
          uniswapV3Pool.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
        });

        it('should revert', async () => {
          await expect(dataFeed.fetchObservations(uniswapV3Pool.address, secondsAgos, stitch)).to.be.reverted;
        });
      });

      context('when the data to be fetched is discontinuous with that of the oracle', () => {
        before(async () => {
          delta0 = 40;
          tickCumulativesDelta0 = 0;
        });

        it('should be able to fetch 1 datapoint', async () => {
          let secondsAgos = [secondsAgo];
          let tickCumulatives = [tickCumulative];
          uniswapV3Pool.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
          let [observationsData] = await dataFeed.fetchObservations(uniswapV3Pool.address, secondsAgos, stitch);
          expect(observationsData.length).to.eq(1);
        });

        // arithmeticMeanTick = tickCumulativesDelta / delta
        context('when the arithmetic mean tick is truncated', () => {
          before(async () => {
            tickCumulativesDelta0 = 4000;
            tickCumulativesDelta1 = 2000;
            tickCumulativesDelta2 = 1000;
            tickCumulatives = [
              tickCumulative,
              tickCumulative + tickCumulativesDelta1,
              tickCumulative + (tickCumulativesDelta1 + tickCumulativesDelta2),
            ];
            arithmeticMeanTick0 = Math.trunc(tickCumulativesDelta0 / delta0);
            arithmeticMeanTick1 = Math.trunc(tickCumulativesDelta1 / delta1);
            arithmeticMeanTick2 = Math.trunc(tickCumulativesDelta2 / delta2);
            uniswapV3Pool.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
          });

          it('should return the observations data', async () => {
            let observationData0 = [lastBlockTimestampBridged, arithmeticMeanTick0];
            let observationData1 = [blockTimestamp1, arithmeticMeanTick1];
            let observationData2 = [blockTimestamp2, arithmeticMeanTick2];
            let expectedObservationsData = [observationData0, observationData1, observationData2];
            let [observationsData] = await dataFeed.fetchObservations(uniswapV3Pool.address, secondsAgos, stitch);
            expect(observationsData).to.eql(expectedObservationsData);
          });

          it('should return the last pool state', async () => {
            let lastBlockTimestamp = secondsNow - secondsAgos[2];
            let expectedLastPoolState = [lastBlockTimestamp, toBN(tickCumulatives[2]), arithmeticMeanTick2];
            let [, lastPoolState] = await dataFeed.fetchObservations(uniswapV3Pool.address, secondsAgos, stitch);
            expect(lastPoolState).to.eql(expectedLastPoolState);
          });
        });

        // arithmeticMeanTick = tickCumulativesDelta / delta
        context('when the arithmetic mean tick is rounded to negative infinity', () => {
          before(async () => {
            tickCumulativesDelta0 = -4001;
            tickCumulativesDelta1 = -2001;
            tickCumulativesDelta2 = -1002;
            tickCumulatives = [
              tickCumulative,
              tickCumulative + tickCumulativesDelta1,
              tickCumulative + (tickCumulativesDelta1 + tickCumulativesDelta2),
            ];
            arithmeticMeanTick0 = Math.floor(tickCumulativesDelta0 / delta0);
            arithmeticMeanTick1 = Math.floor(tickCumulativesDelta1 / delta1);
            arithmeticMeanTick2 = Math.floor(tickCumulativesDelta2 / delta2);
            uniswapV3Pool.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
          });

          it('should return the observations data', async () => {
            let observationData0 = [lastBlockTimestampBridged, arithmeticMeanTick0];
            let observationData1 = [blockTimestamp1, arithmeticMeanTick1];
            let observationData2 = [blockTimestamp2, arithmeticMeanTick2];
            let expectedObservationsData = [observationData0, observationData1, observationData2];
            let [observationsData] = await dataFeed.fetchObservations(uniswapV3Pool.address, secondsAgos, stitch);
            expect(observationsData).to.eql(expectedObservationsData);
          });

          it('should return the last pool state', async () => {
            let lastBlockTimestamp = secondsNow - secondsAgos[2];
            let expectedLastPoolState = [lastBlockTimestamp, toBN(tickCumulatives[2]), arithmeticMeanTick2];
            let [, lastPoolState] = await dataFeed.fetchObservations(uniswapV3Pool.address, secondsAgos, stitch);
            expect(lastPoolState).to.eql(expectedLastPoolState);
          });
        });
      });
    });
  });

  describe('fetchObservationsIndices(...)', () => {
    let time: number;
    let secondsAgos = [50, 40, 30, 20, 10, 0];
    let secondsAgo = secondsAgos[0];
    let blockTimestamp: number;
    let observationIndex = Math.ceil(secondsAgos.length / 2) - 1;
    let observationCardinality: number;
    let expectedObservationsIndices: number[] = [];

    it('should revert if the pool is not initialized', async () => {
      let observationCardinality = 0;
      uniswapV3Pool.slot0.returns([0, 0, observationIndex, observationCardinality, 0, 0, 0]);
      await expect(dataFeed.fetchObservationsIndices(uniswapV3Pool.address, secondsAgos)).to.be.revertedWith('I()');
    });

    context('when the pool is initialized', () => {
      let i: number;
      let j: number;

      beforeEach(async () => {
        time = (await ethers.provider.getBlock('latest')).timestamp;
        i = 0;
        j = 0;
        for (i; i < secondsAgos.length; ++i) {
          if (i % 2 == 0) {
            blockTimestamp = time - secondsAgos[i];
            uniswapV3Pool.observations.whenCalledWith(j).returns([blockTimestamp, 0, 0, true]);
            expectedObservationsIndices[i] = j;
          } else {
            expectedObservationsIndices[i] = j++;
          }
        }
      });

      context('when each observation is initialized', () => {
        before(async () => {
          observationCardinality = observationIndex + 1;
          uniswapV3Pool.slot0.returns([0, 0, observationIndex, observationCardinality, 0, 0, 0]);
        });

        it('should revert if secondsAgos is too old', async () => {
          let secondsAgos = [secondsAgo + 1];
          await expect(dataFeed.fetchObservationsIndices(uniswapV3Pool.address, secondsAgos)).to.be.revertedWith('OLD()');
        });

        it('should return the observations indices', async () => {
          let observationsIndices = await dataFeed.fetchObservationsIndices(uniswapV3Pool.address, secondsAgos);
          expect(observationsIndices).to.eql(expectedObservationsIndices);
        });
      });

      context('when the last observations are not initialized', () => {
        before(async () => {
          observationCardinality = observationIndex + 4;
          uniswapV3Pool.slot0.returns([0, 0, observationIndex, observationCardinality, 0, 0, 0]);
          for (i = observationIndex + 1; i < observationCardinality; ++i) {
            uniswapV3Pool.observations.whenCalledWith(i).returns([0, 0, 0, false]);
          }
        });

        it('should revert if secondsAgos is too old', async () => {
          let secondsAgos = [secondsAgo + 1];
          await expect(dataFeed.fetchObservationsIndices(uniswapV3Pool.address, secondsAgos)).to.be.revertedWith('OLD()');
        });

        it('should return the observations indices', async () => {
          let observationsIndices = await dataFeed.fetchObservationsIndices(uniswapV3Pool.address, secondsAgos);
          expect(observationsIndices).to.eql(expectedObservationsIndices);
        });
      });
    });
  });

  describe('whitelistAdapter', () => {
    onlyGovernance(
      () => dataFeed,
      'whitelistAdapter',
      () => governance,
      () => [connextSenderAdapter.address, true]
    );
    it('should whitelist the connext adapter', async () => {
      await dataFeed.connect(governance).whitelistAdapter(connextSenderAdapter.address, true);
      expect(await dataFeed.whitelistedAdapters(connextSenderAdapter.address)).to.eq(true);
    });

    it('should remove whitelist from the connext adapter', async () => {
      await dataFeed.connect(governance).whitelistAdapter(connextSenderAdapter.address, true);
      await dataFeed.connect(governance).whitelistAdapter(connextSenderAdapter.address, false);
      expect(await dataFeed.whitelistedAdapters(connextSenderAdapter.address)).to.eq(false);
    });

    it('should emit an event when adapter is whitelisted', async () => {
      await expect(await dataFeed.connect(governance).whitelistAdapter(connextSenderAdapter.address, true))
        .to.emit(dataFeed, 'AdapterWhitelisted')
        .withArgs(connextSenderAdapter.address, true);
    });

    it('should emit an event when adapter whitelist is revoked', async () => {
      await dataFeed.connect(governance).whitelistAdapter(connextSenderAdapter.address, true);
      await expect(await dataFeed.connect(governance).whitelistAdapter(connextSenderAdapter.address, false))
        .to.emit(dataFeed, 'AdapterWhitelisted')
        .withArgs(connextSenderAdapter.address, false);
    });
  });

  describe('whitelistAdapters', () => {
    onlyGovernance(
      () => dataFeed,
      'whitelistAdapters',
      () => governance,
      () => [
        [connextSenderAdapter.address, fakeAdapter.address],
        [true, true],
      ]
    );

    it('should revert if the lengths of the arguments dont match', async () => {
      await expect(
        dataFeed.connect(governance).whitelistAdapters([connextSenderAdapter.address, fakeAdapter.address], [true])
      ).to.be.revertedWith('LengthMismatch()');

      await expect(dataFeed.connect(governance).whitelistAdapters([connextSenderAdapter.address], [true, true])).to.be.revertedWith(
        'LengthMismatch()'
      );
    });

    it('should whitelist the adapters', async () => {
      await dataFeed.connect(governance).whitelistAdapters([connextSenderAdapter.address, fakeAdapter.address], [true, true]);
      expect(await dataFeed.whitelistedAdapters(connextSenderAdapter.address)).to.eq(true);
      expect(await dataFeed.whitelistedAdapters(fakeAdapter.address)).to.eq(true);
    });

    it('should remove whitelist from the adapters', async () => {
      await dataFeed.connect(governance).whitelistAdapters([connextSenderAdapter.address, fakeAdapter.address], [true, true]);
      await dataFeed.connect(governance).whitelistAdapters([connextSenderAdapter.address, fakeAdapter.address], [false, false]);
      expect(await dataFeed.whitelistedAdapters(connextSenderAdapter.address)).to.eq(false);
      expect(await dataFeed.whitelistedAdapters(fakeAdapter.address)).to.eq(false);
    });

    it('should emit n events when n adapters are whitelisted', async () => {
      tx = await dataFeed.connect(governance).whitelistAdapters([connextSenderAdapter.address, fakeAdapter.address], [true, true]);
      await expect(tx).to.emit(dataFeed, 'AdapterWhitelisted').withArgs(connextSenderAdapter.address, true);

      await expect(tx).to.emit(dataFeed, 'AdapterWhitelisted').withArgs(fakeAdapter.address, true);
    });

    it('should emit n events when n adapters whitelists are revoked', async () => {
      tx = await dataFeed.connect(governance).whitelistAdapters([connextSenderAdapter.address, fakeAdapter.address], [false, false]);

      await dataFeed.connect(governance).whitelistAdapters([connextSenderAdapter.address, fakeAdapter.address], [true, true]);
      await expect(tx).to.emit(dataFeed, 'AdapterWhitelisted').withArgs(connextSenderAdapter.address, false);

      await expect(tx).to.emit(dataFeed, 'AdapterWhitelisted').withArgs(fakeAdapter.address, false);
    });
  });

  describe('setReceiver', () => {
    onlyGovernance(
      () => dataFeed,
      'setReceiver',
      () => governance,
      () => [connextSenderAdapter.address, randomDestinationDomainId, randomDataReceiverAddress]
    );

    it('should set a receiver', async () => {
      await dataFeed.connect(governance).setReceiver(connextSenderAdapter.address, randomDestinationDomainId, randomDataReceiverAddress);
      expect(await dataFeed.receivers(connextSenderAdapter.address, randomDestinationDomainId)).to.eq(randomDataReceiverAddress);
    });

    it('should emit an event when a receiver is set', async () => {
      await expect(
        await dataFeed.connect(governance).setReceiver(connextSenderAdapter.address, randomDestinationDomainId, randomDataReceiverAddress)
      )
        .to.emit(dataFeed, 'ReceiverSet')
        .withArgs(connextSenderAdapter.address, randomDestinationDomainId, randomDataReceiverAddress);
    });
  });

  describe('setReceivers', () => {
    let validArgs: [string[], number[], string[]];

    before(() => {
      validArgs = [
        [connextSenderAdapter.address, fakeAdapter.address],
        [randomDestinationDomainId, randomDestinationDomainId],
        [randomDataReceiverAddress, randomDataReceiverAddress2],
      ];
    });

    onlyGovernance(
      () => dataFeed,
      'setReceivers',
      () => governance,
      () => [
        [connextSenderAdapter.address, fakeAdapter.address],
        [randomDestinationDomainId, randomDestinationDomainId],
        [randomDataReceiverAddress, randomDataReceiverAddress2],
      ]
    );

    it('should revert if the lengths of the arguments dont match', async () => {
      const mismatchedArgs = [
        [connextSenderAdapter.address, fakeAdapter.address],
        [randomDestinationDomainId, randomDestinationDomainId],
        [randomDataReceiverAddress],
      ];

      const mismatchedArgs2 = [
        [connextSenderAdapter.address, fakeAdapter.address],
        [randomDestinationDomainId],
        [randomDataReceiverAddress, randomDataReceiverAddress2],
      ];

      const mismatchedArgs3 = [
        [connextSenderAdapter.address],
        [randomDestinationDomainId, randomDestinationDomainId],
        [randomDataReceiverAddress, randomDataReceiverAddress2],
      ];

      await expect(dataFeed.connect(governance).setReceivers(...mismatchedArgs)).to.be.revertedWith('LengthMismatch()');

      await expect(dataFeed.connect(governance).setReceivers(...mismatchedArgs2)).to.be.revertedWith('LengthMismatch()');

      await expect(dataFeed.connect(governance).setReceivers(...mismatchedArgs3)).to.be.revertedWith('LengthMismatch()');
    });

    it('should set the receivers', async () => {
      await dataFeed.connect(governance).setReceivers(...validArgs);
      expect(await dataFeed.receivers(connextSenderAdapter.address, randomDestinationDomainId)).to.eq(randomDataReceiverAddress);
      expect(await dataFeed.receivers(fakeAdapter.address, randomDestinationDomainId)).to.eq(randomDataReceiverAddress2);
    });

    it('should emit n events when n receivers are set', async () => {
      tx = await dataFeed.connect(governance).setReceivers(...validArgs);
      await expect(tx)
        .to.emit(dataFeed, 'ReceiverSet')
        .withArgs(connextSenderAdapter.address, randomDestinationDomainId, randomDataReceiverAddress);

      await expect(tx).to.emit(dataFeed, 'ReceiverSet').withArgs(fakeAdapter.address, randomDestinationDomainId, randomDataReceiverAddress2);
    });
  });

  describe('setDestinationDomainId', () => {
    onlyGovernance(
      () => dataFeed,
      'setDestinationDomainId',
      () => governance,
      () => [connextSenderAdapter.address, randomChainId, randomDestinationDomainId]
    );

    it('should set a destination domain id', async () => {
      await dataFeed.connect(governance).setDestinationDomainId(connextSenderAdapter.address, randomChainId, randomDestinationDomainId);
      expect(await dataFeed.destinationDomainIds(connextSenderAdapter.address, randomChainId)).to.eq(randomDestinationDomainId);
    });

    it('should emit an event when a destination domain id is set', async () => {
      await expect(
        await dataFeed.connect(governance).setDestinationDomainId(connextSenderAdapter.address, randomChainId, randomDestinationDomainId)
      )
        .to.emit(dataFeed, 'DestinationDomainIdSet')
        .withArgs(connextSenderAdapter.address, randomChainId, randomDestinationDomainId);
    });
  });

  describe('setDestinationDomainIds', () => {
    let validArgs: [string[], number[], number[]];

    before(async () => {
      validArgs = [
        [connextSenderAdapter.address, fakeAdapter.address],
        [randomChainId, randomChainId2],
        [randomDestinationDomainId, randomDestinationDomainId2],
      ];
    });

    onlyGovernance(
      () => dataFeed,
      'setDestinationDomainIds',
      () => governance,
      () => [
        [connextSenderAdapter.address, fakeAdapter.address],
        [randomChainId, randomChainId2],
        [randomDestinationDomainId, randomDestinationDomainId2],
      ]
    );

    it('should revert if the lengths of the arguments dont match', async () => {
      const mismatchedArgs = [[connextSenderAdapter.address, fakeAdapter.address], [randomChainId, randomChainId2], [randomDestinationDomainId]];

      const mismatchedArgs2 = [
        [connextSenderAdapter.address, fakeAdapter.address],
        [randomChainId],
        [randomDestinationDomainId, randomDestinationDomainId2],
      ];

      const mismatchedArgs3 = [
        [connextSenderAdapter.address],
        [randomChainId, randomChainId2],
        [randomDestinationDomainId, randomDestinationDomainId2],
      ];

      await expect(dataFeed.connect(governance).setDestinationDomainIds(...mismatchedArgs)).to.be.revertedWith('LengthMismatch()');

      await expect(dataFeed.connect(governance).setDestinationDomainIds(...mismatchedArgs2)).to.be.revertedWith('LengthMismatch()');

      await expect(dataFeed.connect(governance).setDestinationDomainIds(...mismatchedArgs3)).to.be.revertedWith('LengthMismatch()');
    });

    it('should set the destination domain ids', async () => {
      await dataFeed.connect(governance).setDestinationDomainIds(...validArgs);
      expect(await dataFeed.destinationDomainIds(connextSenderAdapter.address, randomChainId)).to.eq(randomDestinationDomainId);
      expect(await dataFeed.destinationDomainIds(fakeAdapter.address, randomChainId2)).to.eq(randomDestinationDomainId2);
    });

    it('should emit n events when n destination domains are set', async () => {
      tx = await dataFeed.connect(governance).setDestinationDomainIds(...validArgs);
      await expect(tx)
        .to.emit(dataFeed, 'DestinationDomainIdSet')
        .withArgs(connextSenderAdapter.address, randomChainId, randomDestinationDomainId);

      await expect(tx).to.emit(dataFeed, 'DestinationDomainIdSet').withArgs(fakeAdapter.address, randomChainId2, randomDestinationDomainId2);
    });
  });
});
