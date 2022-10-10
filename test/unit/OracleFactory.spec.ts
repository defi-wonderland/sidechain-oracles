import { ethers } from 'hardhat';
import { ContractTransaction } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { OracleFactory, OracleFactory__factory, IDataReceiver } from '@typechained';
import { smock, MockContract, MockContractFactory, FakeContract } from '@defi-wonderland/smock';
import { evm, wallet } from '@utils';
import { CARDINALITY, ORACLE_SIDECHAIN_CREATION_CODE, ZERO_ADDRESS } from '@utils/constants';
import { toUnit } from '@utils/bn';
import { onlyGovernor, onlyDataReceiver } from '@utils/behaviours';
import { sortTokens, calculateSalt, getInitCodeHash, getCreate2Address } from '@utils/misc';
import chai, { expect } from 'chai';

chai.use(smock.matchers);

describe('OracleFactory.sol', () => {
  let governor: SignerWithAddress;
  let oracleFactory: MockContract<OracleFactory>;
  let oracleFactoryFactory: MockContractFactory<OracleFactory__factory>;
  let dataReceiver: FakeContract<IDataReceiver>;
  let tx: ContractTransaction;
  let snapshotId: string;

  const randomAddress = wallet.generateRandomAddress();
  const randomTokenA = wallet.generateRandomAddress();
  const randomTokenB = wallet.generateRandomAddress();
  const randomFee = 3000;
  const randomCardinality = 2000;
  const randomNonce = 420;

  const [token0, token1] = sortTokens([randomTokenA, randomTokenB]);
  const salt = calculateSalt(randomTokenA, randomTokenB, randomFee);

  before(async () => {
    [, governor] = await ethers.getSigners();

    dataReceiver = await smock.fake('IDataReceiver');
    await wallet.setBalance(dataReceiver.address, toUnit(10));

    oracleFactoryFactory = await smock.mock('OracleFactory');
    oracleFactory = await oracleFactoryFactory.deploy(governor.address, dataReceiver.address);

    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('constructor(...)', () => {
    it('should initialize governor to the provided address', async () => {
      expect(await oracleFactory.governor()).to.eq(governor.address);
    });

    it('should initialize data receiver to the provided address', async () => {
      expect(await oracleFactory.dataReceiver()).to.eq(dataReceiver.address);
    });
  });

  describe('deployOracle(...)', () => {
    let precalculatedOracleAddress: string;

    beforeEach(async () => {
      precalculatedOracleAddress = getCreate2Address(oracleFactory.address, salt, getInitCodeHash(ORACLE_SIDECHAIN_CREATION_CODE));
    });

    onlyDataReceiver(
      () => oracleFactory,
      'deployOracle',
      () => dataReceiver.wallet,
      () => [salt, randomNonce]
    );

    it('should deploy a new Oracle', async () => {
      expect(await ethers.provider.getCode(precalculatedOracleAddress)).to.eq('0x');
      await oracleFactory.connect(dataReceiver.wallet).deployOracle(salt, randomNonce);
      expect((await ethers.provider.getCode(precalculatedOracleAddress)).length).to.be.gt(100);
    });

    it('should emit an event', async () => {
      tx = await oracleFactory.connect(dataReceiver.wallet).deployOracle(salt, randomNonce);
      await expect(tx).to.emit(oracleFactory, 'OracleDeployed').withArgs(precalculatedOracleAddress, salt, CARDINALITY);
    });
  });

  describe('getPool(...)', () => {
    let precalculatedOracleAddress: string;

    beforeEach(async () => {
      precalculatedOracleAddress = getCreate2Address(oracleFactory.address, salt, getInitCodeHash(ORACLE_SIDECHAIN_CREATION_CODE));
    });

    it('should return zero address when oracle is not deployed', async () => {
      expect(await oracleFactory.getPool(token0, token1, randomFee)).to.eq(ZERO_ADDRESS);
    });

    it('should return oracle address when tokens are sorted', async () => {
      await oracleFactory.connect(dataReceiver.wallet).deployOracle(salt, randomNonce);
      expect(await oracleFactory.getPool(token0, token1, randomFee)).to.eq(precalculatedOracleAddress);
    });

    it('should return oracle address when tokens are unsorted', async () => {
      await oracleFactory.connect(dataReceiver.wallet).deployOracle(salt, randomNonce);
      expect(await oracleFactory.getPool(token1, token0, randomFee)).to.eq(precalculatedOracleAddress);
    });
  });

  describe('getPoolSalt(...)', () => {
    it('should return the correct salt when tokens are sorted', async () => {
      expect(await oracleFactory.getPoolSalt(token0, token1, randomFee)).to.eq(salt);
    });

    it('should return the correct salt when tokens are unsorted', async () => {
      expect(await oracleFactory.getPoolSalt(token1, token0, randomFee)).to.eq(salt);
    });
  });

  describe('setDataReceiver(...)', () => {
    onlyGovernor(
      () => oracleFactory,
      'setDataReceiver',
      () => governor.address,
      () => [randomAddress]
    );

    it('should set data receiver to the provided address', async () => {
      await oracleFactory.connect(governor).setDataReceiver(randomAddress);
      expect(await oracleFactory.dataReceiver()).to.eq(randomAddress);
    });

    it('should emit an event', async () => {
      tx = await oracleFactory.connect(governor).setDataReceiver(randomAddress);
      await expect(tx).to.emit(oracleFactory, 'DataReceiverSet').withArgs(randomAddress);
    });
  });

  describe('setInitialCardinality(...)', () => {
    onlyGovernor(
      () => oracleFactory,
      'setInitialCardinality',
      () => governor.address,
      () => [randomCardinality]
    );

    it('should set the initial cardinality to the provided address', async () => {
      await oracleFactory.connect(governor).setInitialCardinality(randomCardinality);
      expect(await oracleFactory.initialCardinality()).to.eq(randomCardinality);
    });

    it('should emit an event', async () => {
      tx = await oracleFactory.connect(governor).setInitialCardinality(randomCardinality);
      await expect(tx).to.emit(oracleFactory, 'InitialCardinalitySet').withArgs(randomCardinality);
    });
  });
});
