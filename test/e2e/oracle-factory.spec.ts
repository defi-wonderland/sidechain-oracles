import { ethers } from 'hardhat';
import { JsonRpcSigner } from '@ethersproject/providers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { OracleFactory, OracleSidechain, DataReceiver, ERC20 } from '@typechained';
import { evm, wallet } from '@utils';
import { ZERO_ADDRESS, ORACLE_SIDECHAIN_CREATION_CODE } from '@utils/constants';
import { toUnit } from '@utils/bn';
import { onlyGovernor, onlyDataReceiver } from '@utils/behaviours';
import { calculateSalt, getInitCodeHash } from '@utils/misc';
import { getNodeUrl } from 'utils/env';
import forkBlockNumber from './fork-block-numbers';
import { setupContracts, getEnvironment, getOracle } from './common';
import { expect } from 'chai';

describe('@skip-on-coverage OracleFactory.sol', () => {
  let deployer: SignerWithAddress;
  let governor: SignerWithAddress;
  let oracleFactory: OracleFactory;
  let oracleSidechain: OracleSidechain;
  let dataReceiver: DataReceiver;
  let tokenA: ERC20;
  let tokenB: ERC20;
  let fee: number;
  let salt: string;
  let snapshotId: string;

  const randomAddress = wallet.generateRandomAddress();

  before(async () => {
    await evm.reset({
      jsonRpcUrl: getNodeUrl('ethereum'),
      blockNumber: forkBlockNumber.oracleSidechain,
    });

    ({ tokenA, tokenB, fee } = await getEnvironment());

    salt = calculateSalt(tokenA.address, tokenB.address, fee);

    ({ deployer, governor, oracleFactory, dataReceiver } = await setupContracts());

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
    let dataReceiverSigner: JsonRpcSigner;

    beforeEach(async () => {
      dataReceiverSigner = await wallet.impersonate(dataReceiver.address);
      await wallet.setBalance(dataReceiver.address, toUnit(10));
      oracleFactory = oracleFactory.connect(dataReceiverSigner);
    });

    onlyDataReceiver(
      () => oracleFactory,
      'deployOracle',
      () => dataReceiverSigner,
      () => [salt]
    );

    context('when the caller is the data receiver', () => {
      it('should deploy an oracle', async () => {
        await oracleFactory.deployOracle(salt);
        ({ oracleSidechain } = await getOracle(oracleFactory.address, tokenA.address, tokenB.address, fee));

        expect((await ethers.provider.getCode(oracleSidechain.address)).length).to.be.gt(100);
      });

      it('should add the deployed oracle to the getPool method with the sorted tokens and fee as keys', async () => {
        expect(await oracleFactory.getPool(tokenA.address, tokenB.address, fee)).to.eq(ZERO_ADDRESS);
        await oracleFactory.deployOracle(salt);
        ({ oracleSidechain } = await getOracle(oracleFactory.address, tokenA.address, tokenB.address, fee));

        expect(await oracleFactory.getPool(tokenA.address, tokenB.address, fee)).to.eq(oracleSidechain.address);
      });

      it('should add the deployed oracle to the getPool method with the unsorted tokens and fee as keys', async () => {
        expect(await oracleFactory.getPool(tokenA.address, tokenB.address, fee)).to.eq(ZERO_ADDRESS);
        await oracleFactory.deployOracle(salt);
        ({ oracleSidechain } = await getOracle(oracleFactory.address, tokenA.address, tokenB.address, fee));

        expect(await oracleFactory.getPool(tokenB.address, tokenA.address, fee)).to.eq(oracleSidechain.address);
      });

      it('should return the same address as the precalculated one', async () => {
        ({ oracleSidechain } = await getOracle(oracleFactory.address, tokenA.address, tokenB.address, fee));

        const trueOracleAddress = await oracleFactory.callStatic.deployOracle(salt);
        expect(trueOracleAddress).to.be.eq(oracleSidechain.address);
      });
    });

    after(async () => {
      oracleFactory = oracleFactory.connect(deployer);
    });
  });

  describe('setting data receiver', () => {
    onlyGovernor(
      () => oracleFactory,
      'setDataReceiver',
      () => governor.address,
      () => [randomAddress]
    );
  });
});
