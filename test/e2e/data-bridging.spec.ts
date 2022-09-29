import { ethers } from 'hardhat';
import { BigNumber, ContractTransaction } from 'ethers';
import { JsonRpcSigner } from '@ethersproject/providers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import {
  DataFeed,
  DataFeedKeeper,
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
import { RANDOM_CHAIN_ID, ORACLE_SIDECHAIN_CREATION_CODE } from '@utils/constants';
import { toBN, toUnit } from '@utils/bn';
import { readArgFromEvent } from '@utils/event-utils';
import { onlyKeeper } from '@utils/behaviours';
import { calculateSalt, getInitCodeHash } from '@utils/misc';
import { GOERLI_DESTINATION_DOMAIN_CONNEXT } from 'utils/constants';
import { getNodeUrl } from 'utils/env';
import forkBlockNumber from './fork-block-numbers';
import { setupContracts, getEnvironment, getOracle, getSecondsAgos, observePool, calculateOracleObservations, uniswapV3Swap } from './common';
import { expect } from 'chai';

describe('@skip-on-coverage Data Bridging Flow', () => {
  let deployer: SignerWithAddress;
  let governor: SignerWithAddress;
  let keeper: JsonRpcSigner;
  let kp3rProxyGovernor: JsonRpcSigner;
  let dataFeed: DataFeed;
  let dataFeedKeeper: DataFeedKeeper;
  let uniswapV3Factory: UniswapV3Factory;
  let uniV3Pool: UniswapV3Pool;
  let tokenA: ERC20;
  let tokenB: ERC20;
  let fee: number;
  let keep3rV2: Keep3rV2;
  let salt: string;
  let connextSenderAdapter: ConnextSenderAdapter;
  let connextReceiverAdapter: ConnextReceiverAdapter;
  let dataReceiver: DataReceiver;
  let oracleFactory: OracleFactory;
  let oracleSidechain: OracleSidechain;
  let tx: ContractTransaction;
  let snapshotId: string;

  const nonce = 1;

  before(async () => {
    await evm.reset({
      jsonRpcUrl: getNodeUrl('ethereum'),
      blockNumber: forkBlockNumber.oracleSidechain,
    });

    ({ uniswapV3Factory, uniV3Pool, tokenA, tokenB, fee, keep3rV2, keeper, kp3rProxyGovernor } = await getEnvironment());

    salt = calculateSalt(tokenA.address, tokenB.address, fee);

    ({ deployer, governor, dataFeed, dataFeedKeeper, connextSenderAdapter, connextReceiverAdapter, dataReceiver, oracleFactory } =
      await setupContracts());

    ({ oracleSidechain } = await getOracle(oracleFactory.address, tokenA.address, tokenB.address, fee));

    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('salt code hash', () => {
    it('should be correctly set', async () => {
      let ORACLE_INIT_CODE_HASH = await dataReceiver.ORACLE_INIT_CODE_HASH();
      expect(ORACLE_INIT_CODE_HASH).to.eq(getInitCodeHash(ORACLE_SIDECHAIN_CREATION_CODE));
    });
  });

  describe('observation bridging flow', () => {
    let dataFeedKeeperSigner: JsonRpcSigner;
    let secondsAgos = [30, 10, 0];
    let blockTimestamps: number[];
    let tickCumulatives: BigNumber[];
    let arithmeticMeanTicks: BigNumber[];
    let observationData0 = [500000, 50] as IOracleSidechain.ObservationDataStructOutput;
    let observationData1 = [1000000, 100] as IOracleSidechain.ObservationDataStructOutput;
    let observationData2 = [3000000, 300] as IOracleSidechain.ObservationDataStructOutput;
    let observationsData = [observationData0, observationData1, observationData2];
    let observationsIndex: number;
    let secondsPerLiquidityCumulativeX128s: BigNumber[];
    let swapAmount = toUnit(10);
    let now: number;
    const hours = 10_000;

    beforeEach(async () => {
      dataFeedKeeperSigner = await wallet.impersonate(dataFeedKeeper.address);
      await wallet.setBalance(dataFeedKeeper.address, toUnit(10));
    });

    onlyKeeper(
      () => dataFeed,
      'fetchObservations',
      () => dataFeedKeeperSigner,
      () => [salt, secondsAgos]
    );

    context('when the adapter is not set', () => {
      it('should revert', async () => {
        await expect(dataFeed.sendObservations(connextSenderAdapter.address, RANDOM_CHAIN_ID, salt, nonce, observationsData)).to.be.revertedWith(
          'UnallowedAdapter()'
        );
      });
    });

    context('when only the adapter is set', () => {
      beforeEach(async () => {
        await dataFeed.connect(governor).whitelistAdapter(connextSenderAdapter.address, true);
      });

      it('should revert', async () => {
        await expect(dataFeed.sendObservations(connextSenderAdapter.address, RANDOM_CHAIN_ID, salt, nonce, observationsData)).to.be.revertedWith(
          'DestinationDomainIdNotSet()'
        );
      });
    });

    context('when only the adapter and the destination domain are set', () => {
      beforeEach(async () => {
        await dataFeed.connect(governor).whitelistAdapter(connextSenderAdapter.address, true);
        await dataFeed
          .connect(governor)
          .setDestinationDomainId(connextSenderAdapter.address, RANDOM_CHAIN_ID, GOERLI_DESTINATION_DOMAIN_CONNEXT);
      });

      it('should revert', async () => {
        await expect(dataFeed.sendObservations(connextSenderAdapter.address, RANDOM_CHAIN_ID, salt, nonce, observationsData)).to.be.revertedWith(
          'ReceiverNotSet()'
        );
      });
    });

    context('when the adapter, destination domain and receiver are set, but the adapter is not whitelisted in the data receiver', () => {
      beforeEach(async () => {
        await dataFeed.connect(governor).whitelistAdapter(connextSenderAdapter.address, true);
        await dataFeed
          .connect(governor)
          .setDestinationDomainId(connextSenderAdapter.address, RANDOM_CHAIN_ID, GOERLI_DESTINATION_DOMAIN_CONNEXT);
        await dataFeed
          .connect(governor)
          .setReceiver(connextSenderAdapter.address, GOERLI_DESTINATION_DOMAIN_CONNEXT, connextReceiverAdapter.address);

        tx = await dataFeed.connect(dataFeedKeeperSigner).fetchObservations(salt, secondsAgos);
      });

      it('should revert', async () => {
        const observationsFetched = (await readArgFromEvent(
          tx,
          'PoolObserved',
          '_observationsData'
        )) as IOracleSidechain.ObservationDataStructOutput[];

        await expect(
          dataFeed.sendObservations(connextSenderAdapter.address, RANDOM_CHAIN_ID, salt, nonce, observationsFetched)
        ).to.be.revertedWith('UnallowedAdapter()');
      });
    });

    context('when the adapter, destination domain and receiver are set and whitelisted', () => {
      beforeEach(async () => {
        await dataFeed.connect(governor).whitelistAdapter(connextSenderAdapter.address, true);
        await dataFeed
          .connect(governor)
          .setDestinationDomainId(connextSenderAdapter.address, RANDOM_CHAIN_ID, GOERLI_DESTINATION_DOMAIN_CONNEXT);
        await dataFeed
          .connect(governor)
          .setReceiver(connextSenderAdapter.address, GOERLI_DESTINATION_DOMAIN_CONNEXT, connextReceiverAdapter.address);
        await dataReceiver.connect(governor).whitelistAdapter(connextReceiverAdapter.address, true);
      });

      it('should revert if the hash is unknown', async () => {
        await expect(dataFeed.sendObservations(connextSenderAdapter.address, RANDOM_CHAIN_ID, salt, nonce, observationsData)).to.be.revertedWith(
          'UnknownHash()'
        );
      });

      context('when the oracle has no data', () => {
        beforeEach(async () => {
          /// @notice: creates a random swap to avoid cache
          await uniswapV3Swap(tokenB.address, swapAmount.add(Math.floor(Math.random() * 10e9)), tokenA.address, fee);
          await evm.advanceTimeAndBlock(1.5 * hours);
          now = (await ethers.provider.getBlock('latest')).timestamp;

          /// @notice: swap happens at now - 1.5 hours                         / here
          blockTimestamps = [now - 4 * hours, now - 3 * hours, now - 2 * hours, now - hours, now];

          ({ arithmeticMeanTicks } = await observePool(uniV3Pool, blockTimestamps, 0, toBN(0)));

          ({ secondsAgos } = await getSecondsAgos(blockTimestamps));

          tx = await dataFeed.connect(dataFeedKeeperSigner).fetchObservations(salt, secondsAgos);

          const observationsFetched = (await readArgFromEvent(
            tx,
            'PoolObserved',
            '_observationsData'
          )) as IOracleSidechain.ObservationDataStructOutput[];

          tx = await dataFeed.sendObservations(connextSenderAdapter.address, RANDOM_CHAIN_ID, salt, nonce, observationsFetched);
        });

        it('should bridge an amount of observations 1 lesser than amount of secondsAgos', async () => {
          const observationsBridged = (await readArgFromEvent(
            tx,
            'DataSent',
            '_observationsData'
          )) as IOracleSidechain.ObservationDataStructOutput[];

          expect(observationsBridged.length).to.eq(secondsAgos.length - 1);
          expect(observationsBridged[observationsBridged.length - 1].blockTimestamp).not.to.eq(0);
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
            let expectedObservation = [blockTimestamps[i - 1], tickCumulatives[i], secondsPerLiquidityCumulativeX128s[i], true];
            let observation = await oracleSidechain.observations(observationsIndex++);
            expect(observation).to.eql(expectedObservation);
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
          await uniswapV3Swap(tokenB.address, swapAmount.add(Math.floor(Math.random() * 10e9)), tokenA.address, fee);
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

          tx = await dataFeed.connect(dataFeedKeeperSigner).fetchObservations(salt, secondsAgos);

          const observationsFetched = (await readArgFromEvent(
            tx,
            'PoolObserved',
            '_observationsData'
          )) as IOracleSidechain.ObservationDataStructOutput[];

          tx = await dataFeed.sendObservations(connextSenderAdapter.address, RANDOM_CHAIN_ID, salt, lastPoolNonceObserved, observationsFetched);

          await evm.advanceTimeAndBlock(4 * hours);
        });

        context('when the data to be fetched is old compared with that of the oracle', () => {
          beforeEach(async () => {
            blockTimestamps = [now - hours, now + hours, now + 2 * hours, now + 4 * hours];

            ({ secondsAgos } = await getSecondsAgos(blockTimestamps));
          });

          it('should revert', async () => {
            await expect(dataFeed.connect(dataFeedKeeperSigner).fetchObservations(salt, secondsAgos)).to.be.revertedWith(
              'VM Exception while processing transaction: reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)'
            );
          });
        });

        context('when the data to be fetched is continuous with that of the oracle', () => {
          beforeEach(async () => {
            blockTimestamps = [now, now + hours, now + 2 * hours, now + 4 * hours];

            ({ secondsAgos } = await getSecondsAgos(blockTimestamps));
          });

          it('should revert', async () => {
            await expect(dataFeed.connect(dataFeedKeeperSigner).fetchObservations(salt, secondsAgos)).to.be.revertedWith(
              'VM Exception while processing transaction: reverted with panic code 0x12 (Division or modulo division by zero)'
            );
          });
        });

        context('when the data to be fetched is discontinuous with that of the oracle', () => {
          beforeEach(async () => {
            blockTimestamps = [now + hours, now + 2 * hours, now + 4 * hours];

            ({ arithmeticMeanTicks } = await observePool(uniV3Pool, blockTimestamps, lastBlockTimestampObserved, lastTickCumulativeObserved));

            ({ secondsAgos } = await getSecondsAgos(blockTimestamps));

            tx = await dataFeed.connect(dataFeedKeeperSigner).fetchObservations(salt, secondsAgos);

            const observationsFetched = (await readArgFromEvent(
              tx,
              'PoolObserved',
              '_observationsData'
            )) as IOracleSidechain.ObservationDataStructOutput[];

            tx = await dataFeed.sendObservations(
              connextSenderAdapter.address,
              RANDOM_CHAIN_ID,
              salt,
              lastPoolNonceObserved + 1,
              observationsFetched
            );
          });

          it('should bridge an amount of observations equal to the amount of secondsAgos', async () => {
            const observationsBridged = (await readArgFromEvent(
              tx,
              'DataSent',
              '_observationsData'
            )) as IOracleSidechain.ObservationDataStructOutput[];

            expect(observationsBridged.length).to.eq(secondsAgos.length);
            expect(observationsBridged[observationsBridged.length - 1].blockTimestamp).not.to.eq(0);
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

            const expectedStitchedObservation = [lastBlockTimestampObserved, tickCumulatives[0], secondsPerLiquidityCumulativeX128s[0], true];
            const stitchedObservation = await oracleSidechain.observations(observationsIndex++);
            expect(stitchedObservation).to.eql(expectedStitchedObservation);

            for (let i = 1; i < blockTimestamps.length; ++i) {
              let expectedObservation = [blockTimestamps[i - 1], tickCumulatives[i], secondsPerLiquidityCumulativeX128s[i], true];
              let observation = await oracleSidechain.observations(observationsIndex++);
              expect(observation).to.eql(expectedObservation);
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

    after(async () => {
      dataFeed = dataFeed.connect(deployer);
    });
  });

  describe('fetching observations indices', () => {
    let time: number;
    let secondsAgos: number[] = [];
    let blockTimestamp: number;
    let expectedObservationsIndices: number[] = [];

    it('should revert if the pool is not initialized', async () => {
      let secondsAgos = [50];
      let tokenA = wallet.generateRandomAddress();
      let tokenB = wallet.generateRandomAddress();
      let fee = 10000;
      await uniswapV3Factory.createPool(tokenA, tokenB, fee);
      let uniswapV3PoolAddress = await uniswapV3Factory.getPool(tokenA, tokenB, fee);
      await expect(dataFeed.fetchObservationsIndices(uniswapV3PoolAddress, secondsAgos)).to.be.revertedWith('I()');
    });

    context('when the pool is initialized', () => {
      beforeEach(async () => {
        time = (await ethers.provider.getBlock('latest')).timestamp;
        for (let i = 0; i <= 10; i = i + 2) {
          [blockTimestamp] = await uniV3Pool.observations(i);
          secondsAgos[i] = time - blockTimestamp;
          secondsAgos[i + 1] = time - blockTimestamp - 5;
          expectedObservationsIndices[i] = i;
          expectedObservationsIndices[i + 1] = i;
        }
      });

      it('should revert if secondsAgos is too old', async () => {
        let [oldestObservationTimestamp] = await uniV3Pool.observations(0);
        let secondsAgos = [time - oldestObservationTimestamp + 1];
        await expect(dataFeed.fetchObservationsIndices(uniV3Pool.address, secondsAgos)).to.be.revertedWith('OLD()');
      });

      it('should return the observations indices', async () => {
        let observationsIndices = await dataFeed.fetchObservationsIndices(uniV3Pool.address, secondsAgos);
        expect(observationsIndices).to.eql(expectedObservationsIndices);
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
      await keep3rV2.addJob(dataFeedKeeper.address);
      await keep3rV2.connect(kp3rProxyGovernor).forceLiquidityCreditsToJob(dataFeedKeeper.address, toUnit(10));
    });

    context('when the pool, adapter, destination domain and receiver are set and whitelisted', () => {
      beforeEach(async () => {
        await dataFeedKeeper.connect(governor).whitelistPool(RANDOM_CHAIN_ID, salt, true);
        await dataFeed.connect(governor).whitelistAdapter(connextSenderAdapter.address, true);
        await dataFeed
          .connect(governor)
          .setDestinationDomainId(connextSenderAdapter.address, RANDOM_CHAIN_ID, GOERLI_DESTINATION_DOMAIN_CONNEXT);
        await dataFeed
          .connect(governor)
          .setReceiver(connextSenderAdapter.address, GOERLI_DESTINATION_DOMAIN_CONNEXT, connextReceiverAdapter.address);
        await dataReceiver.connect(governor).whitelistAdapter(connextReceiverAdapter.address, true);
      });

      it('should revert if the keeper is not valid', async () => {
        await expect(dataFeedKeeper.connect(governor)['work(bytes32)'](salt)).to.be.revertedWith('KeeperNotValid()');
        await expect(
          dataFeedKeeper.connect(governor)['work(uint16,bytes32,uint24,(uint32,int24)[])'](RANDOM_CHAIN_ID, salt, nonce, observationsData)
        ).to.be.revertedWith('KeeperNotValid()');
      });

      it('should work the job', async () => {
        tx = await dataFeedKeeper.connect(keeper)['work(bytes32)'](salt);

        const eventPoolObserved = (await tx.wait()).events![1];
        const observationsFetched = dataFeed.interface.decodeEventLog('PoolObserved', eventPoolObserved.data)
          ._observationsData as IOracleSidechain.ObservationDataStructOutput[];

        await expect(tx).to.emit(dataFeed, 'PoolObserved');
        await expect(
          dataFeedKeeper.connect(keeper)['work(uint16,bytes32,uint24,(uint32,int24)[])'](RANDOM_CHAIN_ID, salt, nonce, observationsFetched)
        ).to.emit(dataFeed, 'DataSent');
      });

      it('should pay the keeper', async () => {
        tx = await dataFeedKeeper.connect(keeper)['work(bytes32)'](salt);

        const eventPoolObserved = (await tx.wait()).events![1];
        const observationsFetched = dataFeed.interface.decodeEventLog('PoolObserved', eventPoolObserved.data)
          ._observationsData as IOracleSidechain.ObservationDataStructOutput[];

        await expect(tx).to.emit(keep3rV2, 'KeeperWork');
        await expect(
          dataFeedKeeper.connect(keeper)['work(uint16,bytes32,uint24,(uint32,int24)[])'](RANDOM_CHAIN_ID, salt, nonce, observationsFetched)
        ).to.emit(keep3rV2, 'KeeperWork');
      });
    });
  });

  describe('censorship-resistant behaviour', () => {
    let dummyAdapter: DummyAdapterForTest;
    let observationsFetched: IOracleSidechain.ObservationDataStructOutput[];
    let swapAmount = toUnit(10);
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
        await keep3rV2.addJob(dataFeedKeeper.address);
        await keep3rV2.connect(kp3rProxyGovernor).forceLiquidityCreditsToJob(dataFeedKeeper.address, toUnit(10));

        // setup dummy adapter
        await dataFeedKeeper.connect(governor).whitelistPool(RANDOM_CHAIN_ID, salt, true);
        await dataFeedKeeper.connect(governor).setDefaultBridgeSenderAdapter(dummyAdapter.address);
        await dataFeed.connect(governor).whitelistAdapter(dummyAdapter.address, true);
        await dataFeed.connect(governor).setDestinationDomainId(dummyAdapter.address, RANDOM_CHAIN_ID, GOERLI_DESTINATION_DOMAIN_CONNEXT);
        await dataFeed.connect(governor).setReceiver(dummyAdapter.address, GOERLI_DESTINATION_DOMAIN_CONNEXT, dataReceiver.address);
        await dataReceiver.connect(governor).whitelistAdapter(dummyAdapter.address, true);
      });

      context('when the oracle has no data', () => {
        beforeEach(async () => {
          /// @notice: creates a random swap to avoid cache
          await uniswapV3Swap(tokenB.address, swapAmount.add(Math.floor(Math.random() * 10e9)), tokenA.address, fee);
          await evm.advanceTimeAndBlock(1.5 * hours);
        });

        context('when the bridge ignores a message', () => {
          beforeEach(async () => {
            tx = await dataFeedKeeper.connect(keeper)['work(bytes32)'](salt);

            const eventPoolObserved = (await tx.wait()).events![1];
            observationsFetched = dataFeed.interface.decodeEventLog('PoolObserved', eventPoolObserved.data)
              ._observationsData as IOracleSidechain.ObservationDataStructOutput[];

            initialTimestamp = observationsFetched[0].blockTimestamp;

            await dummyAdapter.setIgnoreTxs(true);
            tx = await dataFeedKeeper
              .connect(keeper)
              ['work(uint16,bytes32,uint24,(uint32,int24)[])'](RANDOM_CHAIN_ID, salt, nonce, observationsFetched);
            await dummyAdapter.setIgnoreTxs(false);
          });

          it('should have ignored a tx', async () => {
            await expect(tx).to.emit(dataFeed, 'DataSent');

            await expect(tx).not.to.emit(oracleSidechain, 'ObservationWritten');
          });

          context('when the data is sent', () => {
            beforeEach(async () => {
              await dataFeedKeeper
                .connect(keeper)
                ['work(uint16,bytes32,uint24,(uint32,int24)[])'](RANDOM_CHAIN_ID, salt, nonce, observationsFetched);
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
          await uniswapV3Swap(tokenB.address, swapAmount.add(Math.floor(Math.random() * 10e9)), tokenA.address, fee);
          await evm.advanceTimeAndBlock(1.5 * hours);

          tx = await dataFeedKeeper.connect(keeper)['work(bytes32)'](salt);

          const eventPoolObserved = (await tx.wait()).events![1];
          observationsFetched = dataFeed.interface.decodeEventLog('PoolObserved', eventPoolObserved.data)
            ._observationsData as IOracleSidechain.ObservationDataStructOutput[];

          initialTimestamp = observationsFetched[0].blockTimestamp;

          await dataFeedKeeper
            .connect(keeper)
            ['work(uint16,bytes32,uint24,(uint32,int24)[])'](RANDOM_CHAIN_ID, salt, nonce, observationsFetched);
        });

        context('when the bridge ignores a message', () => {
          beforeEach(async () => {
            tx = await dataFeedKeeper.connect(keeper)['work(bytes32)'](salt);

            const eventPoolObserved = (await tx.wait()).events![1];
            observationsFetched = dataFeed.interface.decodeEventLog('PoolObserved', eventPoolObserved.data)
              ._observationsData as IOracleSidechain.ObservationDataStructOutput[];

            await dummyAdapter.setIgnoreTxs(true);
            tx = await dataFeedKeeper
              .connect(keeper)
              ['work(uint16,bytes32,uint24,(uint32,int24)[])'](RANDOM_CHAIN_ID, salt, nonce + 1, observationsFetched);
            await dummyAdapter.setIgnoreTxs(false);
          });

          it('should have ignored a tx', async () => {
            await expect(tx).to.emit(dataFeed, 'DataSent');

            await expect(tx).not.to.emit(oracleSidechain, 'ObservationWritten');
          });

          context('when the data is sent', () => {
            beforeEach(async () => {
              await dataFeedKeeper
                .connect(keeper)
                ['work(uint16,bytes32,uint24,(uint32,int24)[])'](RANDOM_CHAIN_ID, salt, nonce + 1, observationsFetched);
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
