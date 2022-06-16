import { ethers, network } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { DataReceiver, DataReceiver__factory, OracleSidechain, OracleSidechain__factory } from '@typechained';
import { getMainnetSdk } from '@dethcrypto/eth-sdk-client';
import { UniswapV3Factory } from '@eth-sdk-types';
import { evm } from '@utils';
import { toBN } from '@utils/bn';
import { MIN_SQRT_RATIO } from '@utils/constants';
import { getNodeUrl } from 'utils/env';
import forkBlockNumber from './fork-block-numbers';
import { expect } from 'chai';

describe('@skip-on-coverage DataReceiver.sol', () => {
  let stranger: SignerWithAddress;
  let deployer: SignerWithAddress;
  let dataReceiver: DataReceiver;
  let dataReceiverFactory: DataReceiver__factory;
  let oracleSidechain: OracleSidechain;
  let oracleSidechainFactory: OracleSidechain__factory;
  let uniswapV3Factory: UniswapV3Factory;
  let snapshotId: string;

  before(async () => {
    await evm.reset({
      jsonRpcUrl: getNodeUrl('ethereum'),
      blockNumber: forkBlockNumber.oracleSidechain,
    });
    [stranger, deployer] = await ethers.getSigners();
    uniswapV3Factory = getMainnetSdk(stranger).uniswapV3Factory;
    oracleSidechainFactory = await ethers.getContractFactory('OracleSidechain');
    oracleSidechain = await oracleSidechainFactory.connect(deployer).deploy();
    dataReceiverFactory = await ethers.getContractFactory('DataReceiver');
    dataReceiver = await dataReceiverFactory.connect(deployer).deploy(oracleSidechain.address);
    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('adding an observation', () => {
    let tick = 100;
    let delta = 2;

    it.skip('should revert if the oracle is not initialized', async () => {
      let writeTimestamp = toBN((await network.provider.send('eth_getBlockByNumber', ['pending', false])).timestamp).toNumber();
      await expect(dataReceiver.addObservation(writeTimestamp, tick)).to.be.reverted;
    });

    context('when the oracle is initialized', () => {
      beforeEach(async () => {
        await oracleSidechain.initialize(MIN_SQRT_RATIO);
        await evm.advanceTimeAndBlock(delta - 1);
      });

      context('when the observation is writable', () => {
        let writeTimestamp: number;

        beforeEach(async () => {
          writeTimestamp = toBN((await network.provider.send('eth_getBlockByNumber', ['pending', false])).timestamp).toNumber();
        });

        it('should add an observation', async () => {
          await expect(dataReceiver.addObservation(writeTimestamp, tick))
            .to.emit(oracleSidechain, 'ObservationWritten')
            .withArgs(dataReceiver.address, writeTimestamp, tick);
        });

        it('should emit ObservationAdded', async () => {
          await expect(dataReceiver.connect(stranger).addObservation(writeTimestamp, tick))
            .to.emit(dataReceiver, 'ObservationAdded')
            .withArgs(stranger.address, writeTimestamp, tick);
        });
      });

      context('when the observation is not writable', () => {
        let writeTimestampAt: number;
        let writeTimestampBefore: number;

        beforeEach(async () => {
          writeTimestampAt = toBN((await network.provider.send('eth_getBlockByNumber', ['pending', false])).timestamp).toNumber() - delta;
          writeTimestampBefore = writeTimestampAt - 1;
        });

        it('should revert the tx', async () => {
          await expect(dataReceiver.addObservation(writeTimestampAt, tick)).to.be.revertedWith(`ObservationNotWritable(${writeTimestampAt})`);
          await expect(dataReceiver.addObservation(writeTimestampBefore, tick)).to.be.revertedWith(
            `ObservationNotWritable(${writeTimestampBefore})`
          );
        });
      });
    });
  });
});
