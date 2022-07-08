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
    let secondsAgos: number[];
    let arithmeticMeanBlockTimestamp1: number;
    let arithmeticMeanTick1: BigNumber;
    let arithmeticMeanBlockTimestamp2: number;
    let arithmeticMeanTick2: BigNumber;

    before(async () => {
      let secondsNow = (await ethers.provider.getBlock('latest')).timestamp + 7;
      let secondsAgo = 30;
      let secondsAgosDelta1 = 20;
      let secondsAgosDelta2 = 10;
      secondsAgos = [secondsAgo, secondsAgo - secondsAgosDelta1, secondsAgo - (secondsAgosDelta1 + secondsAgosDelta2)];
      let [tickCumulatives] = await uniswapV3K3PR.observe(secondsAgos);
      let tickCumulativesDelta1 = tickCumulatives[1].sub(tickCumulatives[0]);
      arithmeticMeanBlockTimestamp1 = (secondsNow - secondsAgos[0] + (secondsNow - secondsAgos[1])) / 2;
      arithmeticMeanTick1 = tickCumulativesDelta1.div(secondsAgosDelta1);
      let tickCumulativesDelta2 = tickCumulatives[2].sub(tickCumulatives[1]);
      arithmeticMeanBlockTimestamp2 = (secondsNow - secondsAgos[1] + (secondsNow - secondsAgos[2])) / 2;
      arithmeticMeanTick2 = tickCumulativesDelta2.div(secondsAgosDelta2);
    });

    context('when the adapter is not set', () => {
      it('should revert', async () => {
        await expect(
          dataFeed.sendObservations(connextSenderAdapter.address, RANDOM_CHAIN_ID, uniswapV3K3PR.address, secondsAgos)
        ).to.be.revertedWith('UnallowedAdapter()');
      });
    });

    context('when only the adapter is set', () => {
      it('should revert', async () => {
        await dataFeed.connect(governance).whitelistAdapter(connextSenderAdapter.address, true);
        await expect(
          dataFeed.sendObservations(connextSenderAdapter.address, RANDOM_CHAIN_ID, uniswapV3K3PR.address, secondsAgos)
        ).to.be.revertedWith('DestinationDomainIdNotSet()');
      });
    });

    context('when only the adapter and the destination domain are set', () => {
      it('should revert', async () => {
        await dataFeed.connect(governance).whitelistAdapter(connextSenderAdapter.address, true);
        await dataFeed
          .connect(governance)
          .setDestinationDomainId(connextSenderAdapter.address, RANDOM_CHAIN_ID, GOERLI_DESTINATION_DOMAIN_CONNEXT);
        await expect(
          dataFeed.sendObservations(connextSenderAdapter.address, RANDOM_CHAIN_ID, uniswapV3K3PR.address, secondsAgos)
        ).to.be.revertedWith('ReceiverNotSet()');
      });
    });

    context('when the adapter, destination domain and receiver are set, but the adapter is not whitelisted in the data receiver', () => {
      it('should revert', async () => {
        await dataFeed.connect(governance).whitelistAdapter(connextSenderAdapter.address, true);
        await dataFeed
          .connect(governance)
          .setDestinationDomainId(connextSenderAdapter.address, RANDOM_CHAIN_ID, GOERLI_DESTINATION_DOMAIN_CONNEXT);
        await dataFeed
          .connect(governance)
          .setReceiver(connextSenderAdapter.address, GOERLI_DESTINATION_DOMAIN_CONNEXT, connextReceiverAdapter.address);
        await expect(
          dataFeed.sendObservations(connextSenderAdapter.address, RANDOM_CHAIN_ID, uniswapV3K3PR.address, secondsAgos)
        ).to.be.revertedWith('UnallowedAdapter()');
      });
    });

    context('when the adapter, destination domain and receiver are set and whitelisted, but the oracle is uninitialized', () => {
      it.skip('should revert if the oracle is not initialized', async () => {
        await dataFeed.connect(governance).whitelistAdapter(connextSenderAdapter.address, true);
        await dataFeed
          .connect(governance)
          .setDestinationDomainId(connextSenderAdapter.address, RANDOM_CHAIN_ID, GOERLI_DESTINATION_DOMAIN_CONNEXT);
        await dataFeed
          .connect(governance)
          .setReceiver(connextSenderAdapter.address, GOERLI_DESTINATION_DOMAIN_CONNEXT, connextReceiverAdapter.address);
        await dataReceiver.connect(governance).whitelistAdapter(connextReceiverAdapter.address, true);
        await expect(
          dataFeed.sendObservations(dataReceiver.address, GOERLI_DESTINATION_DOMAIN_CONNEXT, uniswapV3K3PR.address, secondsAgos)
        ).to.be.revertedWith('CustomError()');
      });
    });

    context('when the adapter, destination domain and receiver are set and whitelisted, and the oracle is initialized', () => {
      let initializeTimestamp = 500000;
      let initialTick = 50;
      let initialObservationData = [initializeTimestamp, initialTick] as IOracleSidechain.ObservationDataStructOutput;

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
        await oracleSidechain.increaseObservationCardinalityNext(2);
      });

      it('should bridge the data and add the observations correctly', async () => {
        let observationsDelta1 = arithmeticMeanBlockTimestamp1 - initializeTimestamp;
        let observationsDelta2 = arithmeticMeanBlockTimestamp2 - arithmeticMeanBlockTimestamp1;

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

        let expectedObservation1 = [arithmeticMeanBlockTimestamp1, tickCumulative1, secondsPerLiquidityCumulativeX128_1, true];
        let expectedObservation2 = [arithmeticMeanBlockTimestamp2, tickCumulative2, secondsPerLiquidityCumulativeX128_2, true];

        await dataFeed.sendObservations(connextSenderAdapter.address, RANDOM_CHAIN_ID, uniswapV3K3PR.address, secondsAgos);
        let observation1 = await oracleSidechain.observations(1);
        let observation2 = await oracleSidechain.observations(0);
        expect(observation1).to.eql(expectedObservation1);
        expect(observation2).to.eql(expectedObservation2);
      });
    });
  });
});
