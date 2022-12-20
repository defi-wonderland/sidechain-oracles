import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { DataFeed, DataFeed__factory, IUniswapV3Pool, IConnextSenderAdapter } from '@typechained';
import { smock, MockContract, MockContractFactory, FakeContract } from '@defi-wonderland/smock';
import { evm, wallet } from '@utils';
import { ZERO_ADDRESS, UNI_FACTORY, POOL_INIT_CODE_HASH, VALID_POOL_SALT } from '@utils/constants';
import { toUnit } from '@utils/bn';
import { readArgFromEvent } from '@utils/event-utils';
import { onlyGovernor, onlyStrategy } from '@utils/behaviours';
import { getCreate2Address, getObservedHash } from '@utils/misc';
import chai, { expect } from 'chai';

chai.use(smock.matchers);

describe('DataFeed.sol', () => {
  let governor: SignerWithAddress;
  let strategy: SignerWithAddress;
  let dataFeed: MockContract<DataFeed>;
  let dataFeedFactory: MockContractFactory<DataFeed__factory>;
  let connextSenderAdapter: FakeContract<IConnextSenderAdapter>;
  let uniswapV3Pool: FakeContract<IUniswapV3Pool>;
  let snapshotId: string;

  const randomAddress = wallet.generateRandomAddress();
  const randomDataReceiverAddress = wallet.generateRandomAddress();
  const randomDestinationDomainId = 3;
  const randomChainId = 32;
  const randomChainId2 = 22;
  const randomSalt = VALID_POOL_SALT;

  const nonce = 1;

  before(async () => {
    [, governor, strategy] = await ethers.getSigners();

    connextSenderAdapter = await smock.fake('IConnextSenderAdapter');

    uniswapV3Pool = await smock.fake('IUniswapV3Pool', {
      address: getCreate2Address(UNI_FACTORY, randomSalt, POOL_INIT_CODE_HASH),
    });

    dataFeedFactory = await smock.mock('DataFeed');

    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
    dataFeed = await dataFeedFactory.deploy(governor.address, strategy.address);
  });

  describe('constructor(...)', () => {
    it('should set the governor', async () => {
      expect(await dataFeed.governor()).to.eq(governor.address);
    });

    it('should set the strategy', async () => {
      expect(await dataFeed.strategy()).to.eq(strategy.address);
    });
  });

  describe('sendObservations(...)', () => {
    let observationData0 = [500000, 50];
    let observationData1 = [1000000, 100];
    let observationData2 = [3000000, 300];
    let observationsData = [observationData0, observationData1, observationData2];
    const fee = toUnit(0.1);

    beforeEach(async () => {
      await dataFeed.connect(governor).whitelistPipeline(randomChainId, randomSalt);
      await dataFeed.connect(governor).whitelistAdapter(connextSenderAdapter.address, true);
      await dataFeed.connect(governor).setDestinationDomainId(connextSenderAdapter.address, randomChainId, randomDestinationDomainId);
      await dataFeed.connect(governor).setReceiver(connextSenderAdapter.address, randomDestinationDomainId, randomDataReceiverAddress);
      connextSenderAdapter.bridgeObservations.reset();
    });

    it('should revert if the pipeline is not whitelisted', async () => {
      await expect(
        dataFeed.sendObservations(connextSenderAdapter.address, randomChainId2, randomSalt, nonce, observationsData)
      ).to.be.revertedWith('UnallowedPipeline()');
    });

    it('should revert if the nonce is lower than the whitelisted nonce', async () => {
      await expect(
        dataFeed.sendObservations(connextSenderAdapter.address, randomChainId, randomSalt, nonce - 1, observationsData)
      ).to.be.revertedWith('WrongNonce()');
    });

    it('should revert if the hash is unknown', async () => {
      await expect(
        dataFeed.sendObservations(connextSenderAdapter.address, randomChainId, randomSalt, nonce, observationsData)
      ).to.be.revertedWith('UnknownHash()');
    });

    context('when the hash is valid', () => {
      const hash = getObservedHash(randomSalt, nonce, observationsData);

      beforeEach(async () => {
        await dataFeed.setVariable('_observedKeccak', { [hash]: true });
      });

      it('should call bridgeObservations with the correct arguments', async () => {
        await dataFeed.sendObservations(connextSenderAdapter.address, randomChainId, randomSalt, nonce, observationsData);
        expect(connextSenderAdapter.bridgeObservations).to.have.been.calledOnceWith(
          randomDataReceiverAddress,
          randomDestinationDomainId,
          observationsData,
          randomSalt,
          nonce
        );
      });

      it('should route msg.value to the bridge sender adapter', async () => {
        await dataFeed.sendObservations(connextSenderAdapter.address, randomChainId, randomSalt, nonce, observationsData, { value: fee });
        expect(connextSenderAdapter.bridgeObservations).to.have.been.calledWithValue(fee);
      });

      it('should emit DataBroadcast', async () => {
        const tx = await dataFeed.sendObservations(connextSenderAdapter.address, randomChainId, randomSalt, nonce, observationsData);
        let eventPoolSalt = await readArgFromEvent(tx, 'DataBroadcast', '_poolSalt');
        let eventPoolNonce = await readArgFromEvent(tx, 'DataBroadcast', '_poolNonce');
        let eventChainId = await readArgFromEvent(tx, 'DataBroadcast', '_chainId');
        let eventDataReceiver = await readArgFromEvent(tx, 'DataBroadcast', '_dataReceiver');
        let eventBridgeSenderAdapter = await readArgFromEvent(tx, 'DataBroadcast', '_bridgeSenderAdapter');

        expect(eventPoolSalt).to.eq(randomSalt);
        expect(eventPoolNonce).to.eq(nonce);
        expect(eventChainId).to.eq(randomChainId);
        expect(eventDataReceiver).to.eq(randomDataReceiverAddress);
        expect(eventBridgeSenderAdapter).to.eq(connextSenderAdapter.address);
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
    let observationData1: number[];
    let observationData2: number[];
    let observationsData: number[][];

    onlyStrategy(
      () => dataFeed,
      'fetchObservations',
      () => strategy,
      () => [randomSalt, secondsAgos]
    );

    it('should revert if the pool is not whitelisted', async () => {
      await expect(dataFeed.connect(strategy).fetchObservations(randomSalt, secondsAgos)).to.be.revertedWith('UnallowedPool()');
    });

    context('when the pool is whitelisted', () => {
      beforeEach(async () => {
        await dataFeed.connect(governor).whitelistPipeline(randomChainId, randomSalt);
      });

      it('should revert if secondsAgos is unsorted', async () => {
        let secondsAgos = [secondsAgo - (delta1 + delta2), secondsAgo - delta1, secondsAgo];
        let tickCumulatives = [0, 0, 0];
        uniswapV3Pool.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
        await expect(dataFeed.connect(strategy).fetchObservations(randomSalt, secondsAgos)).to.be.revertedWith(
          'VM Exception while processing transaction: reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)'
        );
      });

      it('should revert if secondsAgos has a repeated input', async () => {
        let secondsAgos = [secondsAgo, secondsAgo];
        let tickCumulatives = [0, 0];
        uniswapV3Pool.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
        await expect(dataFeed.connect(strategy).fetchObservations(randomSalt, secondsAgos)).to.be.revertedWith(
          'VM Exception while processing transaction: reverted with panic code 0x12 (Division or modulo division by zero)'
        );
      });

      context('when the oracle has no data', () => {
        const nonce = 1;

        beforeEach(async () => {
          secondsNow = (await ethers.provider.getBlock('latest')).timestamp + 1;
          blockTimestamp1 = secondsNow - secondsAgos[0];
          blockTimestamp2 = secondsNow - secondsAgos[1];
        });

        it('should revert if secondsAgos provides insufficient datapoints', async () => {
          let secondsAgos = [secondsAgo];
          let tickCumulatives = [0];
          uniswapV3Pool.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
          await expect(dataFeed.connect(strategy).fetchObservations(randomSalt, secondsAgos)).to.be.revertedWith('InvalidSecondsAgos()');
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

          it('should update lastPoolStateObserved', async () => {
            await dataFeed.connect(strategy).fetchObservations(randomSalt, secondsAgos);

            let lastBlockTimestampObserved = secondsNow - secondsAgos[2];
            let lastPoolStateObserved = await dataFeed.lastPoolStateObserved(randomSalt);

            expect(lastPoolStateObserved.poolNonce).to.eq(nonce);
            expect(lastPoolStateObserved.blockTimestamp).to.eq(lastBlockTimestampObserved);
            expect(lastPoolStateObserved.tickCumulative).to.eq(tickCumulatives[2]);
            expect(lastPoolStateObserved.arithmeticMeanTick).to.eq(arithmeticMeanTick2);
          });

          it('should update _observedKeccak', async () => {
            await dataFeed.connect(strategy).fetchObservations(randomSalt, secondsAgos);

            observationData1 = [blockTimestamp1, arithmeticMeanTick1];
            observationData2 = [blockTimestamp2, arithmeticMeanTick2];
            observationsData = [observationData1, observationData2];

            const hash = getObservedHash(randomSalt, nonce, observationsData);

            let observedKeccak = await dataFeed.getVariable('_observedKeccak', [hash]);
            expect(observedKeccak).to.eq(true);
          });

          it('should emit PoolObserved', async () => {
            observationData1 = [blockTimestamp1, arithmeticMeanTick1];
            observationData2 = [blockTimestamp2, arithmeticMeanTick2];
            observationsData = [observationData1, observationData2];

            const tx = await dataFeed.connect(strategy).fetchObservations(randomSalt, secondsAgos);
            let eventPoolSalt = await readArgFromEvent(tx, 'PoolObserved', '_poolSalt');
            let eventPoolNonce = await readArgFromEvent(tx, 'PoolObserved', '_poolNonce');
            let eventObservationsData = await readArgFromEvent(tx, 'PoolObserved', '_observationsData');

            expect(eventPoolSalt).to.eq(randomSalt);
            expect(eventPoolNonce).to.eq(nonce);
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

          it('should update lastPoolStateObserved', async () => {
            await dataFeed.connect(strategy).fetchObservations(randomSalt, secondsAgos);

            let lastBlockTimestampObserved = secondsNow - secondsAgos[2];
            let lastPoolStateObserved = await dataFeed.lastPoolStateObserved(randomSalt);

            expect(lastPoolStateObserved.poolNonce).to.eq(nonce);
            expect(lastPoolStateObserved.blockTimestamp).to.eq(lastBlockTimestampObserved);
            expect(lastPoolStateObserved.tickCumulative).to.eq(tickCumulatives[2]);
            expect(lastPoolStateObserved.arithmeticMeanTick).to.eq(arithmeticMeanTick2);
          });

          it('should update _observedKeccak', async () => {
            await dataFeed.connect(strategy).fetchObservations(randomSalt, secondsAgos);

            observationData1 = [blockTimestamp1, arithmeticMeanTick1];
            observationData2 = [blockTimestamp2, arithmeticMeanTick2];
            observationsData = [observationData1, observationData2];

            const hash = getObservedHash(randomSalt, nonce, observationsData);

            let observedKeccak = await dataFeed.getVariable('_observedKeccak', [hash]);
            expect(observedKeccak).to.eq(true);
          });

          it('should emit PoolObserved', async () => {
            observationData1 = [blockTimestamp1, arithmeticMeanTick1];
            observationData2 = [blockTimestamp2, arithmeticMeanTick2];
            observationsData = [observationData1, observationData2];

            const tx = await dataFeed.connect(strategy).fetchObservations(randomSalt, secondsAgos);
            let eventPoolSalt = await readArgFromEvent(tx, 'PoolObserved', '_poolSalt');
            let eventPoolNonce = await readArgFromEvent(tx, 'PoolObserved', '_poolNonce');
            let eventObservationsData = await readArgFromEvent(tx, 'PoolObserved', '_observationsData');

            expect(eventPoolSalt).to.eq(randomSalt);
            expect(eventPoolNonce).to.eq(nonce);
            expect(eventObservationsData).to.eql(observationsData);
          });
        });
      });

      context('when the oracle has data', () => {
        let delta0: number;
        let lastBlockTimestampObserved: number;
        let lastTickCumulativeObserved: number;
        let lastArithmeticMeanTickObserved = 200;
        let lastPoolNonceObserved = 20;
        let tickCumulativesDelta0: number;
        let arithmeticMeanTick0: number;
        let observationData0: number[];

        beforeEach(async () => {
          secondsNow = (await ethers.provider.getBlock('latest')).timestamp + 1;
          lastBlockTimestampObserved = secondsNow - secondsAgo - delta0;
          lastTickCumulativeObserved = tickCumulative - tickCumulativesDelta0;
          blockTimestamp1 = secondsNow - secondsAgos[0];
          blockTimestamp2 = secondsNow - secondsAgos[1];
          await dataFeed.setVariable('lastPoolStateObserved', {
            [randomSalt]: {
              poolNonce: lastPoolNonceObserved,
              blockTimestamp: lastBlockTimestampObserved,
              tickCumulative: lastTickCumulativeObserved,
              arithmeticMeanTick: lastArithmeticMeanTickObserved,
            },
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
            await expect(dataFeed.connect(strategy).fetchObservations(randomSalt, secondsAgos)).to.be.revertedWith(
              'VM Exception while processing transaction: reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)'
            );
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
            await expect(dataFeed.connect(strategy).fetchObservations(randomSalt, secondsAgos)).to.be.revertedWith(
              'VM Exception while processing transaction: reverted with panic code 0x12 (Division or modulo division by zero)'
            );
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

            const tx = await dataFeed.connect(strategy).fetchObservations(randomSalt, secondsAgos);
            observationsData = (await readArgFromEvent(tx, 'PoolObserved', '_observationsData'))!;
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

            it('should update lastPoolStateObserved', async () => {
              await dataFeed.connect(strategy).fetchObservations(randomSalt, secondsAgos);

              lastBlockTimestampObserved = secondsNow - secondsAgos[2];
              let lastPoolStateObserved = await dataFeed.lastPoolStateObserved(randomSalt);

              expect(lastPoolStateObserved.poolNonce).to.eq(lastPoolNonceObserved + 1);
              expect(lastPoolStateObserved.blockTimestamp).to.eq(lastBlockTimestampObserved);
              expect(lastPoolStateObserved.tickCumulative).to.eq(tickCumulatives[2]);
              expect(lastPoolStateObserved.arithmeticMeanTick).to.eq(arithmeticMeanTick2);
            });

            it('should update _observedKeccak', async () => {
              await dataFeed.connect(strategy).fetchObservations(randomSalt, secondsAgos);

              observationData0 = [lastBlockTimestampObserved, arithmeticMeanTick0];
              observationData1 = [blockTimestamp1, arithmeticMeanTick1];
              observationData2 = [blockTimestamp2, arithmeticMeanTick2];
              observationsData = [observationData0, observationData1, observationData2];

              const hash = getObservedHash(randomSalt, lastPoolNonceObserved + 1, observationsData);

              let observedKeccak = await dataFeed.getVariable('_observedKeccak', [hash]);
              expect(observedKeccak).to.eq(true);
            });

            it('should emit PoolObserved', async () => {
              observationData0 = [lastBlockTimestampObserved, arithmeticMeanTick0];
              observationData1 = [blockTimestamp1, arithmeticMeanTick1];
              observationData2 = [blockTimestamp2, arithmeticMeanTick2];
              observationsData = [observationData0, observationData1, observationData2];

              const tx = await dataFeed.connect(strategy).fetchObservations(randomSalt, secondsAgos);
              let eventPoolSalt = await readArgFromEvent(tx, 'PoolObserved', '_poolSalt');
              let eventPoolNonce = await readArgFromEvent(tx, 'PoolObserved', '_poolNonce');
              let eventObservationsData = await readArgFromEvent(tx, 'PoolObserved', '_observationsData');

              expect(eventPoolSalt).to.eq(randomSalt);
              expect(eventPoolNonce).to.eq(lastPoolNonceObserved + 1);
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

            it('should update lastPoolStateObserved', async () => {
              await dataFeed.connect(strategy).fetchObservations(randomSalt, secondsAgos);

              lastBlockTimestampObserved = secondsNow - secondsAgos[2];
              let lastPoolStateObserved = await dataFeed.lastPoolStateObserved(randomSalt);

              expect(lastPoolStateObserved.poolNonce).to.eq(lastPoolNonceObserved + 1);
              expect(lastPoolStateObserved.blockTimestamp).to.eq(lastBlockTimestampObserved);
              expect(lastPoolStateObserved.tickCumulative).to.eq(tickCumulatives[2]);
              expect(lastPoolStateObserved.arithmeticMeanTick).to.eq(arithmeticMeanTick2);
            });

            it('should update _observedKeccak', async () => {
              await dataFeed.connect(strategy).fetchObservations(randomSalt, secondsAgos);

              observationData0 = [lastBlockTimestampObserved, arithmeticMeanTick0];
              observationData1 = [blockTimestamp1, arithmeticMeanTick1];
              observationData2 = [blockTimestamp2, arithmeticMeanTick2];
              observationsData = [observationData0, observationData1, observationData2];

              const hash = getObservedHash(randomSalt, lastPoolNonceObserved + 1, observationsData);

              let observedKeccak = await dataFeed.getVariable('_observedKeccak', [hash]);
              expect(observedKeccak).to.eq(true);
            });

            it('should emit PoolObserved', async () => {
              observationData0 = [lastBlockTimestampObserved, arithmeticMeanTick0];
              observationData1 = [blockTimestamp1, arithmeticMeanTick1];
              observationData2 = [blockTimestamp2, arithmeticMeanTick2];
              observationsData = [observationData0, observationData1, observationData2];

              const tx = await dataFeed.connect(strategy).fetchObservations(randomSalt, secondsAgos);
              let eventPoolSalt = await readArgFromEvent(tx, 'PoolObserved', '_poolSalt');
              let eventPoolNonce = await readArgFromEvent(tx, 'PoolObserved', '_poolNonce');
              let eventObservationsData = await readArgFromEvent(tx, 'PoolObserved', '_observationsData');

              expect(eventPoolSalt).to.eq(randomSalt);
              expect(eventPoolNonce).to.eq(lastPoolNonceObserved + 1);
              expect(eventObservationsData).to.eql(observationsData);
            });
          });
        });
      });
    });
  });

  describe('setStrategy(...)', () => {
    onlyGovernor(
      () => dataFeed,
      'setStrategy',
      () => governor,
      () => [randomAddress]
    );

    it('should revert if strategy is set to the zero address', async () => {
      await expect(dataFeed.connect(governor).setStrategy(ZERO_ADDRESS)).to.be.revertedWith('ZeroAddress()');
    });

    it('should update the strategy', async () => {
      await dataFeed.connect(governor).setStrategy(randomAddress);
      expect(await dataFeed.strategy()).to.eq(randomAddress);
    });

    it('should emit StrategySet', async () => {
      await expect(dataFeed.connect(governor).setStrategy(randomAddress)).to.emit(dataFeed, 'StrategySet').withArgs(randomAddress);
    });
  });
});
