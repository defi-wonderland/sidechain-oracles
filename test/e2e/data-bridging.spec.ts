import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { DataFeed, ConnextSenderAdapter, ConnextReceiverAdapter, DataReceiver, OracleSidechain, IOracleSidechain } from '@typechained';
import { UniswapV3Pool } from '@eth-sdk-types';
import { evm } from '@utils';
import { RANDOM_CHAIN_ID } from '@utils/constants';
import { toBN } from '@utils/bn';
import { GOERLI_DESTINATION_DOMAIN_CONNEXT } from 'utils/constants';
import { getNodeUrl } from 'utils/env';
import forkBlockNumber from './fork-block-numbers';
import { setupContracts } from './common';
import { expect } from 'chai';

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

  describe('observation bridging flow', () => {
    let secondsNow: number;
    let secondsAgo = 30;
    let secondsAgosDelta1 = 20;
    let secondsAgosDelta2 = 10;
    let secondsAgos = [secondsAgo, secondsAgo - secondsAgosDelta1, secondsAgo - (secondsAgosDelta1 + secondsAgosDelta2)];
    let tickCumulativesDelta1: BigNumber;
    let tickCumulativesDelta2: BigNumber;
    let tickCumulatives: BigNumber[];
    let blockTimestamp1: number;
    let blockTimestamp2: number;
    let arithmeticMeanTick1: BigNumber;
    let arithmeticMeanTick2: BigNumber;

    context('when the adapter is not set', () => {
      it('should revert', async () => {
        await expect(
          dataFeed.sendObservations(connextSenderAdapter.address, RANDOM_CHAIN_ID, uniswapV3K3PR.address, secondsAgos)
        ).to.be.revertedWith('UnallowedAdapter()');
      });
    });

    context('when only the adapter is set', () => {
      beforeEach(async () => {
        await dataFeed.connect(governance).whitelistAdapter(connextSenderAdapter.address, true);
      });

      it('should revert', async () => {
        await expect(
          dataFeed.sendObservations(connextSenderAdapter.address, RANDOM_CHAIN_ID, uniswapV3K3PR.address, secondsAgos)
        ).to.be.revertedWith('DestinationDomainIdNotSet()');
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
        await expect(
          dataFeed.sendObservations(connextSenderAdapter.address, RANDOM_CHAIN_ID, uniswapV3K3PR.address, secondsAgos)
        ).to.be.revertedWith('ReceiverNotSet()');
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
        await expect(
          dataFeed.sendObservations(connextSenderAdapter.address, RANDOM_CHAIN_ID, uniswapV3K3PR.address, secondsAgos)
        ).to.be.revertedWith('UnallowedAdapter()');
      });
    });

    context('when the adapter, destination domain and receiver are set and whitelisted, but the oracle is uninitialized', () => {
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

      it.skip('should revert if the oracle is not initialized', async () => {
        await expect(
          dataFeed.sendObservations(dataReceiver.address, GOERLI_DESTINATION_DOMAIN_CONNEXT, uniswapV3K3PR.address, secondsAgos)
        ).to.be.revertedWith('CustomError()');
      });
    });

    context('when the adapter, destination domain and receiver are set and whitelisted, and the oracle is initialized', () => {
      let initialBlockTimestamp = 500000;
      let initialTick = 50;
      let initialObservationData = [initialBlockTimestamp, initialTick] as IOracleSidechain.ObservationDataStructOutput;

      beforeEach(async () => {
        await dataFeed.connect(governance).whitelistAdapter(connextSenderAdapter.address, true);
        await dataFeed
          .connect(governance)
          .setDestinationDomainId(connextSenderAdapter.address, RANDOM_CHAIN_ID, GOERLI_DESTINATION_DOMAIN_CONNEXT);
        await dataFeed
          .connect(governance)
          .setReceiver(connextSenderAdapter.address, GOERLI_DESTINATION_DOMAIN_CONNEXT, connextReceiverAdapter.address);
        await dataReceiver.connect(governance).whitelistAdapter(connextReceiverAdapter.address, true);
        await oracleSidechain.initialize(initialObservationData);
      });

      context('when the data is continuous with that of the oracle', () => {
        beforeEach(async () => {
          await oracleSidechain.increaseObservationCardinalityNext(2);
          await evm.advanceTimeAndBlock(1);
          secondsNow = (await ethers.provider.getBlock('latest')).timestamp;
          blockTimestamp1 = secondsNow - secondsAgos[1];
          blockTimestamp2 = secondsNow - secondsAgos[2];
          [tickCumulatives] = await uniswapV3K3PR.observe(secondsAgos);
          tickCumulativesDelta1 = tickCumulatives[1].sub(tickCumulatives[0]);
          tickCumulativesDelta2 = tickCumulatives[2].sub(tickCumulatives[1]);
          arithmeticMeanTick1 = tickCumulativesDelta1.div(secondsAgosDelta1);
          arithmeticMeanTick2 = tickCumulativesDelta2.div(secondsAgosDelta2);
          await evm.advanceTimeAndBlock(-1);
        });

        it('should bridge the data and add the observations correctly', async () => {
          let observationsDelta1 = blockTimestamp1 - initialBlockTimestamp;
          let observationsDelta2 = blockTimestamp2 - blockTimestamp1;

          // tickCumulative in new observation formula = last tickCumulative + tick * delta, in this case we can omit last.tickCumulative as it's 0
          // due to initialize() being the prev obs writer
          let tickCumulative1 = arithmeticMeanTick1.mul(observationsDelta1);
          let tickCumulative2 = tickCumulative1.add(arithmeticMeanTick2.mul(observationsDelta2));

          // formula = lastSecondsPLCX128 + (delta << 128) / (liquidity > 0 ? liquidity : 1)
          // lastSecondsPLCX128 = 0 because of initialize initializing it as 0, delta remains as it is, and liquidity is 0 due to our changes so it will always be
          // divided by 1
          // final formula = lastSecondsPLCX128 + (delta << 128) / 1, which in this case is 0 + (delta << 128)
          let secondsPerLiquidityCumulativeX128_1 = toBN(observationsDelta1).shl(128);
          let secondsPerLiquidityCumulativeX128_2 = secondsPerLiquidityCumulativeX128_1.add(toBN(observationsDelta2).shl(128));

          let expectedObservation1 = [blockTimestamp1, tickCumulative1, secondsPerLiquidityCumulativeX128_1, true];
          let expectedObservation2 = [blockTimestamp2, tickCumulative2, secondsPerLiquidityCumulativeX128_2, true];

          await dataFeed.sendObservations(connextSenderAdapter.address, RANDOM_CHAIN_ID, uniswapV3K3PR.address, secondsAgos);
          let observation1 = await oracleSidechain.observations(1);
          let observation2 = await oracleSidechain.observations(0);
          expect(observation1).to.eql(expectedObservation1);
          expect(observation2).to.eql(expectedObservation2);
        });

        it('should keep consistency of tickCumulativesDelta between bridged observations', async () => {
          await dataFeed.sendObservations(connextSenderAdapter.address, RANDOM_CHAIN_ID, uniswapV3K3PR.address, secondsAgos);
          let [oracleTickCumulatives] = await oracleSidechain.observe([secondsAgos[1], secondsAgos[2]]);
          let oracleTickCumulativesDelta = oracleTickCumulatives[1].sub(oracleTickCumulatives[0]);
          expect(oracleTickCumulativesDelta).to.eq(tickCumulativesDelta2);
        });
      });

      context('when the data is discontinuous with that of the oracle', () => {
        let secondsAgosDelta0 = 40;
        let tickCumulativesDelta0: BigNumber;
        let lastBlockTimestampBridged: number;
        let lastTickCumulativeBridged: BigNumber;
        let blockTimestamp0: number;
        let arithmeticMeanTick0: BigNumber;
        let observationsDelta1: number;
        let observationsDelta2: number;
        let tickCumulative1: BigNumber;
        let lastTickCumulative: BigNumber;
        let secondsPerLiquidityCumulativeX128_1: BigNumber;
        let lastSecondsPerLiquidityCumulativeX128: BigNumber;

        beforeEach(async () => {
          await oracleSidechain.increaseObservationCardinalityNext(3);
          await dataFeed.sendObservations(connextSenderAdapter.address, RANDOM_CHAIN_ID, uniswapV3K3PR.address, secondsAgos);
          secondsNow = (await ethers.provider.getBlock('latest')).timestamp;
          blockTimestamp1 = secondsNow - secondsAgos[1];
          lastBlockTimestampBridged = secondsNow - secondsAgos[2];
          [tickCumulatives] = await uniswapV3K3PR.observe(secondsAgos);
          lastTickCumulativeBridged = tickCumulatives[2];
          tickCumulativesDelta1 = tickCumulatives[1].sub(tickCumulatives[0]);
          tickCumulativesDelta2 = tickCumulatives[2].sub(tickCumulatives[1]);
          arithmeticMeanTick1 = tickCumulativesDelta1.div(secondsAgosDelta1);
          arithmeticMeanTick2 = tickCumulativesDelta2.div(secondsAgosDelta2);
          observationsDelta1 = blockTimestamp1 - initialBlockTimestamp;
          observationsDelta2 = lastBlockTimestampBridged - blockTimestamp1;
          tickCumulative1 = arithmeticMeanTick1.mul(observationsDelta1);
          lastTickCumulative = tickCumulative1.add(arithmeticMeanTick2.mul(observationsDelta2));
          secondsPerLiquidityCumulativeX128_1 = toBN(observationsDelta1).shl(128);
          lastSecondsPerLiquidityCumulativeX128 = secondsPerLiquidityCumulativeX128_1.add(toBN(observationsDelta2).shl(128));
          await evm.advanceTimeAndBlock(secondsAgo + secondsAgosDelta0);
          secondsNow = (await ethers.provider.getBlock('latest')).timestamp;
          blockTimestamp0 = secondsNow - secondsAgos[0];
          blockTimestamp1 = secondsNow - secondsAgos[1];
          blockTimestamp2 = secondsNow - secondsAgos[2];
          [tickCumulatives] = await uniswapV3K3PR.observe(secondsAgos);
          tickCumulativesDelta0 = tickCumulatives[0].sub(lastTickCumulativeBridged);
          tickCumulativesDelta1 = tickCumulatives[1].sub(tickCumulatives[0]);
          tickCumulativesDelta2 = tickCumulatives[2].sub(tickCumulatives[1]);
          arithmeticMeanTick0 = tickCumulativesDelta0.div(secondsAgosDelta0);
          arithmeticMeanTick1 = tickCumulativesDelta1.div(secondsAgosDelta1);
          arithmeticMeanTick2 = tickCumulativesDelta2.div(secondsAgosDelta2);
          await evm.advanceTimeAndBlock(-1);
        });

        it('should bridge the data and add the observations correctly', async () => {
          let observationsDelta0 = blockTimestamp0 - lastBlockTimestampBridged;
          observationsDelta1 = blockTimestamp1 - blockTimestamp0;
          observationsDelta2 = blockTimestamp2 - blockTimestamp1;

          // tickCumulative in new observation formula = last tickCumulative + tick * delta
          let tickCumulative0 = lastTickCumulative.add(arithmeticMeanTick0.mul(observationsDelta0));
          tickCumulative1 = tickCumulative0.add(arithmeticMeanTick1.mul(observationsDelta1));
          let tickCumulative2 = tickCumulative1.add(arithmeticMeanTick2.mul(observationsDelta2));

          // formula = lastSecondsPLCX128 + (delta << 128) / (liquidity > 0 ? liquidity : 1)
          // liquidity is 0 due to our changes so it will always be divided by 1
          // final formula = lastSecondsPLCX128 + (delta << 128) / 1, which in this case is lastSecondsPLCX128 + (delta << 128)
          let secondsPerLiquidityCumulativeX128_0 = lastSecondsPerLiquidityCumulativeX128.add(toBN(observationsDelta0).shl(128));
          secondsPerLiquidityCumulativeX128_1 = secondsPerLiquidityCumulativeX128_0.add(toBN(observationsDelta1).shl(128));
          let secondsPerLiquidityCumulativeX128_2 = secondsPerLiquidityCumulativeX128_1.add(toBN(observationsDelta2).shl(128));

          let expectedObservation0 = [blockTimestamp0, tickCumulative0, secondsPerLiquidityCumulativeX128_0, true];
          let expectedObservation1 = [blockTimestamp1, tickCumulative1, secondsPerLiquidityCumulativeX128_1, true];
          let expectedObservation2 = [blockTimestamp2, tickCumulative2, secondsPerLiquidityCumulativeX128_2, true];

          await dataFeed.sendObservations(connextSenderAdapter.address, RANDOM_CHAIN_ID, uniswapV3K3PR.address, secondsAgos);
          let observation0 = await oracleSidechain.observations(0);
          let observation1 = await oracleSidechain.observations(1);
          let observation2 = await oracleSidechain.observations(2);
          expect(observation0).to.eql(expectedObservation0);
          expect(observation1).to.eql(expectedObservation1);
          expect(observation2).to.eql(expectedObservation2);
        });

        it('should keep consistency of tickCumulativesDelta between bridged observations', async () => {
          await dataFeed.sendObservations(connextSenderAdapter.address, RANDOM_CHAIN_ID, uniswapV3K3PR.address, secondsAgos);
          let [oracleTickCumulatives] = await oracleSidechain.observe(secondsAgos);
          let oracleTickCumulativesDelta1 = oracleTickCumulatives[1].sub(oracleTickCumulatives[0]);
          let oracleTickCumulativesDelta2 = oracleTickCumulatives[2].sub(oracleTickCumulatives[1]);
          expect(oracleTickCumulativesDelta1).to.eq(tickCumulativesDelta1);
          expect(oracleTickCumulativesDelta2).to.eq(tickCumulativesDelta2);
        });
      });
    });
  });
});
