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
  let randomWallet: SignerWithAddress;
  let dataReceiver: MockContract<DataReceiver>;
  let dataReceiverFactory: MockContractFactory<DataReceiver__factory>;
  let oracleFactory: FakeContract<IOracleFactory>;
  let oracleSidechain: FakeContract<IOracleSidechain>;
  let tx: ContractTransaction;
  let snapshotId: string;

  const randomSalt = getRandomBytes32();
  const randomNonce = 420;

  before(async () => {
    [randomWallet, governor, fakeAdapter, randomAdapter] = await ethers.getSigners();

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
      await expect(dataReceiverFactory.deploy(governor.address, ZERO_ADDRESS)).to.be.revertedWith('ZeroAddress()');
    });

    it('should set the governor', async () => {
      expect(await dataReceiver.governor()).to.eq(governor.address);
    });

    it('should initialize oracleFactory interface', async () => {
      expect(await dataReceiver.oracleFactory()).to.eq(oracleFactory.address);
    });
  });

  describe('addObservations(...)', () => {
    let observationsData = [
      [1000000, 100],
      [300, 3000000],
    ] as IOracleSidechain.ObservationDataStructOutput[];

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
        oracleSidechain.poolNonce.whenCalledWith().returns(randomNonce + 1);
        await expect(dataReceiver.connect(fakeAdapter).addObservations(observationsData, randomSalt, randomNonce)).to.be.revertedWith(
          'ObservationsNotWritable()'
        );
      });

      it('should emit ObservationsAdded', async () => {
        const tx = await dataReceiver.connect(fakeAdapter).addObservations(observationsData, randomSalt, randomNonce);
        let eventAdapter = await readArgFromEvent(tx, 'ObservationsAdded', '_receiverAdapter');
        let eventSalt = await readArgFromEvent(tx, 'ObservationsAdded', '_poolSalt');
        let eventNonce = await readArgFromEvent(tx, 'ObservationsAdded', '_poolNonce');

        expect(eventAdapter).to.eq(fakeAdapter.address);
        expect(eventSalt).to.eq(randomSalt);
        expect(eventNonce).to.eq(randomNonce);
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
          oracleSidechain.poolNonce.whenCalledWith().returns(randomNonce + 1);
          await expect(dataReceiver.connect(fakeAdapter).addObservations(observationsData, randomSalt, randomNonce)).to.be.revertedWith(
            'ObservationsNotWritable()'
          );
        });

        it('should emit ObservationsAdded', async () => {
          tx = await dataReceiver.connect(fakeAdapter).addObservations(observationsData, randomSalt, randomNonce);
          await expect(tx).to.emit(dataReceiver, 'ObservationsAdded').withArgs(randomSalt, randomNonce, fakeAdapter.address);
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
          oracleSidechain.poolNonce.whenCalledWith().returns(randomNonce + 1);
          await expect(dataReceiver.connect(fakeAdapter).addObservations(observationsData, randomSalt, randomNonce)).to.be.revertedWith(
            'ObservationsNotWritable()'
          );
        });

        it('should emit ObservationsAdded', async () => {
          tx = await dataReceiver.connect(fakeAdapter).addObservations(observationsData, randomSalt, randomNonce);
          await expect(tx).to.emit(dataReceiver, 'ObservationsAdded').withArgs(randomSalt, randomNonce, fakeAdapter.address);
        });
      });
    });

    context('when observations arrive', () => {
      beforeEach(async () => {
        // normal case scenario (irrelevant to the test)
        await dataReceiver.setVariable('deployedOracles', { [randomSalt]: oracleSidechain.address });
      });

      context('when an observation arrives with a past nonce', () => {
        beforeEach(async () => {
          await dataReceiver.setVariable('deployedOracles', { [randomSalt]: oracleSidechain.address });
          oracleSidechain.write.whenCalledWith(observationsData, randomNonce).returns(false);
          oracleSidechain.poolNonce.returns(randomNonce + 1);
        });

        it('should revert', async () => {
          await expect(dataReceiver.connect(fakeAdapter).addObservations(observationsData, randomSalt, randomNonce)).to.be.revertedWith(
            'ObservationsNotWritable()'
          );
        });
      });

      context('when an observation arrives with the correct nonce', () => {
        beforeEach(async () => {
          await dataReceiver.setVariable('deployedOracles', { [randomSalt]: oracleSidechain.address });
          oracleSidechain.write.whenCalledWith(observationsData, randomNonce).returns(true);
        });

        it('should write observations', async () => {
          expect(oracleSidechain.write).to.have.been.calledWith(observationsData, randomNonce);

          tx = await dataReceiver.connect(fakeAdapter).addObservations(observationsData, randomSalt, randomNonce);
          await expect(tx).to.emit(dataReceiver, 'ObservationsAdded').withArgs(randomSalt, randomNonce, fakeAdapter.address);
        });
      });

      context('when an observation arrives with a future nonce', () => {
        beforeEach(async () => {
          oracleSidechain.write.reset();
          await dataReceiver.setVariable('deployedOracles', { [randomSalt]: oracleSidechain.address });
          oracleSidechain.write.whenCalledWith(observationsData, randomNonce).returns(false);
          oracleSidechain.poolNonce.whenCalledWith().returns(randomNonce - 2);
        });

        it('should cache the received observation', async () => {
          tx = await dataReceiver.connect(fakeAdapter).addObservations(observationsData, randomSalt, randomNonce);
          await expect(tx).to.emit(dataReceiver, 'ObservationsCached').withArgs(randomSalt, randomNonce, fakeAdapter.address);
          await expect(tx).not.to.emit(dataReceiver, 'ObservationsAdded');
        });

        it('should cache the first received observation and ignore the following', async () => {
          tx = await dataReceiver.connect(fakeAdapter).addObservations(observationsData, randomSalt, randomNonce);
          await expect(tx).to.emit(dataReceiver, 'ObservationsCached').withArgs(randomSalt, randomNonce, fakeAdapter.address);
          await expect(tx).not.to.emit(dataReceiver, 'ObservationsAdded');

          tx = await dataReceiver.connect(fakeAdapter).addObservations(observationsData, randomSalt, randomNonce);
          await expect(tx).not.to.emit(dataReceiver, 'ObservationsCached').withArgs(randomSalt, randomNonce, fakeAdapter.address);
          await expect(tx).not.to.emit(dataReceiver, 'ObservationsAdded');
        });

        context('when the cache is populated', () => {
          beforeEach(async () => {
            // Cache observations
            // NOTE: smock doesn't support setting internal mapping(bytes32 => mapping(uint => Struct)) (yet)
            oracleSidechain.poolNonce.whenCalledWith().returns(0);
            await dataReceiver.connect(fakeAdapter).addObservations(observationsData, randomSalt, randomNonce + 2);
            await dataReceiver.connect(fakeAdapter).addObservations(observationsData, randomSalt, randomNonce + 1);
            await dataReceiver.connect(fakeAdapter).addObservations(observationsData, randomSalt, randomNonce - 1);
            await dataReceiver.connect(fakeAdapter).addObservations(observationsData, randomSalt, randomNonce - 2);
            oracleSidechain.poolNonce.whenCalledWith().returns(randomNonce - 2);
            // oracleSidechain is at poolNonce = randomNonce - 2 and cache is populated with -2, -1, +1 , +2 (nonce is empty)

            oracleSidechain.write.reset();
          });

          it('should add the cached observations', async () => {
            tx = await dataReceiver.connect(fakeAdapter).addObservations(observationsData, randomSalt, randomNonce);

            await expect(tx).to.emit(dataReceiver, 'ObservationsCached').withArgs(randomSalt, randomNonce, fakeAdapter.address);
            await expect(tx)
              .to.emit(dataReceiver, 'ObservationsAdded')
              .withArgs(randomSalt, randomNonce - 2, fakeAdapter.address);
            await expect(tx)
              .to.emit(dataReceiver, 'ObservationsAdded')
              .withArgs(randomSalt, randomNonce - 1, fakeAdapter.address);
            await expect(tx).to.emit(dataReceiver, 'ObservationsAdded').withArgs(randomSalt, randomNonce, fakeAdapter.address);
          });

          it('should add the cached observations up until the inputted observation nonce', async () => {
            tx = await dataReceiver.connect(fakeAdapter).addObservations(observationsData, randomSalt, randomNonce);

            expect(oracleSidechain.write).to.have.been.calledWith(observationsData, randomNonce - 2);
            expect(oracleSidechain.write).to.have.been.calledWith(observationsData, randomNonce - 1);
            expect(oracleSidechain.write).to.have.been.calledWith(observationsData, randomNonce);
            expect(oracleSidechain.write).not.to.have.been.calledWith(observationsData, randomNonce + 1);
            expect(oracleSidechain.write).not.to.have.been.calledWith(observationsData, randomNonce + 2);

            await expect(tx).to.emit(dataReceiver, 'ObservationsCached').withArgs(randomSalt, randomNonce, fakeAdapter.address);
            await expect(tx)
              .to.emit(dataReceiver, 'ObservationsAdded')
              .withArgs(randomSalt, randomNonce - 2, fakeAdapter.address);
            await expect(tx)
              .to.emit(dataReceiver, 'ObservationsAdded')
              .withArgs(randomSalt, randomNonce - 1, fakeAdapter.address);
            await expect(tx).to.emit(dataReceiver, 'ObservationsAdded').withArgs(randomSalt, randomNonce, fakeAdapter.address);
          });

          it('should add the cached observations up until the first empty nonce', async () => {
            const tx = await dataReceiver.connect(fakeAdapter).addObservations(observationsData, randomSalt, randomNonce + 1);

            expect(oracleSidechain.write).not.to.have.been.calledWith(observationsData, randomNonce);
            expect(oracleSidechain.write).to.have.been.calledWith(observationsData, randomNonce - 2);
            expect(oracleSidechain.write).to.have.been.calledWith(observationsData, randomNonce - 1);
            await expect(tx).not.to.emit(dataReceiver, 'ObservationsCached'); // `randomNonce + 1` is cached in beforeEach
            await expect(tx)
              .to.emit(dataReceiver, 'ObservationsAdded')
              .withArgs(randomSalt, randomNonce - 2, fakeAdapter.address);
            await expect(tx)
              .to.emit(dataReceiver, 'ObservationsAdded')
              .withArgs(randomSalt, randomNonce - 1, fakeAdapter.address);
          });
        });
      });
    });
  });

  describe('syncObservations(...)', () => {
    const observationsDataA = [[1, 10]] as IOracleSidechain.ObservationDataStructOutput[];
    const observationsDataB = [[2, 20]] as IOracleSidechain.ObservationDataStructOutput[];
    const observationsDataC = [[3, 30]] as IOracleSidechain.ObservationDataStructOutput[];

    let caller: string;

    beforeEach(async () => {
      oracleSidechain.poolNonce.whenCalledWith().returns(randomNonce);
      caller = randomWallet.address;
    });

    context('when an oracle is registered', () => {
      beforeEach(async () => {
        await dataReceiver.setVariable('deployedOracles', { [randomSalt]: oracleSidechain.address });
      });

      it('should revert when the cache is empty at the oracle nonce', async () => {
        await expect(dataReceiver.syncObservations(randomSalt, 0)).to.be.revertedWith('ObservationsNotWritable()');
      });

      context('when the cache is populated', () => {
        beforeEach(async () => {
          // Cache observations
          // NOTE: smock doesn't support setting internal mapping(bytes32 => mapping(uint => Struct)) (yet)
          oracleSidechain.poolNonce.whenCalledWith().returns(0);
          await dataReceiver.connect(governor).whitelistAdapter(fakeAdapter.address, true);
          await dataReceiver.connect(fakeAdapter).addObservations(observationsDataA, randomSalt, randomNonce);
          await dataReceiver.connect(fakeAdapter).addObservations(observationsDataB, randomSalt, randomNonce + 1);
          await dataReceiver.connect(fakeAdapter).addObservations(observationsDataC, randomSalt, randomNonce + 2);
          oracleSidechain.poolNonce.whenCalledWith().returns(randomNonce);
          // oracleSidechain is at poolNonce = randomNonce and cache is populated with nonce, +1, +2

          oracleSidechain.write.reset();
        });

        it('should revert when the cache at pool nonce is empty', async () => {
          oracleSidechain.poolNonce.whenCalledWith().returns(randomNonce + 42);
          await expect(dataReceiver.syncObservations(randomSalt, 0)).to.be.revertedWith('ObservationsNotWritable()');
        });

        it('should all observations limited by max argument', async () => {
          tx = await dataReceiver.syncObservations(randomSalt, 2);

          expect(oracleSidechain.write).to.have.been.calledWith(observationsDataA, randomNonce);
          expect(oracleSidechain.write).to.have.been.calledWith(observationsDataB, randomNonce + 1);
          expect(oracleSidechain.write).not.to.have.been.calledWith(observationsDataC, randomNonce + 2);

          await expect(tx).to.emit(dataReceiver, 'ObservationsAdded').withArgs(randomSalt, randomNonce, caller);
          await expect(tx)
            .to.emit(dataReceiver, 'ObservationsAdded')
            .withArgs(randomSalt, randomNonce + 1, caller);
        });

        it('should all the observations when called without max', async () => {
          tx = await dataReceiver.syncObservations(randomSalt, 0);

          expect(oracleSidechain.write).to.have.been.calledWith(observationsDataA, randomNonce);
          expect(oracleSidechain.write).to.have.been.calledWith(observationsDataB, randomNonce + 1);
          expect(oracleSidechain.write).to.have.been.calledWith(observationsDataC, randomNonce + 2);

          await expect(tx).to.emit(dataReceiver, 'ObservationsAdded').withArgs(randomSalt, randomNonce, caller);
          await expect(tx)
            .to.emit(dataReceiver, 'ObservationsAdded')
            .withArgs(randomSalt, randomNonce + 1, caller);
          await expect(tx)
            .to.emit(dataReceiver, 'ObservationsAdded')
            .withArgs(randomSalt, randomNonce + 2, caller);
        });

        it.skip('should delete added cache observations', async () => {
          // should sync nonce and nonce + 1 (nonce + 2 should remain in cache)
          await dataReceiver.syncObservations(randomSalt, 2);

          // NOTE: smock having issues with internal mapping structs
          const postCacheA = await dataReceiver.getVariable('_cachedObservations', [randomSalt, randomNonce.toString()]);
          const postCacheB = await dataReceiver.getVariable('_cachedObservations', [randomSalt, (randomNonce + 1).toString()]);
          const postCacheC = await dataReceiver.getVariable('_cachedObservations', [randomSalt, (randomNonce + 2).toString()]);

          expect(postCacheA).to.be.undefined;
          expect(postCacheB).to.be.undefined;
          expect(postCacheC).to.deep.eq(observationsDataC);
        });
      });
    });

    context('when an oracle is not registered', () => {
      it('should revert', async () => {
        await expect(dataReceiver.syncObservations(randomSalt, 0)).to.be.revertedWith('ZeroAddress()');
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
