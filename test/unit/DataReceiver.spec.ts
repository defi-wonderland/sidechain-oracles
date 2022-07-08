import { ethers } from 'hardhat';
import { ContractTransaction } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { DataReceiver, DataReceiver__factory, IOracleSidechain } from '@typechained';
import { smock, MockContract, MockContractFactory, FakeContract } from '@defi-wonderland/smock';
import { evm } from '@utils';
import { readArgFromEvent } from '@utils/event-utils';
import { onlyGovernance, onlyWhitelistedAdapter } from '@utils/behaviours';
import chai, { expect } from 'chai';

chai.use(smock.matchers);

describe('DataReceiver.sol', () => {
  let governance: SignerWithAddress;
  let fakeAdapter: SignerWithAddress;
  let randomAdapter: SignerWithAddress;
  let dataReceiver: MockContract<DataReceiver>;
  let dataReceiverFactory: MockContractFactory<DataReceiver__factory>;
  let oracleSidechain: FakeContract<IOracleSidechain>;
  let tx: ContractTransaction;
  let snapshotId: string;

  before(async () => {
    [, governance, fakeAdapter, randomAdapter] = await ethers.getSigners();
    oracleSidechain = await smock.fake('IOracleSidechain');
    dataReceiverFactory = await smock.mock('DataReceiver');
    dataReceiver = await dataReceiverFactory.deploy(oracleSidechain.address, governance.address);
    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('constructor(...)', () => {
    it('should initialize the oracleSidechain interface', async () => {
      let oracleSidechainInterface = await dataReceiver.oracleSidechain();
      expect(oracleSidechainInterface).to.eq(oracleSidechain.address);
    });
    it('should initialize governance to the provided address', async () => {
      expect(await dataReceiver.governance()).to.eq(governance.address);
    });
  });

  describe('addObservations(...)', () => {
    let writeTimestamp1 = 1000000;
    let tick1 = 100;
    let observationData1 = [writeTimestamp1, tick1];
    let writeTimestamp2 = 3000000;
    let tick2 = 300;
    let observationData2 = [writeTimestamp2, tick2];
    let observationsData = [observationData1, observationData2];

    beforeEach(async () => {
      await dataReceiver.connect(governance).whitelistAdapter(fakeAdapter.address, true);
      oracleSidechain.write.whenCalledWith(observationsData).returns(true);
    });

    onlyWhitelistedAdapter(
      () => dataReceiver,
      'addObservations',
      () => fakeAdapter,
      () => [observationsData]
    );

    it('should revert if the observations are not writable', async () => {
      oracleSidechain.write.whenCalledWith(observationsData).returns(false);
      await expect(dataReceiver.connect(fakeAdapter).addObservations(observationsData)).to.be.revertedWith('ObservationsNotWritable()');
    });

    it('should emit ObservationsAdded', async () => {
      let tx = await dataReceiver.connect(fakeAdapter).addObservations(observationsData);
      let eventUser = await readArgFromEvent(tx, 'ObservationsAdded', '_user');
      let eventObservationsData = await readArgFromEvent(tx, 'ObservationsAdded', '_observationsData');
      expect(eventUser).to.eq(fakeAdapter.address);
      expect(eventObservationsData).to.eql(observationsData);
    });
  });

  describe('whitelistAdapter', () => {
    onlyGovernance(
      () => dataReceiver,
      'whitelistAdapter',
      () => governance,
      () => [randomAdapter.address, true]
    );
    it('should whitelist the adapter', async () => {
      await dataReceiver.connect(governance).whitelistAdapter(randomAdapter.address, true);
      expect(await dataReceiver.whitelistedAdapters(randomAdapter.address)).to.eq(true);
    });

    it('should remove whitelist from the adapter', async () => {
      await dataReceiver.connect(governance).whitelistAdapter(randomAdapter.address, true);
      await dataReceiver.connect(governance).whitelistAdapter(randomAdapter.address, false);
      expect(await dataReceiver.whitelistedAdapters(randomAdapter.address)).to.eq(false);
    });

    it('should emit an event when adapter is whitelisted', async () => {
      await expect(await dataReceiver.connect(governance).whitelistAdapter(randomAdapter.address, true))
        .to.emit(dataReceiver, 'AdapterWhitelisted')
        .withArgs(randomAdapter.address, true);
    });

    it('should emit an event when adapter whitelist is revoked', async () => {
      await dataReceiver.connect(governance).whitelistAdapter(randomAdapter.address, true);
      await expect(await dataReceiver.connect(governance).whitelistAdapter(randomAdapter.address, false))
        .to.emit(dataReceiver, 'AdapterWhitelisted')
        .withArgs(randomAdapter.address, false);
    });
  });

  describe('whitelistAdapters', () => {
    onlyGovernance(
      () => dataReceiver,
      'whitelistAdapters',
      () => governance,
      () => [
        [randomAdapter.address, fakeAdapter.address],
        [true, true],
      ]
    );

    it('should revert if the lengths of the arguments dont match', async () => {
      await expect(dataReceiver.connect(governance).whitelistAdapters([randomAdapter.address, fakeAdapter.address], [true])).to.be.revertedWith(
        'LengthMismatch()'
      );

      await expect(dataReceiver.connect(governance).whitelistAdapters([randomAdapter.address], [true, true])).to.be.revertedWith(
        'LengthMismatch()'
      );
    });

    it('should whitelist the adapters', async () => {
      await dataReceiver.connect(governance).whitelistAdapters([randomAdapter.address, fakeAdapter.address], [true, true]);
      expect(await dataReceiver.whitelistedAdapters(randomAdapter.address)).to.eq(true);
      expect(await dataReceiver.whitelistedAdapters(fakeAdapter.address)).to.eq(true);
    });

    it('should remove whitelist from the adapters', async () => {
      await dataReceiver.connect(governance).whitelistAdapters([randomAdapter.address, fakeAdapter.address], [true, true]);
      await dataReceiver.connect(governance).whitelistAdapters([randomAdapter.address, fakeAdapter.address], [false, false]);
      expect(await dataReceiver.whitelistedAdapters(randomAdapter.address)).to.eq(false);
      expect(await dataReceiver.whitelistedAdapters(fakeAdapter.address)).to.eq(false);
    });

    it('should emit n events when n adapters are whitelisted', async () => {
      tx = await dataReceiver.connect(governance).whitelistAdapters([randomAdapter.address, fakeAdapter.address], [true, true]);
      await expect(tx).to.emit(dataReceiver, 'AdapterWhitelisted').withArgs(randomAdapter.address, true);

      await expect(tx).to.emit(dataReceiver, 'AdapterWhitelisted').withArgs(fakeAdapter.address, true);
    });

    it('should emit n events when n adapters whitelists are revoked', async () => {
      tx = await dataReceiver.connect(governance).whitelistAdapters([randomAdapter.address, fakeAdapter.address], [false, false]);

      await dataReceiver.connect(governance).whitelistAdapters([randomAdapter.address, fakeAdapter.address], [true, true]);
      await expect(tx).to.emit(dataReceiver, 'AdapterWhitelisted').withArgs(randomAdapter.address, false);

      await expect(tx).to.emit(dataReceiver, 'AdapterWhitelisted').withArgs(fakeAdapter.address, false);
    });
  });
});
