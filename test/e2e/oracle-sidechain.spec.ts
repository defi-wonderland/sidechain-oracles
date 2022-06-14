import { ethers, network } from 'hardhat';
import { BigNumber } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { OracleSidechain, OracleSidechain__factory } from '@typechained';
import { getMainnetSdk } from '@dethcrypto/eth-sdk-client';
import { UniswapV3Factory } from '@eth-sdk-types';
import { evm } from '@utils';
import { toBN } from '@utils/bn';
import { getNodeUrl } from 'utils/env';
import forkBlockNumber from './fork-block-numbers';
import chai, { expect } from 'chai';

describe('@skip-on-coverage OracleSidechain.sol', () => {
  const MIN_SQRT_RATIO: number = 4295128739;
  const MIN_TICK: number = -887272;
  let stranger: SignerWithAddress;
  let deployer: SignerWithAddress;
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
    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('observing an observation', () => {
    it('should observe an observation', async () => {});
  });

  describe('writing an observation', () => {
    it('should write an observation', async () => {});
  });
});
