import { ethers, network } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { DataReceiver, ConnextReceiverAdapter, OracleSidechain, IOracleSidechain } from '@typechained';
import { evm, wallet } from '@utils';
import { toUnit } from '@utils/bn';
import { readArgFromEvent } from '@utils/event-utils';
import { getNodeUrl } from 'utils/env';
import forkBlockNumber from './fork-block-numbers';
import { setupContracts } from './common';
import { expect } from 'chai';

describe('@skip-on-coverage DataReceiver.sol', () => {
  let stranger: SignerWithAddress;
  let governance: SignerWithAddress;
  let dataReceiver: DataReceiver;
  let connextReceiverAdapter: ConnextReceiverAdapter;
  let oracleSidechain: OracleSidechain;
  let snapshotId: string;

  before(async () => {
    await evm.reset({
      jsonRpcUrl: getNodeUrl('ethereum'),
      blockNumber: forkBlockNumber.oracleSidechain,
    });

    ({ stranger, governance, dataReceiver, connextReceiverAdapter, oracleSidechain } = await setupContracts());

    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
    await dataReceiver.connect(governance).whitelistAdapter(connextReceiverAdapter.address, true);
  });

  describe('adding observations', () => {
    let connextReceiverAdapterSigner: SignerWithAddress;
    let writeTimestamp1 = 1000000;
    let tick1 = 100;
    let observationData1 = [writeTimestamp1, tick1] as IOracleSidechain.ObservationDataStructOutput;
    let writeTimestamp2 = 3000000;
    let tick2 = 300;
    let observationData2 = [writeTimestamp2, tick2] as IOracleSidechain.ObservationDataStructOutput;
    let observationsData = [observationData1, observationData2];

    beforeEach(async () => {
      await network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [connextReceiverAdapter.address],
      });
      await wallet.setBalance(connextReceiverAdapter.address, toUnit(10));
      connextReceiverAdapterSigner = await ethers.getSigner(connextReceiverAdapter.address);
    });

    it('should revert if the caller is not a whitelisted adapter', async () => {
      await expect(dataReceiver.connect(stranger).addObservations(observationsData)).to.be.revertedWith('UnallowedAdapter()');
    });

    it.skip('should revert if the oracle is not initialized', async () => {
      await expect(dataReceiver.connect(connextReceiverAdapterSigner).addObservations(observationsData)).to.be.revertedWith('CustomError()');
    });

    context('when the oracle is initialized', () => {
      let initializeTimestamp = 500000;
      let initialTick = 50;
      let initialObservationData = [initializeTimestamp, initialTick] as IOracleSidechain.ObservationDataStructOutput;

      beforeEach(async () => {
        await oracleSidechain.initialize(initialObservationData);
      });

      context('when the observations are writable', () => {
        it('should add the observations', async () => {
          let tx = await dataReceiver.connect(connextReceiverAdapterSigner).addObservations(observationsData);
          await expect(tx).to.emit(oracleSidechain, 'ObservationWritten').withArgs(dataReceiver.address, observationData1);
          await expect(tx).to.emit(oracleSidechain, 'ObservationWritten').withArgs(dataReceiver.address, observationData2);
        });

        it('should emit ObservationsAdded', async () => {
          let tx = await dataReceiver.connect(connextReceiverAdapterSigner).addObservations(observationsData);
          let eventUser = await readArgFromEvent(tx, 'ObservationsAdded', '_user');
          let eventObservationsData = await readArgFromEvent(tx, 'ObservationsAdded', '_observationsData');
          expect(eventUser).to.eq(connextReceiverAdapter.address);
          expect(eventObservationsData).to.eql(observationsData);
        });
      });

      context('when the observations are not writable', () => {
        let initializeTimestampBefore = initializeTimestamp - 1;
        let initialObservationDataBefore = [initializeTimestampBefore, initialTick] as IOracleSidechain.ObservationDataStructOutput;
        let initialObservationsData = [initialObservationDataBefore, initialObservationData];

        it('should revert the tx', async () => {
          await expect(dataReceiver.connect(connextReceiverAdapterSigner).addObservations(initialObservationsData)).to.be.revertedWith(
            'ObservationsNotWritable()'
          );
        });
      });
    });
  });
});
