import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { DataReceiverForTest, DataReceiverForTest__factory, OracleSidechain, OracleSidechain__factory } from '@typechained';
import { getMainnetSdk } from '@dethcrypto/eth-sdk-client';
import { UniswapV3Factory } from '@eth-sdk-types';
import { evm } from '@utils';
import { getNodeUrl } from 'utils/env';
import forkBlockNumber from './fork-block-numbers';
import { setupContracts } from './common';
import { expect } from 'chai';

describe('@skip-on-coverage OracleSidechain.sol', () => {
  let stranger: SignerWithAddress;
  let deployer: SignerWithAddress;
  let governance: SignerWithAddress;
  let oracleSidechain: OracleSidechain;
  let oracleSidechainFactory: OracleSidechain__factory;
  let unallowedDataReceiver: DataReceiverForTest;
  let dataReceiverFactory: DataReceiverForTest__factory;
  let uniswapV3Factory: UniswapV3Factory;
  let snapshotId: string;

  const randomTick = 3000;
  const randomTimestamp = 5000;

  before(async () => {
    await evm.reset({
      jsonRpcUrl: getNodeUrl('ethereum'),
      blockNumber: forkBlockNumber.oracleSidechain,
    });

    ({ oracleSidechain, stranger, deployer, governance } = await setupContracts());

    dataReceiverFactory = await ethers.getContractFactory('DataReceiverForTest');
    unallowedDataReceiver = (await dataReceiverFactory
      .connect(deployer)
      .deploy(oracleSidechain.address, governance.address)) as DataReceiverForTest;

    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('observing an observation', () => {
    it('should observe an observation', async () => {});
  });

  describe('writing an observation', () => {
    it('should revert if the caller is not an allowed data receiver', async () => {
      await expect(unallowedDataReceiver.addPermissionlessObservation(randomTick, randomTimestamp)).to.be.revertedWith('OnlyDataReceiver');
    });
    // TODO: add more specs when data is defined
    it('should write an observation', async () => {});
  });
});
