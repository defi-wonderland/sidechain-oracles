import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ManualDataFeed, ManualDataFeed__factory, OracleSidechain, OracleSidechain__factory } from '@typechained';
import { getMainnetSdk } from '@dethcrypto/eth-sdk-client';
import { UniswapV3Factory } from '@eth-sdk-types';
import { evm, bn } from '@utils';
import { getNodeUrl } from 'utils/env';
import forkBlockNumber from './fork-block-numbers';
import chai, { expect } from 'chai';

describe('ManualDataFeed.sol - e2e testing', () => {
  let stranger: SignerWithAddress;
  let deployer: SignerWithAddress;
  let manualDataFeed: ManualDataFeed;
  let manualDataFeedFactory: ManualDataFeed__factory;
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
    manualDataFeedFactory = await ethers.getContractFactory('ManualDataFeed');
    manualDataFeed = await manualDataFeedFactory.connect(deployer).deploy(oracleSidechain.address);
    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('adding an observation', () => {
    it('should add an observation', async () => {});
  });
});
