import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import {
  OracleSidechain,
  IOracleSidechain,
  OracleFactory,
  OracleFactory__factory,
  DataReceiverForTest,
  DataReceiverForTest__factory,
  ERC20,
} from '@typechained';
import { evm, wallet } from '@utils';
import { KP3R, WETH, FEE, UNI_FACTORY, POOL_INIT_CODE_HASH, ORACLE_SIDECHAIN_CREATION_CODE } from '@utils/constants';
import { getInitCodeHash, calculateSalt, getCreate2Address } from '@utils/misc';
import { getNodeUrl } from 'utils/env';
import forkBlockNumber from './fork-block-numbers';
import { setupContracts, getEnvironment, getOracle } from './common';
import { expect } from 'chai';

describe('@skip-on-coverage OracleSidechain.sol', () => {
  let deployer: SignerWithAddress;
  let governor: SignerWithAddress;
  let oracleFactory: OracleFactory;
  let oracleFactoryFactory: OracleFactory__factory;
  let oracleSidechain: OracleSidechain;
  let allowedDataReceiver: DataReceiverForTest;
  let unallowedDataReceiver: DataReceiverForTest;
  let dataReceiverFactory: DataReceiverForTest__factory;
  let snapshotId: string;
  let tokenA: ERC20;
  let tokenB: ERC20;
  let fee: number;
  let salt: string;

  before(async () => {
    await evm.reset({
      jsonRpcUrl: getNodeUrl('ethereum'),
      blockNumber: forkBlockNumber.oracleSidechain,
    });

    ({ tokenA, tokenB, fee } = await getEnvironment());
    salt = calculateSalt(tokenA.address, tokenB.address, fee);

    ({ deployer, governor } = await setupContracts());

    const currentNonce = await ethers.provider.getTransactionCount(deployer.address);
    const precalculatedDataReceiverAddress = ethers.utils.getContractAddress({ from: deployer.address, nonce: currentNonce + 1 });

    const oracleFactoryFactory = (await ethers.getContractFactory('OracleFactory')) as OracleFactory__factory;
    oracleFactory = await oracleFactoryFactory.connect(deployer).deploy(governor.address, precalculatedDataReceiverAddress);

    const dataReceiverFactory = (await ethers.getContractFactory('DataReceiverForTest')) as DataReceiverForTest__factory;
    allowedDataReceiver = await dataReceiverFactory.connect(deployer).deploy(governor.address, oracleFactory.address);
    unallowedDataReceiver = await dataReceiverFactory.connect(deployer).deploy(governor.address, oracleFactory.address);

    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('salt code hash', () => {
    it('should be correctly set', async () => {
      let ORACLE_INIT_CODE_HASH = await allowedDataReceiver.ORACLE_INIT_CODE_HASH();
      expect(ORACLE_INIT_CODE_HASH).to.eq(getInitCodeHash(ORACLE_SIDECHAIN_CREATION_CODE));
    });
  });

  describe('observing an observation', () => {
    it('should observe an observation', async () => {});
  });

  describe('writing observations', () => {
    let blockTimestamp1 = 1000000;
    let tick1 = 100;
    let observationData1 = [blockTimestamp1, tick1] as IOracleSidechain.ObservationDataStructOutput;
    let blockTimestamp2 = 3000000;
    let tick2 = 300;
    let observationData2 = [blockTimestamp2, tick2] as IOracleSidechain.ObservationDataStructOutput;
    let observationsData = [observationData1, observationData2];

    it('should revert if the caller is not an allowed data receiver', async () => {
      await allowedDataReceiver.addPermissionlessObservations(observationsData, salt);

      await expect(unallowedDataReceiver.addPermissionlessObservations(observationsData, salt)).to.be.revertedWith('OnlyDataReceiver');
    });

    it('should deploy a oracleSidechain and write an observation', async () => {
      await allowedDataReceiver.addPermissionlessObservations(observationsData, salt);

      ({ oracleSidechain } = await getOracle(oracleFactory.address, tokenA.address, tokenB.address, fee));

      let observation = await oracleSidechain.observations(0);
      expect(observation[3]); // initialized
    });
  });
});
