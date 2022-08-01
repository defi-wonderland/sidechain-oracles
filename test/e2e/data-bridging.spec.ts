import { BigNumber } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { DataFeed, ConnextSenderAdapter, ConnextReceiverAdapter, DataReceiver, OracleSidechain } from '@typechained';
import { UniswapV3Pool } from '@eth-sdk-types';
import { evm } from '@utils';
import { RANDOM_CHAIN_ID, KP3R, WETH, FEE } from '@utils/constants';
import { toBN, toUnit } from '@utils/bn';
import { getInitCodeHash } from '@utils/misc';
import { GOERLI_DESTINATION_DOMAIN_CONNEXT } from 'utils/constants';
import { getNodeUrl } from 'utils/env';
import forkBlockNumber from './fork-block-numbers';
import { setupContracts, observePool, calculateOracleObservations, uniswapV3Swap, getSecondsAgos } from './common';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { pool } from 'typechained/@uniswap/v3-core/contracts/interfaces';

describe('@skip-on-coverage Data Bridging Flow', () => {
  let governance: SignerWithAddress;
  let dataFeed: DataFeed;
  let uniswapV3K3PR: UniswapV3Pool;
  let connextSenderAdapter: ConnextSenderAdapter;
  let connextReceiverAdapter: ConnextReceiverAdapter;
  let dataReceiver: DataReceiver;
  let oracleSidechain: OracleSidechain;
  let snapshotId: string;

  before(async () => {
    await evm.reset({
      jsonRpcUrl: getNodeUrl('ethereum'),
      blockNumber: forkBlockNumber.oracleSidechain,
    });

    ({ governance, dataFeed, uniswapV3K3PR, connextSenderAdapter, connextReceiverAdapter, dataReceiver, oracleSidechain } =
      await setupContracts());

    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('salt code hash', () => {
    it('should be correctly set', async () => {
      let ORACLE_INIT_CODE_HASH = await dataReceiver.ORACLE_INIT_CODE_HASH();
      expect(ORACLE_INIT_CODE_HASH).to.eq(getInitCodeHash());
    });
  });

  describe('observation bridging flow', () => {
    let secondsAgos = [30, 10, 0];
    let secondsAgosDeltas: number[];
    let blockTimestamps: number[];
    let blockTimestampsDelta: number;
    let tickCumulatives: BigNumber[];
    let tickCumulativesDeltas: BigNumber[];
    let arithmeticMeanTicks: BigNumber[];
    let observationsIndex: number;
    let observationsDeltas: number[];
    let secondsPerLiquidityCumulativeX128s: BigNumber[];
    let swapAmount = toUnit(10);
    const hours = 3600;
    let now: number;

    context('when the adapter is not set', () => {
      it('should revert', async () => {
        await expect(dataFeed.sendObservations(connextSenderAdapter.address, RANDOM_CHAIN_ID, KP3R, WETH, FEE, secondsAgos)).to.be.revertedWith(
          'UnallowedAdapter()'
        );
      });
    });

    context('when only the adapter is set', () => {
      beforeEach(async () => {
        await dataFeed.connect(governance).whitelistAdapter(connextSenderAdapter.address, true);
      });

      it('should revert', async () => {
        await expect(dataFeed.sendObservations(connextSenderAdapter.address, RANDOM_CHAIN_ID, KP3R, WETH, FEE, secondsAgos)).to.be.revertedWith(
          'DestinationDomainIdNotSet()'
        );
      });
    });

    context('when only the adapter and the destination domain are set', () => {
      beforeEach(async () => {
        await dataFeed.connect(governance).whitelistAdapter(connextSenderAdapter.address, true);
        await dataFeed
          .connect(governance)
          .setDestinationDomainId(connextSenderAdapter.address, RANDOM_CHAIN_ID, GOERLI_DESTINATION_DOMAIN_CONNEXT);
      });

      it('should revert', async () => {
        await expect(dataFeed.sendObservations(connextSenderAdapter.address, RANDOM_CHAIN_ID, KP3R, WETH, FEE, secondsAgos)).to.be.revertedWith(
          'ReceiverNotSet()'
        );
      });
    });

    context('when the adapter, destination domain and receiver are set, but the adapter is not whitelisted in the data receiver', () => {
      beforeEach(async () => {
        await dataFeed.connect(governance).whitelistAdapter(connextSenderAdapter.address, true);
        await dataFeed
          .connect(governance)
          .setDestinationDomainId(connextSenderAdapter.address, RANDOM_CHAIN_ID, GOERLI_DESTINATION_DOMAIN_CONNEXT);
        await dataFeed
          .connect(governance)
          .setReceiver(connextSenderAdapter.address, GOERLI_DESTINATION_DOMAIN_CONNEXT, connextReceiverAdapter.address);
      });

      it('should revert', async () => {
        await expect(dataFeed.sendObservations(connextSenderAdapter.address, RANDOM_CHAIN_ID, KP3R, WETH, FEE, secondsAgos)).to.be.revertedWith(
          'UnallowedAdapter()'
        );
      });
    });

    context('when the adapter, destination domain and receiver are set and whitelisted', () => {
      beforeEach(async () => {
        await dataFeed.connect(governance).whitelistAdapter(connextSenderAdapter.address, true);
        await dataFeed
          .connect(governance)
          .setDestinationDomainId(connextSenderAdapter.address, RANDOM_CHAIN_ID, GOERLI_DESTINATION_DOMAIN_CONNEXT);
        await dataFeed
          .connect(governance)
          .setReceiver(connextSenderAdapter.address, GOERLI_DESTINATION_DOMAIN_CONNEXT, connextReceiverAdapter.address);
        await dataReceiver.connect(governance).whitelistAdapter(connextReceiverAdapter.address, true);
      });

      context('when the oracle has no data', () => {
        beforeEach(async () => {
          /// @notice: creates a random swap to avoid cache
          await uniswapV3Swap(KP3R, swapAmount.add(Math.floor(Math.random() * 10e9)), WETH, FEE);
          now = (await ethers.provider.getBlock('latest')).timestamp;
          await evm.advanceTimeAndBlock(hours / 2);

          /// @notice: swap happens at now - hours/2
          blockTimestamps = [now - 4 * hours, now - 3 * hours, now - 2 * hours, now - hours, now];

          ({ tickCumulativesDeltas, arithmeticMeanTicks } = await observePool(uniswapV3K3PR, blockTimestamps, 0, toBN(0)));
        });

        it('should bridge the data and add the observations correctly', async () => {
          ({ tickCumulatives, secondsPerLiquidityCumulativeX128s } = calculateOracleObservations(
            blockTimestamps,
            arithmeticMeanTicks,
            0,
            toBN(0),
            toBN(0),
            toBN(0)
          ));
          observationsIndex = 0;

          let expectedObservation1 = [blockTimestamps[1], tickCumulatives[1], secondsPerLiquidityCumulativeX128s[1], true];
          let expectedObservation2 = [blockTimestamps[2], tickCumulatives[2], secondsPerLiquidityCumulativeX128s[2], true];

          ({ secondsAgos } = await getSecondsAgos(blockTimestamps));

          await dataFeed.sendObservations(connextSenderAdapter.address, RANDOM_CHAIN_ID, KP3R, WETH, FEE, secondsAgos);

          let observation1 = await oracleSidechain.observations(observationsIndex++);
          let observation2 = await oracleSidechain.observations(observationsIndex++);
          let lastTick = await oracleSidechain.lastTick();

          expect(observation1).to.eql(expectedObservation1);
          expect(observation2).to.eql(expectedObservation2);
          expect(lastTick).to.eq(arithmeticMeanTicks[arithmeticMeanTicks.length - 1]);
        });

        it('should keep consistency of tickCumulativesDelta between bridged observations', async () => {
          ({ secondsAgos } = await getSecondsAgos(blockTimestamps));

          await dataFeed.sendObservations(connextSenderAdapter.address, RANDOM_CHAIN_ID, KP3R, WETH, FEE, secondsAgos);

          const sampleTimestamps = [now - 2 * hours, now]; // indexes 2 and 4
          const sampleDelta = 2 * hours;

          ({ secondsAgos } = await getSecondsAgos(sampleTimestamps));

          let [oracleTickCumulatives] = await oracleSidechain.callStatic.observe([secondsAgos[0], secondsAgos[1]]);
          let [poolTickCumulatives] = await uniswapV3K3PR.callStatic.observe([secondsAgos[0], secondsAgos[1]]);

          let oracleTickCumulativesDelta = oracleTickCumulatives[1].sub(oracleTickCumulatives[0]);
          let poolTickCumulativesDelta = poolTickCumulatives[1].sub(poolTickCumulatives[0]);

          // to have a max difference of 1 tick (as inconvenient rounding may apply): 1 tick * sampleDelta = sampleDelta
          expect(oracleTickCumulativesDelta).to.be.closeTo(poolTickCumulativesDelta, sampleDelta);
        });
      });

      context('when the oracle has data', () => {
        let lastBlockTimestampBridged: number;
        let lastTickCumulativeBridged: BigNumber;
        let lastArithmeticMeanTickBridged: BigNumber;
        let lastTickCumulative: BigNumber;
        let lastSecondsPerLiquidityCumulativeX128: BigNumber;
        beforeEach(async () => {
          /// @notice: creates a random swap to avoid cache
          await uniswapV3Swap(KP3R, swapAmount.add(Math.floor(Math.random() * 10e9)), WETH, FEE);
          now = (await ethers.provider.getBlock('latest')).timestamp;
          await evm.advanceTimeAndBlock(hours / 2);

          /// @notice: swap happens at now - hours/2
          blockTimestamps = [now - 4 * hours, now - 3 * hours, now - 2 * hours, now - hours, now];

          ({ tickCumulatives, arithmeticMeanTicks } = await observePool(uniswapV3K3PR, blockTimestamps, 0, toBN(0)));

          lastBlockTimestampBridged = blockTimestamps[blockTimestamps.length - 1];
          lastTickCumulativeBridged = tickCumulatives[tickCumulatives.length - 1];
          lastArithmeticMeanTickBridged = arithmeticMeanTicks[arithmeticMeanTicks.length - 1];

          ({ tickCumulatives, secondsPerLiquidityCumulativeX128s } = calculateOracleObservations(
            blockTimestamps,
            arithmeticMeanTicks,
            0,
            toBN(0),
            toBN(0),
            toBN(0)
          ));
          observationsIndex = blockTimestamps.length - 1;
          lastTickCumulative = tickCumulatives[tickCumulatives.length - 1];
          lastSecondsPerLiquidityCumulativeX128 = secondsPerLiquidityCumulativeX128s[secondsPerLiquidityCumulativeX128s.length - 1];

          ({ secondsAgos } = await getSecondsAgos(blockTimestamps));

          await dataFeed.sendObservations(connextSenderAdapter.address, RANDOM_CHAIN_ID, KP3R, WETH, FEE, secondsAgos);

          await evm.advanceTimeAndBlock(4 * hours);
        });

        context('when the data to be sent is continuous with that of the oracle', () => {
          beforeEach(async () => {
            blockTimestamps = [now, now + hours, now + 2 * hours, now + 4 * hours];

            ({ tickCumulativesDeltas, arithmeticMeanTicks } = await observePool(
              uniswapV3K3PR,
              blockTimestamps,
              lastBlockTimestampBridged,
              lastTickCumulativeBridged
            ));
          });

          it('should bridge the data and add the observations correctly', async () => {
            ({ tickCumulatives, secondsPerLiquidityCumulativeX128s } = calculateOracleObservations(
              blockTimestamps,
              arithmeticMeanTicks,
              lastBlockTimestampBridged,
              lastArithmeticMeanTickBridged,
              lastTickCumulative,
              lastSecondsPerLiquidityCumulativeX128
            ));

            let expectedObservation1 = [blockTimestamps[1], tickCumulatives[1], secondsPerLiquidityCumulativeX128s[1], true];
            let expectedObservation2 = [blockTimestamps[2], tickCumulatives[2], secondsPerLiquidityCumulativeX128s[2], true];

            ({ secondsAgos } = await getSecondsAgos(blockTimestamps));

            await dataFeed.sendObservations(connextSenderAdapter.address, RANDOM_CHAIN_ID, KP3R, WETH, FEE, secondsAgos);
            let observation1 = await oracleSidechain.observations(observationsIndex++);
            let observation2 = await oracleSidechain.observations(observationsIndex++);
            let lastTick = await oracleSidechain.lastTick();

            expect(observation1).to.eql(expectedObservation1);
            expect(observation2).to.eql(expectedObservation2);
            expect(lastTick).to.eq(arithmeticMeanTicks[arithmeticMeanTicks.length - 1]);
          });

          it.skip('should keep consistency of tickCumulativesDelta between bridged observations', async () => {
            ({ secondsAgos } = await getSecondsAgos(blockTimestamps));

            await dataFeed.sendObservations(connextSenderAdapter.address, RANDOM_CHAIN_ID, KP3R, WETH, FEE, secondsAgos);
            await evm.advanceTimeAndBlock(2 * hours);

            const sampleTimestamps = [now - 2 * hours, now + 4 * hours];
            const sampleDelta = 6 * hours;

            ({ secondsAgos } = await getSecondsAgos(sampleTimestamps));

            let [oracleTickCumulatives] = await oracleSidechain.callStatic.observe([secondsAgos[0], secondsAgos[1]]);
            let [poolTickCumulatives] = await uniswapV3K3PR.callStatic.observe([secondsAgos[0], secondsAgos[1]]);

            let oracleTickCumulativesDelta = oracleTickCumulatives[1].sub(oracleTickCumulatives[0]);
            let poolTickCumulativesDelta = poolTickCumulatives[1].sub(poolTickCumulatives[0]);

            // to have a max difference of 1 tick (as inconvenient rounding may apply): 1 tick * sampleDelta = sampleDelta
            expect(oracleTickCumulativesDelta).to.be.closeTo(poolTickCumulativesDelta, sampleDelta);
          });
        });

        context('when the data to be sent is discontinuous with that of the oracle', () => {
          beforeEach(async () => {
            blockTimestamps = [now + hours, now + 2 * hours, now + 4 * hours];

            ({ tickCumulativesDeltas, arithmeticMeanTicks } = await observePool(
              uniswapV3K3PR,
              blockTimestamps,
              lastBlockTimestampBridged,
              lastTickCumulativeBridged
            ));
          });

          it('should bridge the data and add the observations correctly', async () => {
            ({ tickCumulatives, secondsPerLiquidityCumulativeX128s } = calculateOracleObservations(
              blockTimestamps,
              arithmeticMeanTicks,
              lastBlockTimestampBridged,
              lastArithmeticMeanTickBridged,
              lastTickCumulative,
              lastSecondsPerLiquidityCumulativeX128
            ));

            let expectedObservation0 = [blockTimestamps[0], tickCumulatives[0], secondsPerLiquidityCumulativeX128s[0], true];
            let expectedObservation1 = [blockTimestamps[1], tickCumulatives[1], secondsPerLiquidityCumulativeX128s[1], true];
            let expectedObservation2 = [blockTimestamps[2], tickCumulatives[2], secondsPerLiquidityCumulativeX128s[2], true];

            ({ secondsAgos } = await getSecondsAgos(blockTimestamps));

            await dataFeed.sendObservations(connextSenderAdapter.address, RANDOM_CHAIN_ID, KP3R, WETH, FEE, secondsAgos);
            let observation0 = await oracleSidechain.observations(observationsIndex++);
            let observation1 = await oracleSidechain.observations(observationsIndex++);
            let observation2 = await oracleSidechain.observations(observationsIndex++);
            let lastTick = await oracleSidechain.lastTick();

            expect(observation0).to.eql(expectedObservation0);
            expect(observation1).to.eql(expectedObservation1);
            expect(observation2).to.eql(expectedObservation2);
            expect(lastTick).to.eq(arithmeticMeanTicks[arithmeticMeanTicks.length - 1]);
          });

          it.skip('should keep consistency of tickCumulativesDelta between bridged observations', async () => {
            ({ secondsAgos } = await getSecondsAgos(blockTimestamps));

            await dataFeed.sendObservations(connextSenderAdapter.address, RANDOM_CHAIN_ID, KP3R, WETH, FEE, secondsAgos);
            await evm.advanceTimeAndBlock(2 * hours);

            const sampleTimestamps = [now - 2 * hours, now + 4 * hours];
            const sampleDelta = 6 * hours;

            ({ secondsAgos } = await getSecondsAgos(sampleTimestamps));

            let [oracleTickCumulatives] = await oracleSidechain.callStatic.observe([secondsAgos[0], secondsAgos[1]]);
            let [poolTickCumulatives] = await uniswapV3K3PR.callStatic.observe([secondsAgos[0], secondsAgos[1]]);

            let oracleTickCumulativesDelta = oracleTickCumulatives[1].sub(oracleTickCumulatives[0]);
            let poolTickCumulativesDelta = poolTickCumulatives[1].sub(poolTickCumulatives[0]);

            // to have a max difference of 1 tick (as inconvenient rounding may apply): 1 tick * sampleDelta = sampleDelta
            expect(oracleTickCumulativesDelta).to.be.closeTo(poolTickCumulativesDelta, sampleDelta);
          });
        });
      });
    });
  });
});
