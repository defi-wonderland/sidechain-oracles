import { ethers, network } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { OracleFactory, OracleSidechain, DataReceiver, ERC20 } from '@typechained';
import { evm, wallet } from '@utils';
import { ORACLE_SIDECHAIN_CREATION_CODE, ZERO_ADDRESS } from '@utils/constants';
import { toUnit } from '@utils/bn';
import { onlyGovernance, onlyDataReceiver } from '@utils/behaviours';
import { sortTokens, calculateSalt, getInitCodeHash } from '@utils/misc';
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
  let salt: string;

  const randomAddress = wallet.generateRandomAddress();

  before(async () => {
    await evm.reset({
      jsonRpcUrl: getNodeUrl('ethereum'),
      blockNumber: forkBlockNumber.oracleSidechain,
    });

    ({ tokenA, tokenB, fee } = await getEnvironment());
    [token0, token1] = sortTokens([tokenA.address, tokenB.address]);
    salt = calculateSalt(token0, token1, fee);

    ({ governance, dataReceiver, oracleFactory } = await setupContracts());

    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('salt code hash', () => {
    it('should be correctly set', async () => {
      let ORACLE_INIT_CODE_HASH = await dataReceiver.ORACLE_INIT_CODE_HASH();
      expect(ORACLE_INIT_CODE_HASH).to.eq(getInitCodeHash(ORACLE_SIDECHAIN_CREATION_CODE));
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
      'deployOracle(bytes32)',
      () => dataReceiverAdapterSigner,
      () => [calculateSalt(tokenA.address, tokenB.address, fee)]
    );

    context('when the caller is the data receiver', () => {
      it('should deploy an oracle', async () => {
        await oracleFactory.connect(dataReceiverAdapterSigner).deployOracle(salt);
        ({ oracleSidechain } = await getOracle(oracleFactory.address, token0, token1, fee));

        expect((await ethers.provider.getCode(oracleSidechain.address)).length).to.be.gt(100);
      });

      it('should add the deployed oracle to the getPool method with the sorted tokens and fee as keys', async () => {
        expect(await oracleFactory.getPool(tokenA.address, tokenB.address, fee)).to.eq(ZERO_ADDRESS);
        await oracleFactory.connect(dataReceiverAdapterSigner).deployOracle(salt);
        ({ oracleSidechain } = await getOracle(oracleFactory.address, token0, token1, fee));

        expect(await oracleFactory.getPool(tokenA.address, tokenB.address, fee)).to.eq(oracleSidechain.address);
      });

      it('should add the deployed oracle to the getPool method with the unsorted tokens and fee as keys', async () => {
        expect(await oracleFactory.getPool(tokenA.address, tokenB.address, fee)).to.eq(ZERO_ADDRESS);
        await oracleFactory.connect(dataReceiverAdapterSigner).deployOracle(salt);
        ({ oracleSidechain } = await getOracle(oracleFactory.address, token0, token1, fee));

        expect(await oracleFactory.getPool(tokenB.address, tokenA.address, fee)).to.eq(oracleSidechain.address);
      });

      it('should return the same address as the precalculated one', async () => {
        ({ oracleSidechain } = await getOracle(oracleFactory.address, token0, token1, fee));

        const trueOracleAddress = await oracleFactory.connect(dataReceiverAdapterSigner).callStatic.deployOracle(salt);
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
