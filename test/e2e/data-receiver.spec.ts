import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ConnextReceiverAdapter, ConnextSenderAdapter, DataFeed, DataReceiver, OracleSidechain } from '@typechained';
import { UniswapV3Pool } from '@eth-sdk-types';
import { evm } from '@utils';
import { getNodeUrl } from 'utils/env';
import forkBlockNumber from './fork-block-numbers';
import { expect } from 'chai';
import { setupContracts } from './common';
import { RANDOM_CHAIN_ID } from '@utils/constants';
import { GOERLI_DESTINATION_DOMAIN_CONNEXT } from 'utils/constants';
import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';

describe('@skip-on-coverage DataReceiver.sol', () => {
  let governance: SignerWithAddress;
  let stranger: SignerWithAddress;
  let dataReceiver: DataReceiver;
  let dataFeed: DataFeed;
  let connextSenderAdapter: ConnextSenderAdapter;
  let connextReceiverAdapter: ConnextReceiverAdapter;
  let oracleSidechain: OracleSidechain;
  let uniswapV3K3PR: UniswapV3Pool;
  let snapshotId: string;

  before(async () => {
    await evm.reset({
      jsonRpcUrl: getNodeUrl('ethereum'),
      blockNumber: forkBlockNumber.oracleSidechain,
    });

    ({ governance, stranger, oracleSidechain, dataReceiver, dataFeed, connextSenderAdapter, connextReceiverAdapter, uniswapV3K3PR } =
      await setupContracts());

    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
    await dataFeed.connect(governance).whitelistAdapter(connextSenderAdapter.address, true);
    await dataFeed.connect(governance).setDestinationDomainId(connextSenderAdapter.address, RANDOM_CHAIN_ID, GOERLI_DESTINATION_DOMAIN_CONNEXT);
    await dataFeed
      .connect(governance)
      .setReceiver(connextSenderAdapter.address, GOERLI_DESTINATION_DOMAIN_CONNEXT, connextReceiverAdapter.address);
    await dataReceiver.connect(governance).whitelistAdapter(connextReceiverAdapter.address, true);
  });

  describe('adding an observation', () => {
    let initializeTimestamp: number;
    let writeTimestamp: number;
    let initialTick: number;
    let tick: number;
    let secondsNow: number;
    let secondsAgo: number;
    let secondsAgos: number[];
    let delta: number;
    let arithmeticMeanBlockTimestamp: number;
    let arithmeticMeanTick: BigNumber;
    let tickCumulatives: BigNumber[];
    let tickCumulativesDelta: BigNumber;

    before(async () => {
      secondsAgo = 30;
      initialTick = 50;
      tick = 100;
      writeTimestamp = 1000000;
      delta = 20;
      initializeTimestamp = writeTimestamp - delta;
      secondsAgos = [secondsAgo, secondsAgo - delta];
      [tickCumulatives] = await uniswapV3K3PR.observe(secondsAgos);
      tickCumulativesDelta = tickCumulatives[1].sub(tickCumulatives[0]);
      arithmeticMeanTick = tickCumulativesDelta.div(delta);
    });

    it.skip('should revert if the oracle is not initialized', async () => {
      await expect(dataReceiver.addObservation(writeTimestamp, tick)).to.be.revertedWith('CustomError()');
    });

    context('when the oracle is initialized', () => {
      beforeEach(async () => {
        await oracleSidechain.initialize(initializeTimestamp, initialTick);
      });

      it('should revert if the caller is not a whitelisted adapter', async () => {
        await expect(dataReceiver.connect(stranger).addObservation(writeTimestamp, tick)).to.be.revertedWith('UnallowedAdapter()');
      });

      context('when the observation is writable', () => {
        it('should add an observation', async () => {
          secondsNow = (await ethers.provider.getBlock('latest')).timestamp + 1;
          arithmeticMeanBlockTimestamp = (secondsNow - secondsAgos[0] + (secondsNow - secondsAgos[1])) / 2;

          await expect(dataFeed.sendObservation(connextSenderAdapter.address, RANDOM_CHAIN_ID, uniswapV3K3PR.address, secondsAgos))
            .to.emit(oracleSidechain, 'ObservationWritten')
            .withArgs(dataReceiver.address, arithmeticMeanBlockTimestamp, arithmeticMeanTick);
        });

        it('should emit ObservationAdded', async () => {
          secondsNow = (await ethers.provider.getBlock('latest')).timestamp + 1;
          arithmeticMeanBlockTimestamp = (secondsNow - secondsAgos[0] + (secondsNow - secondsAgos[1])) / 2;

          await expect(dataFeed.sendObservation(connextSenderAdapter.address, RANDOM_CHAIN_ID, uniswapV3K3PR.address, secondsAgos))
            .to.emit(dataReceiver, 'ObservationAdded')
            .withArgs(connextReceiverAdapter.address, arithmeticMeanBlockTimestamp, arithmeticMeanTick);
        });
      });

      context('when the observation is not writable', () => {
        beforeEach(async () => {
          await dataFeed.sendObservation(connextSenderAdapter.address, RANDOM_CHAIN_ID, uniswapV3K3PR.address, secondsAgos);
        });

        it('should revert the tx', async () => {
          secondsNow = (await ethers.provider.getBlock('latest')).timestamp + 1;
          let olderSecondsAgo = [secondsAgos[0] + 100, secondsAgos[1] + 50];
          let olderArithmeticMeanBlockTimestamp = (secondsNow - olderSecondsAgo[0] + (secondsNow - olderSecondsAgo[1])) / 2;

          await expect(
            dataFeed.sendObservation(connextSenderAdapter.address, RANDOM_CHAIN_ID, uniswapV3K3PR.address, olderSecondsAgo)
          ).to.be.revertedWith(`ObservationNotWritable(${olderArithmeticMeanBlockTimestamp})`);
        });
      });
    });
  });
});
