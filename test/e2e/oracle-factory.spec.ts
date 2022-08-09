import { ethers, network } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { OracleFactory, OracleSidechain, DataReceiver, ERC20 } from '@typechained';
import { evm, wallet } from '@utils';
import { toUnit } from '@utils/bn';
import { onlyDataReceiver, onlyGovernance } from '@utils/behaviours';
import { sortTokens, getInitCodeHash } from '@utils/misc';
import { getNodeUrl } from 'utils/env';
import forkBlockNumber from './fork-block-numbers';
import { setupContracts, getEnvironment, getOracle } from './common';
import { expect } from 'chai';

describe('@skip-on-coverage OracleFactory.sol', () => {
  let governance: SignerWithAddress;
  let dataReceiverAdapterSigner: SignerWithAddress;
  let dataReceiver: DataReceiver;
  let oracleFactory: OracleFactory;
  let oracleSidechain: OracleSidechain;
  let snapshotId: string;
  let tokenA: ERC20;
  let tokenB: ERC20;
  let token0: string;
  let token1: string;
  let fee: number;

  const randomAddress = wallet.generateRandomAddress();

  before(async () => {
    await evm.reset({
      jsonRpcUrl: getNodeUrl('ethereum'),
      blockNumber: forkBlockNumber.oracleSidechain,
    });

    ({ tokenA, tokenB, fee } = await getEnvironment());
    [token0, token1] = sortTokens([tokenA.address, tokenB.address]);

    ({ governance, dataReceiver, oracleFactory } = await setupContracts());

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

  describe('deploying oracle', () => {
    beforeEach(async () => {
      await network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [dataReceiver.address],
      });
      await wallet.setBalance(dataReceiver.address, toUnit(10));
      dataReceiverAdapterSigner = await ethers.getSigner(dataReceiver.address);
    });

    onlyDataReceiver(
      () => oracleFactory,
      'deployOracle(address,address,uint24)',
      () => dataReceiverAdapterSigner,
      () => [tokenA.address, tokenB.address, fee]
    );

    context('when the caller is the data receiver', () => {
      it('should deploy an oracle', async () => {
        await oracleFactory.connect(dataReceiverAdapterSigner).deployOracle(token0, token1, fee);
        ({ oracleSidechain } = await getOracle(oracleFactory.address, token0, token1, fee));

        expect((await ethers.provider.getCode(oracleSidechain.address)).length).to.be.gt(100);
      });

      it('should add the deployed oracle to the getPool mapping with the sorted tokens and fee as keys', async () => {
        await oracleFactory.connect(dataReceiverAdapterSigner).deployOracle(token0, token1, fee);
        ({ oracleSidechain } = await getOracle(oracleFactory.address, token0, token1, fee));

        expect(await oracleFactory.getPool(tokenA.address, tokenB.address, fee)).to.eq(oracleSidechain.address);
      });

      it('should add the deployed oracle to the getPool mapping with the unsorted tokens and fee as keys', async () => {
        await oracleFactory.connect(dataReceiverAdapterSigner).deployOracle(token0, token1, fee);
        ({ oracleSidechain } = await getOracle(oracleFactory.address, token0, token1, fee));

        expect(await oracleFactory.getPool(tokenB.address, tokenA.address, fee)).to.eq(oracleSidechain.address);
      });

      it('should return the same address as the precalculated one', async () => {
        ({ oracleSidechain } = await getOracle(oracleFactory.address, token0, token1, fee));

        const trueOracleAddress = await oracleFactory.connect(dataReceiverAdapterSigner).callStatic.deployOracle(token0, token1, fee);
        expect(trueOracleAddress).to.be.eq(oracleSidechain.address);
      });
    });
  });

  describe('setting data receiver', () => {
    onlyGovernance(
      () => oracleFactory,
      'setDataReceiver(address)',
      () => governance.address,
      () => [randomAddress]
    );
  });
});
