import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { DataReceiver, DataReceiver__factory, OracleSidechain, OracleSidechain__factory } from '@typechained';
import { getMainnetSdk } from '@dethcrypto/eth-sdk-client';
import { UniswapV3Factory } from '@eth-sdk-types';
import { evm } from '@utils';
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
    let writeTimestamp = 1000000;
    let tick = 100;
    let delta = 20;

    it.skip('should revert if the oracle is not initialized', async () => {
      await expect(dataReceiver.addObservation(writeTimestamp, tick)).to.be.revertedWith('CustomError()');
    });

    context('when the oracle is initialized', () => {
      let initializeTimestamp = writeTimestamp - delta;
      let initialTick = 50;

      beforeEach(async () => {
        await oracleSidechain.initialize(initializeTimestamp, initialTick);
      });

      context('when the observation is writable', () => {
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
        let initializeTimestampBefore: number;

        beforeEach(async () => {
          initializeTimestampBefore = initializeTimestamp - 1;
        });

        it('should revert the tx', async () => {
          await expect(dataReceiver.addObservation(initializeTimestamp, tick)).to.be.revertedWith(
            `ObservationNotWritable(${initializeTimestamp})`
          );
          await expect(dataReceiver.addObservation(initializeTimestampBefore, tick)).to.be.revertedWith(
            `ObservationNotWritable(${initializeTimestampBefore})`
          );
        });
      });
    });
  });
});
