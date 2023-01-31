import { ethers } from 'hardhat';
import { ContractTransaction } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { DataReceiver, DataReceiver__factory, IOracleFactory, IOracleSidechain } from '@typechained';
import { smock, MockContract, MockContractFactory, FakeContract } from '@defi-wonderland/smock';
import { evm } from '@utils';
import { ZERO_ADDRESS } from '@utils/constants';
import { readArgFromEvent } from '@utils/event-utils';
import { onlyGovernor, onlyWhitelistedAdapter } from '@utils/behaviours';
import { getRandomBytes32 } from '@utils/misc';
import chai, { expect } from 'chai';

chai.use(smock.matchers);

describe('DataReceiver.sol', () => {
  let governor: SignerWithAddress;
  let fakeAdapter: SignerWithAddress;
  let randomAdapter: SignerWithAddress;
  let dataReceiver: MockContract<DataReceiver>;
  let dataReceiverFactory: MockContractFactory<DataReceiver__factory>;
  let oracleFactory: FakeContract<IOracleFactory>;
  let oracleSidechain: FakeContract<IOracleSidechain>;
  let tx: ContractTransaction;
  let snapshotId: string;

  const randomSalt = getRandomBytes32();
  const randomNonce = 420;

  before(async () => {
    [, governor, fakeAdapter, randomAdapter] = await ethers.getSigners();

    oracleFactory = await smock.fake('IOracleFactory');
    oracleSidechain = await smock.fake('IOracleSidechain');

    dataReceiverFactory = await smock.mock('DataReceiver');
    dataReceiver = await dataReceiverFactory.deploy(governor.address, oracleFactory.address);

    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('constructor(...)', () => {
    it('should revert if oracleFactory is set to the zero address', async () => {
      await expect(dataReceiverFactory.deploy(governor.address, ZERO_ADDRESS)).to.be.revertedWith('DataReceiver_ZeroAddress()');
    });

    it('should set the governor', async () => {
      expect(await dataReceiver.governor()).to.eq(governor.address);
    });

    it('should initialize oracleFactory interface', async () => {
      expect(await dataReceiver.oracleFactory()).to.eq(oracleFactory.address);
    });
  });

  describe('addObservations(...)', () => {
    let blockTimestamp1 = 1000000;
    let tick1 = 100;
    let observationData1 = [blockTimestamp1, tick1];
    let blockTimestamp2 = 3000000;
    let tick2 = 300;
    let observationData2 = [blockTimestamp2, tick2];
    let observationsData = [observationData1, observationData2];

    beforeEach(async () => {
      await dataReceiver.connect(governor).whitelistAdapter(fakeAdapter.address, true);
      oracleSidechain.write.whenCalledWith(observationsData, randomNonce).returns(true);
    });

    onlyWhitelistedAdapter(
      () => dataReceiver,
      'addObservations',
      () => fakeAdapter,
      () => [observationsData, randomSalt, randomNonce]
    );

    context('when an oracle is registered', () => {
      beforeEach(async () => {
        await dataReceiver.setVariable('deployedOracles', { [randomSalt]: oracleSidechain.address });
      });

      it('should not call OracleFactory', async () => {
        oracleFactory.deployOracle.reset();
        await dataReceiver.connect(fakeAdapter).addObservations(observationsData, randomSalt, randomNonce);
        expect(oracleFactory.deployOracle).to.not.be.called;
      });

      it('should revert if the observations are not writable', async () => {
        oracleSidechain.write.whenCalledWith(observationsData, randomNonce).returns(false);
        await expect(dataReceiver.connect(fakeAdapter).addObservations(observationsData, randomSalt, randomNonce)).to.be.revertedWith(
          'DataReceiver_ObservationsNotWritable()'
        );
      });

      it('should emit ObservationsAdded', async () => {
        const tx = await dataReceiver.connect(fakeAdapter).addObservations(observationsData, randomSalt, randomNonce);
        let eventAdapter = await readArgFromEvent(tx, 'ObservationsAdded', '_receiverAdapter');
        let eventSalt = await readArgFromEvent(tx, 'ObservationsAdded', '_poolSalt');
        let eventNonce = await readArgFromEvent(tx, 'ObservationsAdded', '_poolNonce');
        let eventObservationsData = await readArgFromEvent(tx, 'ObservationsAdded', '_observationsData');

        expect(eventAdapter).to.eq(fakeAdapter.address);
        expect(eventSalt).to.eq(randomSalt);
        expect(eventNonce).to.eq(randomNonce);
        expect(eventObservationsData).to.eql(observationsData);
      });
    });

    context('when an oracle is not registered', () => {
      context('when an oracle already exists for a given pair', () => {
        before(() => {
          oracleFactory['getPool(bytes32)'].whenCalledWith(randomSalt).returns(oracleSidechain.address);
          oracleFactory.deployOracle.whenCalledWith(randomSalt, randomNonce).returns(ZERO_ADDRESS);
        });

        it('should update deployedOracles', async () => {
          await dataReceiver.connect(fakeAdapter).addObservations(observationsData, randomSalt, randomNonce);
          let deployedOracle = await dataReceiver.deployedOracles(randomSalt);
          expect(deployedOracle).to.eq(oracleSidechain.address);
        });

        it('should revert if the observations are not writable', async () => {
          oracleSidechain.write.whenCalledWith(observationsData, randomNonce).returns(false);
          await expect(dataReceiver.connect(fakeAdapter).addObservations(observationsData, randomSalt, randomNonce)).to.be.revertedWith(
            'DataReceiver_ObservationsNotWritable()'
          );
        });

        it('should emit ObservationsAdded', async () => {
          tx = await dataReceiver.connect(fakeAdapter).addObservations(observationsData, randomSalt, randomNonce);
          let eventAdapter = await readArgFromEvent(tx, 'ObservationsAdded', '_receiverAdapter');
          let eventObservationsData = await readArgFromEvent(tx, 'ObservationsAdded', '_observationsData');

          expect(eventAdapter).to.eq(fakeAdapter.address);
          expect(eventObservationsData).to.eql(observationsData);
        });
      });

      context('when an oracle does not exist for a given pair', () => {
        before(() => {
          oracleFactory['getPool(bytes32)'].whenCalledWith(randomSalt).returns(ZERO_ADDRESS);
          oracleFactory.deployOracle.whenCalledWith(randomSalt, randomNonce).returns(oracleSidechain.address);
        });

        it('should update deployedOracles', async () => {
          await dataReceiver.connect(fakeAdapter).addObservations(observationsData, randomSalt, randomNonce);
          let deployedOracle = await dataReceiver.deployedOracles(randomSalt);
          expect(deployedOracle).to.eq(oracleSidechain.address);
        });

        it('should revert if the observations are not writable', async () => {
          oracleSidechain.write.whenCalledWith(observationsData, randomNonce).returns(false);
          await expect(dataReceiver.connect(fakeAdapter).addObservations(observationsData, randomSalt, randomNonce)).to.be.revertedWith(
            'DataReceiver_ObservationsNotWritable()'
          );
        });

        it('should emit ObservationsAdded', async () => {
          tx = await dataReceiver.connect(fakeAdapter).addObservations(observationsData, randomSalt, randomNonce);
          let eventAdapter = await readArgFromEvent(tx, 'ObservationsAdded', '_receiverAdapter');
          let eventObservationsData = await readArgFromEvent(tx, 'ObservationsAdded', '_observationsData');

          expect(eventAdapter).to.eq(fakeAdapter.address);
          expect(eventObservationsData).to.eql(observationsData);
        });
      });
    });
  });

  describe('whitelistAdapter(...)', () => {
    onlyGovernor(
      () => dataReceiver,
      'whitelistAdapter',
      () => governor,
      () => [randomAdapter.address, true]
    );

    it('should whitelist the adapter', async () => {
      await dataReceiver.connect(governor).whitelistAdapter(randomAdapter.address, true);
      expect(await dataReceiver.whitelistedAdapters(randomAdapter.address)).to.eq(true);
    });

    it('should remove whitelist from the adapter', async () => {
      await dataReceiver.connect(governor).whitelistAdapter(randomAdapter.address, true);
      await dataReceiver.connect(governor).whitelistAdapter(randomAdapter.address, false);
      expect(await dataReceiver.whitelistedAdapters(randomAdapter.address)).to.eq(false);
    });

    it('should emit an event when adapter is whitelisted', async () => {
      await expect(await dataReceiver.connect(governor).whitelistAdapter(randomAdapter.address, true))
        .to.emit(dataReceiver, 'AdapterWhitelisted')
        .withArgs(randomAdapter.address, true);
    });

    it('should emit an event when adapter whitelist is revoked', async () => {
      await dataReceiver.connect(governor).whitelistAdapter(randomAdapter.address, true);
      await expect(await dataReceiver.connect(governor).whitelistAdapter(randomAdapter.address, false))
        .to.emit(dataReceiver, 'AdapterWhitelisted')
        .withArgs(randomAdapter.address, false);
    });
  });

  describe('whitelistAdapters(...)', () => {
    onlyGovernor(
      () => dataReceiver,
      'whitelistAdapters',
      () => governor,
      () => [
        [randomAdapter.address, fakeAdapter.address],
        [true, true],
      ]
    );

    it('should revert if the lengths of the arguments do not match', async () => {
      await expect(dataReceiver.connect(governor).whitelistAdapters([randomAdapter.address, fakeAdapter.address], [true])).to.be.revertedWith(
        'DataReceiver_LengthMismatch()'
      );

      await expect(dataReceiver.connect(governor).whitelistAdapters([randomAdapter.address], [true, true])).to.be.revertedWith(
        'DataReceiver_LengthMismatch()'
      );
    });

    it('should whitelist the adapters', async () => {
      await dataReceiver.connect(governor).whitelistAdapters([randomAdapter.address, fakeAdapter.address], [true, true]);
      expect(await dataReceiver.whitelistedAdapters(randomAdapter.address)).to.eq(true);
      expect(await dataReceiver.whitelistedAdapters(fakeAdapter.address)).to.eq(true);
    });

    it('should remove whitelist from the adapters', async () => {
      await dataReceiver.connect(governor).whitelistAdapters([randomAdapter.address, fakeAdapter.address], [true, true]);
      await dataReceiver.connect(governor).whitelistAdapters([randomAdapter.address, fakeAdapter.address], [false, false]);
      expect(await dataReceiver.whitelistedAdapters(randomAdapter.address)).to.eq(false);
      expect(await dataReceiver.whitelistedAdapters(fakeAdapter.address)).to.eq(false);
    });

    it('should emit n events when n adapters are whitelisted', async () => {
      tx = await dataReceiver.connect(governor).whitelistAdapters([randomAdapter.address, fakeAdapter.address], [true, true]);
      await expect(tx).to.emit(dataReceiver, 'AdapterWhitelisted').withArgs(randomAdapter.address, true);

      await expect(tx).to.emit(dataReceiver, 'AdapterWhitelisted').withArgs(fakeAdapter.address, true);
    });

    it('should emit n events when n adapters whitelists are revoked', async () => {
      tx = await dataReceiver.connect(governor).whitelistAdapters([randomAdapter.address, fakeAdapter.address], [false, false]);

      await dataReceiver.connect(governor).whitelistAdapters([randomAdapter.address, fakeAdapter.address], [true, true]);
      await expect(tx).to.emit(dataReceiver, 'AdapterWhitelisted').withArgs(randomAdapter.address, false);

      await expect(tx).to.emit(dataReceiver, 'AdapterWhitelisted').withArgs(fakeAdapter.address, false);
    });
  });
});
