import { BigNumber } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { DataReceiver, OracleSidechain, DataFeed, ConnextSenderAdapter, ConnextReceiverAdapter } from '@typechained';
import { UniswapV3Pool } from '@eth-sdk-types';
import { evm } from '@utils';
import { toBN } from '@utils/bn';
import { GOERLI_DESTINATION_DOMAIN_CONNEXT } from 'utils/constants';
import { getNodeUrl } from 'utils/env';
import forkBlockNumber from './fork-block-numbers';
import { expect } from 'chai';
import { setupContracts } from './common';
import { RANDOM_CHAIN_ID } from '@utils/constants';
import { ethers } from 'hardhat';

describe('@skip-on-coverage Data Bridging Flow', () => {
  let governance: SignerWithAddress;
  let dataReceiver: DataReceiver;
  let oracleSidechain: OracleSidechain;
  let connextSenderAdapter: ConnextSenderAdapter;
  let connextReceiverAdapter: ConnextReceiverAdapter;
  let dataFeed: DataFeed;
  let uniswapV3K3PR: UniswapV3Pool;
  let snapshotId: string;

  before(async () => {
    await evm.reset({
      jsonRpcUrl: getNodeUrl('ethereum'),
      blockNumber: forkBlockNumber.oracleSidechain,
    });

    ({ governance, uniswapV3K3PR, oracleSidechain, dataReceiver, dataFeed, connextSenderAdapter, connextReceiverAdapter } =
      await setupContracts());

    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('observation bridging flow', () => {
    let secondsAgos: number[];
    let delta: number;
    let arithmeticMeanBlockTimestamp: number;
    let arithmeticMeanTick: BigNumber;

    before(async () => {
      let secondsNow = (await ethers.provider.getBlock('latest')).timestamp + 7;
      let secondsAgo = 30;
      delta = 20;
      secondsAgos = [secondsAgo, secondsAgo - delta];
      let [tickCumulatives] = await uniswapV3K3PR.observe(secondsAgos);
      let tickCumulativesDelta = tickCumulatives[1].sub(tickCumulatives[0]);
      arithmeticMeanBlockTimestamp = (secondsNow - secondsAgos[0] + (secondsNow - secondsAgos[1])) / 2;
      arithmeticMeanTick = tickCumulativesDelta.div(delta);
    });

    context('when the adapter is not set', () => {
      it('should revert', async () => {
        await expect(
          dataFeed.sendObservation(connextSenderAdapter.address, RANDOM_CHAIN_ID, uniswapV3K3PR.address, secondsAgos)
        ).to.be.revertedWith('UnallowedAdapter()');
      });
    });

    context('when only the adapter is set', () => {
      it('should revert', async () => {
        await dataFeed.connect(governance).whitelistAdapter(connextSenderAdapter.address, true);
        await expect(
          dataFeed.sendObservation(connextSenderAdapter.address, RANDOM_CHAIN_ID, uniswapV3K3PR.address, secondsAgos)
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
          dataFeed.sendObservation(connextSenderAdapter.address, RANDOM_CHAIN_ID, uniswapV3K3PR.address, secondsAgos)
        ).to.be.revertedWith('ReceiverNotSet()');
      });
    });

    context('when the adapter is not whitelisted in the data receiver', () => {
      it('should revert', async () => {
        await dataFeed.connect(governance).whitelistAdapter(connextSenderAdapter.address, true);
        await dataFeed
          .connect(governance)
          .setDestinationDomainId(connextSenderAdapter.address, RANDOM_CHAIN_ID, GOERLI_DESTINATION_DOMAIN_CONNEXT);
        await dataFeed
          .connect(governance)
          .setReceiver(connextSenderAdapter.address, GOERLI_DESTINATION_DOMAIN_CONNEXT, connextReceiverAdapter.address);
        await expect(
          dataFeed.sendObservation(connextSenderAdapter.address, RANDOM_CHAIN_ID, uniswapV3K3PR.address, secondsAgos)
        ).to.be.revertedWith('UnallowedAdapter()');
      });
    });

    context('when the adapter, destination domain and receiver are set, but the oracle is uninitialized', () => {
      it.skip('should revert if the oracle is not initialized', async () => {
        await expect(
          dataFeed.sendObservation(dataReceiver.address, GOERLI_DESTINATION_DOMAIN_CONNEXT, uniswapV3K3PR.address, secondsAgos)
        ).to.be.revertedWith('CustomError()');
      });
    });

    context('when the oracle is initialized and the adapter, destination domain and receiver are set', () => {
      let initializeTimestamp: number;
      let initialTick = 50;

      beforeEach(async () => {
        initializeTimestamp = arithmeticMeanBlockTimestamp - delta;
        await oracleSidechain.initialize(initializeTimestamp, initialTick);
        await oracleSidechain.increaseObservationCardinalityNext(2);
        await dataFeed.connect(governance).whitelistAdapter(connextSenderAdapter.address, true);
        await dataFeed
          .connect(governance)
          .setDestinationDomainId(connextSenderAdapter.address, RANDOM_CHAIN_ID, GOERLI_DESTINATION_DOMAIN_CONNEXT);
        await dataFeed
          .connect(governance)
          .setReceiver(connextSenderAdapter.address, GOERLI_DESTINATION_DOMAIN_CONNEXT, connextReceiverAdapter.address);
        await dataReceiver.connect(governance).whitelistAdapter(connextReceiverAdapter.address, true);
      });

      it('should bridge the data and add an observation correctly', async () => {
        // tickCumulative in new observation formula = last tickCumulative + tick * delta, in this case we can omit last.tickCumulative as it's 0
        // due to initialize() being the prev obs writer
        const currentTickCumulative = arithmeticMeanTick.mul(delta);

        // formula = lastSecondsPLCX128 + (delta << 128) / (liquidity > 0 ? liquidity : 1)
        // lastSecondsPLCX128 = 0 because of initiliaze initializing it as 0, delta remains as it is, and liquidity is 0 due to our changes so it will always be
        // divided by 1
        // final formula = lastSecondsPLCX128 + (delta << 128) / 1, which in this case is 0 + (delta << 128)
        const currentSecondsPerLiquidityCumulativeX128 = toBN(delta).shl(128);

        const expectedObservation = [arithmeticMeanBlockTimestamp, currentTickCumulative, currentSecondsPerLiquidityCumulativeX128, true];
        await dataFeed.sendObservation(connextSenderAdapter.address, RANDOM_CHAIN_ID, uniswapV3K3PR.address, secondsAgos);
        expect(await oracleSidechain.observations(1)).to.deep.eq(expectedObservation);
      });
    });
  });
});
