import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { OracleSidechain, IOracleSidechain, DataReceiverForTest, DataReceiverForTest__factory } from '@typechained';
import { evm } from '@utils';
import { getNodeUrl } from 'utils/env';
import forkBlockNumber from './fork-block-numbers';
import { setupContracts } from './common';
import { expect } from 'chai';

describe('@skip-on-coverage OracleSidechain.sol', () => {
  let deployer: SignerWithAddress;
  let governance: SignerWithAddress;
  let oracleSidechain: OracleSidechain;
  let unallowedDataReceiver: DataReceiverForTest;
  let dataReceiverFactory: DataReceiverForTest__factory;
  let snapshotId: string;

  before(async () => {
    await evm.reset({
      jsonRpcUrl: getNodeUrl('ethereum'),
      blockNumber: forkBlockNumber.oracleSidechain,
    });

    ({ deployer, governance, oracleSidechain } = await setupContracts());

    dataReceiverFactory = await ethers.getContractFactory('DataReceiverForTest');
    unallowedDataReceiver = await dataReceiverFactory.connect(deployer).deploy(oracleSidechain.address, governance.address);

    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('observing an observation', () => {
    it('should observe an observation', async () => {});
  });

  describe('writing observations', () => {
    let writeTimestamp1 = 1000000;
    let tick1 = 100;
    let observationData1 = [writeTimestamp1, tick1] as IOracleSidechain.ObservationDataStructOutput;
    let writeTimestamp2 = 3000000;
    let tick2 = 300;
    let observationData2 = [writeTimestamp2, tick2] as IOracleSidechain.ObservationDataStructOutput;
    let observationsData = [observationData1, observationData2];

    it('should revert if the caller is not an allowed data receiver', async () => {
      await expect(unallowedDataReceiver.addPermissionlessObservations(observationsData)).to.be.revertedWith('OnlyDataReceiver');
    });

    // TODO: add more specs when data is defined
    it('should write the observations', async () => {});
  });
});
