import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { DataReceiver, DataReceiver__factory, IOracleSidechain } from '@typechained';
import { smock, MockContract, MockContractFactory, FakeContract } from '@defi-wonderland/smock';
import { evm } from '@utils';
import chai, { expect } from 'chai';
import { onlyGovernance, onlyWhitelistedAdapter } from '@utils/behaviours';
import { Transaction } from 'ethers';

chai.use(smock.matchers);

describe('DataReceiver.sol', () => {
  let deployer: SignerWithAddress;
  let governance: SignerWithAddress;
  let fakeAdapter: SignerWithAddress;
  let randomAdapter: SignerWithAddress;
  let dataReceiver: MockContract<DataReceiver>;
  let dataReceiverFactory: MockContractFactory<DataReceiver__factory>;
  let oracleSidechain: FakeContract<IOracleSidechain>;
  let snapshotId: string;
  let tx: Transaction;

  before(async () => {
    [, deployer, governance, fakeAdapter, randomAdapter] = await ethers.getSigners();
    oracleSidechain = await smock.fake('IOracleSidechain');
    dataReceiverFactory = await smock.mock('DataReceiver');
    dataReceiver = await dataReceiverFactory.connect(deployer).deploy(oracleSidechain.address, governance.address);
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

  describe('addObservation(...)', () => {
    let writeTimestamp: number;
    let tick = 100;

    beforeEach(async () => {
      writeTimestamp = (await ethers.provider.getBlock('latest')).timestamp + 1;
      oracleSidechain.write.whenCalledWith(writeTimestamp, tick).returns(true);
      dataReceiver.connect(governance).whitelistAdapter(fakeAdapter.address, true);
    });

    onlyWhitelistedAdapter(
      () => dataReceiver,
      'addObservation',
      () => fakeAdapter,
      () => [writeTimestamp, tick]
    );

    it('should revert if the observation is not writable', async () => {
      oracleSidechain.write.whenCalledWith(writeTimestamp, tick).returns(false);
      await expect(dataReceiver.connect(fakeAdapter).addObservation(writeTimestamp, tick)).to.be.revertedWith(
        `ObservationNotWritable(${writeTimestamp})`
      );
    });

    it('should emit ObservationAdded', async () => {
      await expect(dataReceiver.connect(fakeAdapter).addObservation(writeTimestamp, tick))
        .to.emit(dataReceiver, 'ObservationAdded')
        .withArgs(fakeAdapter.address, writeTimestamp, tick);
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
