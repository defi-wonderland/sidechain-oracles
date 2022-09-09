import { ethers } from 'hardhat';
import { ContractTransaction } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { DataFeed, DataFeed__factory, IUniswapV3Factory, IUniswapV3Pool, IConnextSenderAdapter, IOracleSidechain } from '@typechained';
import { smock, MockContract, MockContractFactory, FakeContract } from '@defi-wonderland/smock';
import { evm, wallet } from '@utils';
import { UNI_FACTORY } from '@utils/constants';
import { toBN } from '@utils/bn';
import { readArgFromEvent } from '@utils/event-utils';
import chai, { expect } from 'chai';

chai.use(smock.matchers);

describe('DataFeed.sol', () => {
  let governance: SignerWithAddress;
  let dataFeed: MockContract<DataFeed>;
  let dataFeedFactory: MockContractFactory<DataFeed__factory>;
  let connextSenderAdapter: FakeContract<IConnextSenderAdapter>;
  let uniswapV3Factory: FakeContract<IUniswapV3Factory>;
  let uniswapV3Pool: FakeContract<IUniswapV3Pool>;
  let tx: ContractTransaction;
  let snapshotId: string;

  const randomDataReceiverAddress = wallet.generateRandomAddress();
  const randomDestinationDomainId = 3;
  const randomChainId = 32;

  const randomToken0 = wallet.generateRandomAddress();
  const randomToken1 = wallet.generateRandomAddress();
  const randomFee = 3000;

  before(async () => {
    [, governance] = await ethers.getSigners();

    connextSenderAdapter = await smock.fake('IConnextSenderAdapter');
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
          ).to.be.revertedWith('VM Exception while processing transaction: reverted with panic code 0x12 (Division or modulo division by zero)');
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
});
