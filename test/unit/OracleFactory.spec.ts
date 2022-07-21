import { ethers } from 'hardhat';
import { ContractTransaction } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { OracleFactory, OracleFactory__factory, IDataReceiver } from '@typechained';
import { smock, MockContract, MockContractFactory, FakeContract } from '@defi-wonderland/smock';
import { evm, wallet } from '@utils';
import { CARDINALITY } from '@utils/constants';
import { toUnit } from '@utils/bn';
import { onlyDataReceiver, onlyGovernance } from '@utils/behaviours';
import { calculateSalt, getCreate2AddressWithArgs, sortTokens } from '@utils/misc';
import chai, { expect } from 'chai';

chai.use(smock.matchers);

describe('OracleFactory.sol', () => {
  let governance: SignerWithAddress;
  let dataReceiver: FakeContract<IDataReceiver>;
  let oracleFactory: MockContract<OracleFactory>;
  let oracleFactoryFactory: MockContractFactory<OracleFactory__factory>;
  let tx: ContractTransaction;
  let snapshotId: string;

  const randomAddress = wallet.generateRandomAddress();
  const randomToken0 = wallet.generateRandomAddress();
  const randomToken1 = wallet.generateRandomAddress();
  const [tokenA, tokenB] = sortTokens([randomToken0, randomToken1]);
  const randomFee = 3000;
  const randomCardinality = 2000;

  before(async () => {
    [, governance] = await ethers.getSigners();
    dataReceiver = await smock.fake('IOracleFactory');
    oracleFactoryFactory = await smock.mock('OracleFactory');
    oracleFactory = await oracleFactoryFactory.deploy(governance.address, dataReceiver.address);
    await wallet.setBalance(dataReceiver.address, toUnit(10));
    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('constructor(...)', () => {
    it('should initialize governance to the provided address', async () => {
      expect(await oracleFactory.governance()).to.eq(governance.address);
    });

    it('should initialize data receiver to the provided address', async () => {
      expect(await oracleFactory.dataReceiver()).to.eq(dataReceiver.address);
    });
  });

  describe('deployOracle(...)', () => {
    let salt: string;
    let precalculatedOracleAddress: string;
    beforeEach(() => {
      salt = calculateSalt(tokenA, tokenB, randomFee);
      precalculatedOracleAddress = getCreate2AddressWithArgs(oracleFactory.address, salt);
    });

    onlyDataReceiver(
      () => oracleFactory,
      'deployOracle(address,address,uint24)',
      () => dataReceiver.wallet,
      () => [tokenA, tokenB, randomFee]
    );

    it('should deploy a new Oracle', async () => {
      expect(await ethers.provider.getCode(precalculatedOracleAddress)).to.eq('0x');
      await oracleFactory.connect(dataReceiver.wallet).deployOracle(tokenA, tokenB, randomFee);
      expect((await ethers.provider.getCode(precalculatedOracleAddress)).length).to.be.gt(100);
    });

    it('should emit an event', async () => {
      tx = await oracleFactory.connect(dataReceiver.wallet).deployOracle(tokenA, tokenB, randomFee);
      await expect(tx).to.emit(oracleFactory, 'OracleDeployed').withArgs(precalculatedOracleAddress, tokenA, tokenB, randomFee, CARDINALITY);
    });

    it('should add the deployed oracle to the getPool mapping with sorted tokens', async () => {
      await oracleFactory.connect(dataReceiver.wallet).deployOracle(tokenA, tokenB, randomFee);
      expect(await oracleFactory.getPool(tokenA, tokenB, randomFee)).to.eq(precalculatedOracleAddress);
    });

    it('should add the deployed oracle to the getPool mapping with unsorted tokens', async () => {
      await oracleFactory.connect(dataReceiver.wallet).deployOracle(tokenA, tokenB, randomFee);
      expect(await oracleFactory.getPool(tokenB, tokenA, randomFee)).to.eq(precalculatedOracleAddress);
    });
  });

  describe('setDataReceiver(...)', () => {
    onlyGovernance(
      () => oracleFactory,
      'setDataReceiver(address)',
      () => governance.address,
      () => [randomAddress]
    );

    it('should set data receiver to the provided address', async () => {
      await oracleFactory.connect(governance).setDataReceiver(randomAddress);
      expect(await oracleFactory.dataReceiver()).to.eq(randomAddress);
    });

    it('should emit an event', async () => {
      tx = await oracleFactory.connect(governance).setDataReceiver(randomAddress);
      await expect(tx).to.emit(oracleFactory, 'DataReceiverSet').withArgs(randomAddress);
    });
  });

  describe('setInitialCardinality(...)', () => {
    onlyGovernance(
      () => oracleFactory,
      'setInitialCardinality(uint16)',
      () => governance.address,
      () => [randomCardinality]
    );

    it('should set the initial cardinality to the provided address', async () => {
      await oracleFactory.connect(governance).setInitialCardinality(randomCardinality);
      expect(await oracleFactory.initialCardinality()).to.eq(randomCardinality);
    });

    it('should emit an event', async () => {
      tx = await oracleFactory.connect(governance).setInitialCardinality(randomCardinality);
      await expect(tx).to.emit(oracleFactory, 'InitialCardinalitySet').withArgs(randomCardinality);
    });
  });
});
