import { ethers } from 'hardhat';
import { BigNumber, ContractTransaction } from 'ethers';
import { JsonRpcSigner } from '@ethersproject/providers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import {
  DataFeed,
  DataFeedStrategy,
  StrategyJob,
  ConnextSenderAdapter,
  ConnextReceiverAdapter,
  DummyAdapterForTest,
  DataReceiver,
  OracleFactory,
  OracleSidechain,
  IOracleSidechain,
  ERC20,
} from '@typechained';
import { UniswapV3Factory, UniswapV3Pool, Keep3rV2 } from '@eth-sdk-types';
import { evm, wallet } from '@utils';
import { RANDOM_CHAIN_ID } from '@utils/constants';
import { toBN, toUnit } from '@utils/bn';
import { readArgFromEvent } from '@utils/event-utils';
import { calculateSalt } from '@utils/misc';
import { getNodeUrl } from 'utils/env';
import forkBlockNumber from './fork-block-numbers';
import {
  setupContracts,
  getEnvironment,
  getOLDEnvironment,
  getOracle,
  getSecondsAgos,
  observePool,
  calculateOracleObservations,
  uniswapV3Swap,
} from './common';
import { expect } from 'chai';

describe('@skip-on-coverage Data Bridging Flow', () => {
  let deployer: SignerWithAddress;
  let governor: SignerWithAddress;
  let keeper: JsonRpcSigner;
  let kp3rProxyGovernor: JsonRpcSigner;
  let keep3rV2: Keep3rV2;
  let uniswapV3Factory: UniswapV3Factory;
  let uniV3Pool: UniswapV3Pool;
  let tokenA: ERC20;
  let tokenB: ERC20;
  let fee: number;
  let salt: string;
  let dataFeed: DataFeed;
  let dataFeedStrategy: DataFeedStrategy;
  let strategyJob: StrategyJob;
  let connextSenderAdapter: ConnextSenderAdapter;
  let connextReceiverAdapter: ConnextReceiverAdapter;
  let dataReceiver: DataReceiver;
  let oracleFactory: OracleFactory;
  let oracleSidechain: OracleSidechain;
  let fetchTx: ContractTransaction;
  let broadcastTx: ContractTransaction;
  let snapshotId: string;

  const destinationDomain = 420;
  const nonce = 1;
  const connextFee = toUnit(0.1);

  const NONE_TRIGGER = 0;
  const TIME_TRIGGER = 1;
  const TWAP_TRIGGER = 2;
  const OLD_TRIGGER = 3;

  before(async () => {
    await evm.reset({
      jsonRpcUrl: getNodeUrl('ethereum'),
      blockNumber: forkBlockNumber.oracleSidechain,
    });

    ({ uniswapV3Factory, uniV3Pool, tokenA, tokenB, fee, keep3rV2, keeper, kp3rProxyGovernor } = await getEnvironment());

    salt = calculateSalt(tokenA.address, tokenB.address, fee);

    ({ deployer, governor, dataFeed, dataFeedStrategy, strategyJob, connextSenderAdapter, connextReceiverAdapter, dataReceiver, oracleFactory } =
      await setupContracts());

    ({ oracleSidechain } = await getOracle(oracleFactory.address, tokenA.address, tokenB.address, fee));

    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('observation bridging flow', () => {
    let dataFeedStrategySigner: JsonRpcSigner;
    let secondsAgos;
    let blockTimestamps: number[];
    let tickCumulatives: BigNumber[];
    let arithmeticMeanTicks: BigNumber[];
    let observationsFetched: IOracleSidechain.ObservationDataStructOutput[];
    let observationsIndex: number;
    let secondsPerLiquidityCumulativeX128s: BigNumber[];
    let swapAmount = toUnit(100);
    let now: number;
    const hours = 10_000;

    beforeEach(async () => {
      dataFeedStrategySigner = await wallet.impersonate(dataFeedStrategy.address);
      await wallet.setBalance(dataFeedStrategy.address, toUnit(10));
    });

    context('when the pool, pipeline, adapter, destination domain and receiver are set and whitelisted', () => {
      beforeEach(async () => {
        await dataFeed.connect(governor).whitelistPipeline(RANDOM_CHAIN_ID, salt);
        await dataFeed.connect(governor).whitelistAdapter(connextSenderAdapter.address, true);
        await dataFeed.connect(governor).setDestinationDomainId(connextSenderAdapter.address, RANDOM_CHAIN_ID, destinationDomain);
        await dataFeed.connect(governor).setReceiver(connextSenderAdapter.address, destinationDomain, connextReceiverAdapter.address);
        await dataReceiver.connect(governor).whitelistAdapter(connextReceiverAdapter.address, true);
      });

      context('when the oracle has no data', () => {
        beforeEach(async () => {
          /// @notice: creates a random swap to avoid cache
          await uniswapV3Swap(tokenB.address, swapAmount.add(Math.floor((Math.random() + 1) * 10e9)), tokenA.address, fee);
          await evm.advanceTimeAndBlock(1.5 * hours);
          now = (await ethers.provider.getBlock('latest')).timestamp;

          /// @notice: swap happens at now - 1.5 hours                         / here
          blockTimestamps = [now - 4 * hours, now - 3 * hours, now - 2 * hours, now - hours, now];

          ({ arithmeticMeanTicks } = await observePool(uniV3Pool, blockTimestamps, 0, toBN(0)));

          ({ secondsAgos } = await getSecondsAgos(blockTimestamps));

          fetchTx = await dataFeed.connect(dataFeedStrategySigner).fetchObservations(salt, secondsAgos);

          observationsFetched = (await readArgFromEvent(
            fetchTx,
            'PoolObserved',
            '_observationsData'
          )) as IOracleSidechain.ObservationDataStructOutput[];

          broadcastTx = await dataFeed.sendObservations(connextSenderAdapter.address, RANDOM_CHAIN_ID, salt, nonce, observationsFetched);
        });

        it('should fetch an amount of observations 1 lesser than amount of secondsAgos', async () => {
          expect(observationsFetched.length).to.eq(secondsAgos.length - 1);
          expect(observationsFetched[observationsFetched.length - 1].blockTimestamp).not.to.eq(0);
        });

        it('should bridge the data and add the observations correctly', async () => {
          ({ tickCumulatives, secondsPerLiquidityCumulativeX128s } = calculateOracleObservations(
            blockTimestamps,
            arithmeticMeanTicks,
            0,
            toBN(0),
            0,
            toBN(0),
            toBN(0)
          ));

          observationsIndex = 0;

          for (let i = 1; i < blockTimestamps.length; ++i) {
            let observation = await oracleSidechain.observations(observationsIndex++);

            expect(observation.blockTimestamp).to.eq(blockTimestamps[i - 1]);
            expect(observation.tickCumulative).to.eq(tickCumulatives[i]);
            expect(observation.secondsPerLiquidityCumulativeX128).to.eq(secondsPerLiquidityCumulativeX128s[i]);
            expect(observation.initialized).to.eq(true);
          }

          let tick = (await oracleSidechain.slot0()).tick;
          expect(tick).to.eq(arithmeticMeanTicks[arithmeticMeanTicks.length - 1]);
        });

        it('should keep consistency of tickCumulativesDelta between bridged observations', async () => {
          const sampleTimestamps = [now - 3 * hours, now];
          const sampleDelta = sampleTimestamps[1] - sampleTimestamps[0];

          ({ secondsAgos } = await getSecondsAgos(sampleTimestamps));

          let [poolTickCumulatives] = await uniV3Pool.callStatic.observe(secondsAgos);
          let [oracleTickCumulatives] = await oracleSidechain.callStatic.observe(secondsAgos);

          let poolTickCumulativesDelta = poolTickCumulatives[1].sub(poolTickCumulatives[0]);
          let oracleTickCumulativesDelta = oracleTickCumulatives[1].sub(oracleTickCumulatives[0]);

          // to have a max difference of 1 tick (as inconvenient rounding may apply): 1 tick * sampleDelta = sampleDelta
          expect(oracleTickCumulativesDelta).to.be.closeTo(poolTickCumulativesDelta, sampleDelta);
        });
      });

      context('when the oracle has data', () => {
        let lastBlockTimestampObserved: number;
        let lastTickCumulativeObserved: BigNumber;
        let lastArithmeticMeanTickObserved: BigNumber;
        let lastPoolNonceObserved = nonce;
        let lastBlockTimestamp: number;
        let lastTickCumulative: BigNumber;
        let lastSecondsPerLiquidityCumulativeX128: BigNumber;

        beforeEach(async () => {
          /// @notice: creates a random swap to avoid cache
          await uniswapV3Swap(tokenB.address, swapAmount.add(Math.floor((Math.random() + 1) * 10e9)), tokenA.address, fee);
          await evm.advanceTimeAndBlock(1.5 * hours);
          now = (await ethers.provider.getBlock('latest')).timestamp;

          /// @notice: swap happens at now - 1.5 hours                         / here
          blockTimestamps = [now - 4 * hours, now - 3 * hours, now - 2 * hours, now - hours, now];

          ({ tickCumulatives, arithmeticMeanTicks } = await observePool(uniV3Pool, blockTimestamps, 0, toBN(0)));

          lastBlockTimestampObserved = blockTimestamps[blockTimestamps.length - 1];
          lastTickCumulativeObserved = tickCumulatives[tickCumulatives.length - 1];
          lastArithmeticMeanTickObserved = arithmeticMeanTicks[arithmeticMeanTicks.length - 1];

          ({ tickCumulatives, secondsPerLiquidityCumulativeX128s } = calculateOracleObservations(
            blockTimestamps,
            arithmeticMeanTicks,
            0,
            toBN(0),
            0,
            toBN(0),
            toBN(0)
          ));

          observationsIndex = blockTimestamps.length - 1;
          lastBlockTimestamp = blockTimestamps[blockTimestamps.length - 2];
          lastTickCumulative = tickCumulatives[tickCumulatives.length - 1];
          lastSecondsPerLiquidityCumulativeX128 = secondsPerLiquidityCumulativeX128s[secondsPerLiquidityCumulativeX128s.length - 1];

          ({ secondsAgos } = await getSecondsAgos(blockTimestamps));

          fetchTx = await dataFeed.connect(dataFeedStrategySigner).fetchObservations(salt, secondsAgos);

          observationsFetched = (await readArgFromEvent(
            fetchTx,
            'PoolObserved',
            '_observationsData'
          )) as IOracleSidechain.ObservationDataStructOutput[];

          broadcastTx = await dataFeed.sendObservations(
            connextSenderAdapter.address,
            RANDOM_CHAIN_ID,
            salt,
            lastPoolNonceObserved,
            observationsFetched
          );

          await evm.advanceTimeAndBlock(4 * hours);
        });

        context('when the data to be fetched is discontinuous with that of the oracle', () => {
          beforeEach(async () => {
            blockTimestamps = [now + hours, now + 2 * hours, now + 4 * hours];

            ({ arithmeticMeanTicks } = await observePool(uniV3Pool, blockTimestamps, lastBlockTimestampObserved, lastTickCumulativeObserved));

            ({ secondsAgos } = await getSecondsAgos(blockTimestamps));

            fetchTx = await dataFeed.connect(dataFeedStrategySigner).fetchObservations(salt, secondsAgos);

            observationsFetched = (await readArgFromEvent(
              fetchTx,
              'PoolObserved',
              '_observationsData'
            )) as IOracleSidechain.ObservationDataStructOutput[];

            broadcastTx = await dataFeed.sendObservations(
              connextSenderAdapter.address,
              RANDOM_CHAIN_ID,
              salt,
              lastPoolNonceObserved + 1,
              observationsFetched
            );
          });

          it('should fetch an amount of observations equal to the amount of secondsAgos', async () => {
            expect(observationsFetched.length).to.eq(secondsAgos.length);
            expect(observationsFetched[observationsFetched.length - 1].blockTimestamp).not.to.eq(0);
          });

          it('should bridge the data and add the observations correctly', async () => {
            ({ tickCumulatives, secondsPerLiquidityCumulativeX128s } = calculateOracleObservations(
              blockTimestamps,
              arithmeticMeanTicks,
              lastBlockTimestampObserved,
              lastArithmeticMeanTickObserved,
              lastBlockTimestamp,
              lastTickCumulative,
              lastSecondsPerLiquidityCumulativeX128
            ));

            const stitchedObservation = await oracleSidechain.observations(observationsIndex++);

            expect(stitchedObservation.blockTimestamp).to.eq(lastBlockTimestampObserved);
            expect(stitchedObservation.tickCumulative).to.eq(tickCumulatives[0]);
            expect(stitchedObservation.secondsPerLiquidityCumulativeX128).to.eq(secondsPerLiquidityCumulativeX128s[0]);
            expect(stitchedObservation.initialized).to.eq(true);

            for (let i = 1; i < blockTimestamps.length; ++i) {
              let observation = await oracleSidechain.observations(observationsIndex++);

              expect(observation.blockTimestamp).to.eq(blockTimestamps[i - 1]);
              expect(observation.tickCumulative).to.eq(tickCumulatives[i]);
              expect(observation.secondsPerLiquidityCumulativeX128).to.eq(secondsPerLiquidityCumulativeX128s[i]);
              expect(observation.initialized).to.eq(true);
            }

            let tick = (await oracleSidechain.slot0()).tick;
            expect(tick).to.eq(arithmeticMeanTicks[arithmeticMeanTicks.length - 1]);
          });

          it('should keep consistency of tickCumulativesDelta between bridged observations', async () => {
            const sampleTimestamps = [now - 3 * hours, now + 4 * hours];
            const sampleDelta = sampleTimestamps[1] - sampleTimestamps[0];

            ({ secondsAgos } = await getSecondsAgos(sampleTimestamps));

            let [poolTickCumulatives] = await uniV3Pool.callStatic.observe(secondsAgos);
            let [oracleTickCumulatives] = await oracleSidechain.callStatic.observe(secondsAgos);

            let poolTickCumulativesDelta = poolTickCumulatives[1].sub(poolTickCumulatives[0]);
            let oracleTickCumulativesDelta = oracleTickCumulatives[1].sub(oracleTickCumulatives[0]);

            // to have a max difference of 1 tick (as inconvenient rounding may apply): 1 tick * sampleDelta = sampleDelta
            expect(oracleTickCumulativesDelta).to.be.closeTo(poolTickCumulativesDelta, sampleDelta);
          });
        });
      });
    });
  });

  describe('TWAP triggering', () => {
    let observationsFetched: IOracleSidechain.ObservationDataStructOutput[];
    let swapAmount = toUnit(100);
    const hours = 10_000;

    context('when the pool, pipeline, adapter, destination domain and receiver are set and whitelisted', () => {
      beforeEach(async () => {
        await dataFeed.connect(governor).whitelistPipeline(RANDOM_CHAIN_ID, salt);
        await dataFeed.connect(governor).whitelistAdapter(connextSenderAdapter.address, true);
        await dataFeed.connect(governor).setDestinationDomainId(connextSenderAdapter.address, RANDOM_CHAIN_ID, destinationDomain);
        await dataFeed.connect(governor).setReceiver(connextSenderAdapter.address, destinationDomain, connextReceiverAdapter.address);
        await dataReceiver.connect(governor).whitelistAdapter(connextReceiverAdapter.address, true);
      });

      context('when the oracle has data', () => {
        beforeEach(async () => {
          /// @notice: creates a random swap to avoid cache
          await uniswapV3Swap(tokenB.address, swapAmount.add(Math.floor((Math.random() + 1) * 10e9)), tokenA.address, fee);
          await evm.advanceTimeAndBlock(1.5 * hours);

          fetchTx = await dataFeedStrategy.strategicFetchObservations(salt, TIME_TRIGGER);

          const eventPoolObserved = (await fetchTx.wait()).events![0];
          observationsFetched = dataFeed.interface.decodeEventLog('PoolObserved', eventPoolObserved.data)
            ._observationsData as IOracleSidechain.ObservationDataStructOutput[];

          broadcastTx = await dataFeed.sendObservations(connextSenderAdapter.address, RANDOM_CHAIN_ID, salt, nonce, observationsFetched);

          await evm.advanceTimeAndBlock(4 * hours);
        });

        context('when no thresholds are surpassed', () => {
          it('should revert', async () => {
            await expect(dataFeedStrategy.strategicFetchObservations(salt, TWAP_TRIGGER)).to.be.revertedWith('NotStrategic()');
          });
        });

        context('when the upper threshold is surpassed', () => {
          beforeEach(async () => {
            /// @notice: creates a swap to move twap out of thresholds
            await uniswapV3Swap(tokenA.address, swapAmount.add(Math.floor((Math.random() + 1) * 10e9)), tokenB.address, fee);
            await evm.advanceTimeAndBlock(1.5 * hours);
          });

          it('should trigger a strategic fetch', async () => {
            await expect(dataFeedStrategy.strategicFetchObservations(salt, TWAP_TRIGGER)).to.emit(dataFeedStrategy, 'StrategicFetch');
          });
        });

        context('when the lower threshold is surpassed', () => {
          beforeEach(async () => {
            /// @notice: creates a swap to move twap out of thresholds
            await uniswapV3Swap(tokenB.address, swapAmount.add(Math.floor((Math.random() + 1) * 10e9)), tokenA.address, fee);
            await evm.advanceTimeAndBlock(1.5 * hours);
          });

          it('should trigger a strategic fetch', async () => {
            await expect(dataFeedStrategy.strategicFetchObservations(salt, TWAP_TRIGGER)).to.emit(dataFeedStrategy, 'StrategicFetch');
          });
        });
      });
    });
  });

  describe('OLD triggering', () => {
    let uniV3Pool: UniswapV3Pool;
    let tokenA: ERC20;
    let tokenB: ERC20;
    let fee: number;
    let salt: string;
    let observationsFetched: IOracleSidechain.ObservationDataStructOutput[];
    let observationCardinalityNext: number;
    let swapAmount = toBN(100_000_000000);
    const hours = 10_000;

    before(async () => {
      ({ uniV3Pool, tokenA, tokenB, fee } = await getOLDEnvironment());

      salt = calculateSalt(tokenA.address, tokenB.address, fee);
    });

    context('when the pool, pipeline, adapter, destination domain and receiver are set and whitelisted', () => {
      beforeEach(async () => {
        await dataFeed.connect(governor).whitelistPipeline(RANDOM_CHAIN_ID, salt);
        await dataFeed.connect(governor).whitelistAdapter(connextSenderAdapter.address, true);
        await dataFeed.connect(governor).setDestinationDomainId(connextSenderAdapter.address, RANDOM_CHAIN_ID, destinationDomain);
        await dataFeed.connect(governor).setReceiver(connextSenderAdapter.address, destinationDomain, connextReceiverAdapter.address);
        await dataReceiver.connect(governor).whitelistAdapter(connextReceiverAdapter.address, true);
      });

      context('when the oracle has no data', () => {
        beforeEach(async () => {
          /// @notice: creates a random swap to avoid cache
          await uniswapV3Swap(tokenB.address, swapAmount.add(Math.floor((Math.random() + 1) * 10e9)), tokenA.address, fee);
          await evm.advanceTimeAndBlock(1.5 * hours);
        });

        it('should trigger a strategic fetch', async () => {
          await expect(dataFeedStrategy.strategicFetchObservations(salt, OLD_TRIGGER)).to.emit(dataFeedStrategy, 'StrategicFetch');
        });
      });

      context('when the oracle has data', () => {
        beforeEach(async () => {
          /// @notice: creates a random swap to avoid cache
          await uniswapV3Swap(tokenB.address, swapAmount.add(Math.floor((Math.random() + 1) * 10e9)), tokenA.address, fee);
          await evm.advanceTimeAndBlock(1.5 * hours);

          fetchTx = await dataFeedStrategy.strategicFetchObservations(salt, TIME_TRIGGER);

          const eventPoolObserved = (await fetchTx.wait()).events![0];
          observationsFetched = dataFeed.interface.decodeEventLog('PoolObserved', eventPoolObserved.data)
            ._observationsData as IOracleSidechain.ObservationDataStructOutput[];

          broadcastTx = await dataFeed.sendObservations(connextSenderAdapter.address, RANDOM_CHAIN_ID, salt, nonce, observationsFetched);

          await evm.advanceTimeAndBlock(4 * hours);
        });

        context('when the last pool state observed is not older than the oldest observation', () => {
          it('should revert', async () => {
            await expect(dataFeedStrategy.strategicFetchObservations(salt, OLD_TRIGGER)).to.be.revertedWith('NotStrategic()');
          });
        });

        context('when the last pool state observed is older than the oldest observation', () => {
          beforeEach(async () => {
            [, , , , observationCardinalityNext, ,] = await uniV3Pool.slot0();
            for (let i = 0; i < Math.round(observationCardinalityNext / 2); ++i) {
              await uniswapV3Swap(tokenB.address, swapAmount, tokenA.address, fee);
              await uniswapV3Swap(tokenA.address, toUnit(100), tokenB.address, fee);
            }
          });

          it('should trigger a strategic fetch', async () => {
            await expect(dataFeedStrategy.strategicFetchObservations(salt, OLD_TRIGGER)).to.emit(dataFeedStrategy, 'StrategicFetch');
          });
        });
      });
    });
  });

  describe('keep3r job', () => {
    let bondTime: BigNumber;
    let observationData0 = [500000, 50] as IOracleSidechain.ObservationDataStructOutput;
    let observationData1 = [1000000, 100] as IOracleSidechain.ObservationDataStructOutput;
    let observationData2 = [3000000, 300] as IOracleSidechain.ObservationDataStructOutput;
    let observationsData = [observationData0, observationData1, observationData2];

    beforeEach(async () => {
      bondTime = await keep3rV2.bondTime();
      await keep3rV2.connect(keeper).bond(tokenB.address, 0);
      await evm.advanceTimeAndBlock(bondTime.toNumber());
      await keep3rV2.connect(keeper).activate(tokenB.address);
      await keep3rV2.addJob(strategyJob.address);
      await keep3rV2.connect(kp3rProxyGovernor).forceLiquidityCreditsToJob(strategyJob.address, toUnit(10));
    });

    context('when the pool, pipeline, adapter, destination domain and receiver are set and whitelisted', () => {
      beforeEach(async () => {
        await dataFeed.connect(governor).whitelistPipeline(RANDOM_CHAIN_ID, salt);
        await dataFeed.connect(governor).whitelistAdapter(connextSenderAdapter.address, true);
        await dataFeed.connect(governor).setDestinationDomainId(connextSenderAdapter.address, RANDOM_CHAIN_ID, destinationDomain);
        await dataFeed.connect(governor).setReceiver(connextSenderAdapter.address, destinationDomain, connextReceiverAdapter.address);
        await dataReceiver.connect(governor).whitelistAdapter(connextReceiverAdapter.address, true);
      });

      it('should revert if the keeper is not valid', async () => {
        await expect(strategyJob.connect(governor)['work(bytes32,uint8)'](salt, TIME_TRIGGER)).to.be.revertedWith('KeeperNotValid()');
        await expect(
          strategyJob.connect(governor)['work(uint32,bytes32,uint24,(uint32,int24)[])'](RANDOM_CHAIN_ID, salt, nonce, observationsData)
        ).to.be.revertedWith('KeeperNotValid()');
      });

      it('should work the job', async () => {
        fetchTx = await strategyJob.connect(keeper)['work(bytes32,uint8)'](salt, TIME_TRIGGER);

        const eventPoolObserved = (await fetchTx.wait()).events![1];
        const observationsFetched = dataFeed.interface.decodeEventLog('PoolObserved', eventPoolObserved.data)
          ._observationsData as IOracleSidechain.ObservationDataStructOutput[];

        broadcastTx = await strategyJob
          .connect(keeper)
          ['work(uint32,bytes32,uint24,(uint32,int24)[])'](RANDOM_CHAIN_ID, salt, nonce, observationsFetched);

        await expect(fetchTx).to.emit(dataFeed, 'PoolObserved');
        await expect(broadcastTx).to.emit(dataFeed, 'DataBroadcast');
      });

      it('should pay the keeper', async () => {
        fetchTx = await strategyJob.connect(keeper)['work(bytes32,uint8)'](salt, TIME_TRIGGER);

        const eventPoolObserved = (await fetchTx.wait()).events![1];
        const observationsFetched = dataFeed.interface.decodeEventLog('PoolObserved', eventPoolObserved.data)
          ._observationsData as IOracleSidechain.ObservationDataStructOutput[];

        broadcastTx = await strategyJob
          .connect(keeper)
          ['work(uint32,bytes32,uint24,(uint32,int24)[])'](RANDOM_CHAIN_ID, salt, nonce, observationsFetched);

        await expect(fetchTx).to.emit(keep3rV2, 'KeeperWork');
        await expect(broadcastTx).to.emit(keep3rV2, 'KeeperWork');
      });
    });
  });

  describe('censorship-resistant behaviour', () => {
    let dummyAdapter: DummyAdapterForTest;
    let observationsFetched: IOracleSidechain.ObservationDataStructOutput[];
    let swapAmount = toUnit(100);
    let now: number;
    let initialTimestamp: number;
    const hours = 10_000;

    beforeEach(async () => {
      const dummyAdapterFactory = await ethers.getContractFactory('DummyAdapterForTest');
      dummyAdapter = (await dummyAdapterFactory.connect(deployer).deploy()) as DummyAdapterForTest;
    });

    context('when the settings are valid and the job has credits', () => {
      let bondTime: BigNumber;

      beforeEach(async () => {
        // add credit to the job
        bondTime = await keep3rV2.bondTime();
        await keep3rV2.connect(keeper).bond(tokenB.address, 0);
        await evm.advanceTimeAndBlock(bondTime.toNumber());
        await keep3rV2.connect(keeper).activate(tokenB.address);
        await keep3rV2.addJob(strategyJob.address);
        await keep3rV2.connect(kp3rProxyGovernor).forceLiquidityCreditsToJob(strategyJob.address, toUnit(10));

        // setup dummy adapter
        await dataFeed.connect(governor).whitelistPipeline(RANDOM_CHAIN_ID, salt);
        await strategyJob.connect(governor).setDefaultBridgeSenderAdapter(dummyAdapter.address);
        await dataFeed.connect(governor).whitelistAdapter(dummyAdapter.address, true);
        await dataFeed.connect(governor).setDestinationDomainId(dummyAdapter.address, RANDOM_CHAIN_ID, destinationDomain);
        await dataFeed.connect(governor).setReceiver(dummyAdapter.address, destinationDomain, dataReceiver.address);
        await dataReceiver.connect(governor).whitelistAdapter(dummyAdapter.address, true);
      });

      context('when the oracle has no data', () => {
        beforeEach(async () => {
          /// @notice: creates a random swap to avoid cache
          await uniswapV3Swap(tokenB.address, swapAmount.add(Math.floor((Math.random() + 1) * 10e9)), tokenA.address, fee);
          await evm.advanceTimeAndBlock(1.5 * hours);
        });

        context('when the bridge ignores a message', () => {
          beforeEach(async () => {
            fetchTx = await strategyJob.connect(keeper)['work(bytes32,uint8)'](salt, TIME_TRIGGER);

            const eventPoolObserved = (await fetchTx.wait()).events![1];
            observationsFetched = dataFeed.interface.decodeEventLog('PoolObserved', eventPoolObserved.data)
              ._observationsData as IOracleSidechain.ObservationDataStructOutput[];

            initialTimestamp = observationsFetched[0].blockTimestamp;

            await dummyAdapter.setIgnoreTxs(true);
            broadcastTx = await strategyJob
              .connect(keeper)
              ['work(uint32,bytes32,uint24,(uint32,int24)[])'](RANDOM_CHAIN_ID, salt, nonce, observationsFetched);
            await dummyAdapter.setIgnoreTxs(false);
          });

          it('should have ignored a broadcast tx', async () => {
            await expect(broadcastTx).to.emit(dataFeed, 'DataBroadcast');

            await expect(broadcastTx).not.to.emit(dataReceiver, 'ObservationsAdded');
          });

          context('when the data is sent', () => {
            beforeEach(async () => {
              await dataFeed.sendObservations(dummyAdapter.address, RANDOM_CHAIN_ID, salt, nonce, observationsFetched);
            });

            it('should keep consistency of tickCumulativesDelta between bridged observations', async () => {
              now = (await ethers.provider.getBlock('latest')).timestamp;
              const sampleDelta = now - initialTimestamp;

              const secondsAgos = [sampleDelta, 0];

              let [poolTickCumulatives] = await uniV3Pool.callStatic.observe(secondsAgos);
              let [oracleTickCumulatives] = await oracleSidechain.callStatic.observe(secondsAgos);

              let poolTickCumulativesDelta = poolTickCumulatives[1].sub(poolTickCumulatives[0]);
              let oracleTickCumulativesDelta = oracleTickCumulatives[1].sub(oracleTickCumulatives[0]);

              // to have a max difference of 1 tick (as inconvenient rounding may apply): 1 tick * sampleDelta = sampleDelta
              expect(oracleTickCumulativesDelta).to.be.closeTo(poolTickCumulativesDelta, sampleDelta);
            });
          });
        });
      });

      context('when the oracle has data', () => {
        beforeEach(async () => {
          /// @notice: creates a random swap to avoid cache
          await uniswapV3Swap(tokenB.address, swapAmount.add(Math.floor((Math.random() + 1) * 10e9)), tokenA.address, fee);
          await evm.advanceTimeAndBlock(1.5 * hours);

          fetchTx = await strategyJob.connect(keeper)['work(bytes32,uint8)'](salt, TIME_TRIGGER);

          const eventPoolObserved = (await fetchTx.wait()).events![1];
          observationsFetched = dataFeed.interface.decodeEventLog('PoolObserved', eventPoolObserved.data)
            ._observationsData as IOracleSidechain.ObservationDataStructOutput[];

          initialTimestamp = observationsFetched[0].blockTimestamp;

          await strategyJob.connect(keeper)['work(uint32,bytes32,uint24,(uint32,int24)[])'](RANDOM_CHAIN_ID, salt, nonce, observationsFetched);

          const strategyCooldown = await dataFeedStrategy.strategyCooldown();
          await evm.advanceTimeAndBlock(strategyCooldown);
        });

        context('when the bridge ignores a message', () => {
          beforeEach(async () => {
            fetchTx = await strategyJob.connect(keeper)['work(bytes32,uint8)'](salt, TIME_TRIGGER);

            const eventPoolObserved = (await fetchTx.wait()).events![1];
            observationsFetched = dataFeed.interface.decodeEventLog('PoolObserved', eventPoolObserved.data)
              ._observationsData as IOracleSidechain.ObservationDataStructOutput[];

            await dummyAdapter.setIgnoreTxs(true);
            broadcastTx = await strategyJob
              .connect(keeper)
              ['work(uint32,bytes32,uint24,(uint32,int24)[])'](RANDOM_CHAIN_ID, salt, nonce + 1, observationsFetched);
            await dummyAdapter.setIgnoreTxs(false);
          });

          it('should have ignored a broadcast tx', async () => {
            await expect(broadcastTx).to.emit(dataFeed, 'DataBroadcast');

            await expect(broadcastTx).not.to.emit(dataReceiver, 'ObservationsAdded');
          });

          context('when the data is sent', () => {
            beforeEach(async () => {
              await dataFeed.sendObservations(dummyAdapter.address, RANDOM_CHAIN_ID, salt, nonce + 1, observationsFetched);
            });

            it('should keep consistency of tickCumulativesDelta between bridged observations', async () => {
              now = (await ethers.provider.getBlock('latest')).timestamp;
              const sampleDelta = now - initialTimestamp;

              const secondsAgos = [sampleDelta, 0];

              let [poolTickCumulatives] = await uniV3Pool.callStatic.observe(secondsAgos);
              let [oracleTickCumulatives] = await oracleSidechain.callStatic.observe(secondsAgos);

              let poolTickCumulativesDelta = poolTickCumulatives[1].sub(poolTickCumulatives[0]);
              let oracleTickCumulativesDelta = oracleTickCumulatives[1].sub(oracleTickCumulatives[0]);

              // to have a max difference of 1 tick (as inconvenient rounding may apply): 1 tick * sampleDelta = sampleDelta
              expect(oracleTickCumulativesDelta).to.be.closeTo(poolTickCumulativesDelta, sampleDelta);
            });
          });
        });
      });
    });
  });
});
