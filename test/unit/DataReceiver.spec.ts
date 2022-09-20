import { ethers } from 'hardhat';
import { ContractTransaction } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { DataReceiver, DataReceiver__factory, IOracleFactory, IOracleSidechain } from '@typechained';
import { smock, MockContract, MockContractFactory, FakeContract } from '@defi-wonderland/smock';
import { evm } from '@utils';
import { ORACLE_SIDECHAIN_CREATION_CODE } from '@utils/constants';
import { readArgFromEvent } from '@utils/event-utils';
import { onlyGovernor, onlyWhitelistedAdapter } from '@utils/behaviours';
import { getInitCodeHash, getCreate2Address, getRandomBytes32 } from '@utils/misc';
import chai, { expect } from 'chai';

chai.use(smock.matchers);

describe('DataReceiver.sol', () => {
  let governor: SignerWithAddress;
  let fakeAdapter: SignerWithAddress;
  let randomAdapter: SignerWithAddress;
  let dataReceiver: MockContract<DataReceiver>;
  let dataReceiverFactory: MockContractFactory<DataReceiver__factory>;
  let oracleSidechain: FakeContract<IOracleSidechain>;
  let oracleFactory: FakeContract<IOracleFactory>;
  let ORACLE_INIT_CODE_HASH: string;
  let precalculatedOracleAddress: string;
  let tx: ContractTransaction;
  let snapshotId: string;

  const existingSalt = getRandomBytes32();
  const randomSalt = getRandomBytes32();

  before(async () => {
    [, governor, fakeAdapter, randomAdapter] = await ethers.getSigners();

    oracleFactory = await smock.fake('IOracleFactory');

    dataReceiverFactory = await smock.mock('DataReceiver');
    dataReceiver = await dataReceiverFactory.deploy(governor.address, oracleFactory.address);

    ORACLE_INIT_CODE_HASH = await dataReceiver.ORACLE_INIT_CODE_HASH();
    precalculatedOracleAddress = getCreate2Address(oracleFactory.address, existingSalt, ORACLE_INIT_CODE_HASH);

    oracleSidechain = await smock.fake('IOracleSidechain', {
      address: precalculatedOracleAddress,
    });

    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('salt code hash', () => {
    it('should be correctly set', async () => {
      expect(ORACLE_INIT_CODE_HASH).to.eq(getInitCodeHash(ORACLE_SIDECHAIN_CREATION_CODE));
    });
  });

  describe('constructor(...)', () => {
    it('should initialize governor to the provided address', async () => {
      expect(await dataReceiver.governor()).to.eq(governor.address);
    });

    it('should initialize oracleFactory to the provided address', async () => {
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
      oracleSidechain.write.whenCalledWith(observationsData).returns(true);
    });

    onlyWhitelistedAdapter(
      () => dataReceiver,
      'addObservations',
      () => fakeAdapter,
      () => [observationsData, existingSalt]
    );

    /*
      This tests are slightly tricky. When declaring a fake, smock etches empty code into the fake,
      so instead of returning '0x' as code, it returns '0x00'. Because of this, when DataReceiver
      does the check of code.length to see if it has to deploy a new contract or not, that check
      always returns false if the precalculated address is the address of the fake,
      given that the length of the code '0x00' is 2, not 0.
      However we need the fake so that oracle.write returns something.
      So we can omit the first deployment call, and even then the tests will believe something is the oracle deployed
    */
    context('when an oracle already exists for a given pair', () => {
      it('should not call OracleFactory', async () => {
        await dataReceiver.connect(fakeAdapter).addObservations(observationsData, existingSalt);
        expect(oracleFactory.deployOracle).to.not.be.called;
      });

      it('should revert if the observations are not writable', async () => {
        oracleSidechain.write.whenCalledWith(observationsData).returns(false);
        await expect(dataReceiver.connect(fakeAdapter).addObservations(observationsData, existingSalt)).to.be.revertedWith(
          'ObservationsNotWritable()'
        );
      });

      it('should emit ObservationsAdded', async () => {
        tx = await dataReceiver.connect(fakeAdapter).addObservations(observationsData, existingSalt);
        let eventUser = await readArgFromEvent(tx, 'ObservationsAdded', '_user');
        let eventObservationsData = await readArgFromEvent(tx, 'ObservationsAdded', '_observationsData');
        expect(eventUser).to.eq(fakeAdapter.address);
        expect(eventObservationsData).to.eql(observationsData);
      });
    });

    /*
      In these sets of tests, I call addObservations with different tokens so that the precalculated address
      is different to oracleSidechain.address. This way, the code of the precalculated address will be 0, and it
      will indicate the dataReceiver to call oracleFactory to deploy a new contract.
      To prevent these from failing in the oracle.write, I make oracleFactory return oracleSidechain.address which is a
      fake, despite this not being the actual precalculated address
    */
    context('when an oracle does not exist for a given pair', () => {
      beforeEach(() => {
        oracleFactory.deployOracle.returns(oracleSidechain.address);
      });

      it('should call oracleFactory with the correct arguments', async () => {
        await dataReceiver.connect(fakeAdapter).addObservations(observationsData, randomSalt);
        expect(oracleFactory.deployOracle).to.have.been.calledOnceWith(randomSalt);
      });

      it('should revert if the observations are not writable', async () => {
        oracleSidechain.write.whenCalledWith(observationsData).returns(false);
        await expect(dataReceiver.connect(fakeAdapter).addObservations(observationsData, randomSalt)).to.be.revertedWith(
          'ObservationsNotWritable()'
        );
      });

      it('should emit ObservationsAdded', async () => {
        let tx = await dataReceiver.connect(fakeAdapter).addObservations(observationsData, randomSalt);
        let eventUser = await readArgFromEvent(tx, 'ObservationsAdded', '_user');
        let eventObservationsData = await readArgFromEvent(tx, 'ObservationsAdded', '_observationsData');
        expect(eventUser).to.eq(fakeAdapter.address);
        expect(eventObservationsData).to.eql(observationsData);
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
        'LengthMismatch()'
      );

      await expect(dataReceiver.connect(governor).whitelistAdapters([randomAdapter.address], [true, true])).to.be.revertedWith(
        'LengthMismatch()'
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
