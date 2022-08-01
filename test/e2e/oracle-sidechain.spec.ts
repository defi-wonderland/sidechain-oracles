import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import {
  OracleSidechain,
  IOracleSidechain,
  OracleFactory,
  OracleFactory__factory,
  DataReceiverForTest,
  DataReceiverForTest__factory,
} from '@typechained';
import { evm, wallet } from '@utils';
import { KP3R, WETH, FEE } from '@utils/constants';
import { getInitCodeHash } from '@utils/misc';
import { getNodeUrl } from 'utils/env';
import forkBlockNumber from './fork-block-numbers';
import { setupContracts } from './common';
import { expect } from 'chai';

describe('@skip-on-coverage OracleSidechain.sol', () => {
  let deployer: SignerWithAddress;
  let governance: SignerWithAddress;
  let oracleFactory: OracleFactory;
  let oracleFactoryFactory: OracleFactory__factory;
  let allowedDataReceiver: DataReceiverForTest;
  let unallowedDataReceiver: DataReceiverForTest;
  let dataReceiverFactory: DataReceiverForTest__factory;
  let snapshotId: string;

  before(async () => {
    await evm.reset({
      jsonRpcUrl: getNodeUrl('ethereum'),
      blockNumber: forkBlockNumber.oracleSidechain,
    });

    ({ deployer, governance } = await setupContracts());

    const currentNonce = await ethers.provider.getTransactionCount(deployer.address);
    const precalculatedDataReceiverAddress = ethers.utils.getContractAddress({ from: deployer.address, nonce: currentNonce + 1 });

    oracleFactoryFactory = await ethers.getContractFactory('OracleFactory');
    oracleFactory = await oracleFactoryFactory.connect(deployer).deploy(governance.address, precalculatedDataReceiverAddress);

    dataReceiverFactory = await ethers.getContractFactory('DataReceiverForTest');
    allowedDataReceiver = await dataReceiverFactory.connect(deployer).deploy(governance.address, oracleFactory.address);
    unallowedDataReceiver = await dataReceiverFactory.connect(deployer).deploy(governance.address, oracleFactory.address);

    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('salt code hash', () => {
    it('should be correctly set', async () => {
      let ORACLE_INIT_CODE_HASH = await allowedDataReceiver.ORACLE_INIT_CODE_HASH();
      expect(ORACLE_INIT_CODE_HASH).to.eq(getInitCodeHash());
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
      await allowedDataReceiver.addPermissionlessObservations(observationsData, KP3R, WETH, FEE);

      await expect(unallowedDataReceiver.addPermissionlessObservations(observationsData, KP3R, WETH, FEE)).to.be.revertedWith(
        'OnlyDataReceiver'
      );
    });

    // TODO: add more specs when data is defined
    it('should write the observations', async () => {});
  });
});
