import { ethers } from 'hardhat';
import { ContractTransaction } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { DataFeedKeeper, DataFeedKeeper__factory, IKeep3r, IDataFeed } from '@typechained';
import { smock, MockContract, MockContractFactory, FakeContract } from '@defi-wonderland/smock';
import { evm, wallet } from '@utils';
import { KEEP3R, VALID_POOL_SALT } from '@utils/constants';
import { toBN } from '@utils/bn';
import { onlyGovernor } from '@utils/behaviours';
import { getRandomBytes32 } from '@utils/misc';
import chai, { expect } from 'chai';

chai.use(smock.matchers);

describe('DataFeedKeeper.sol', () => {
  let governor: SignerWithAddress;
  let keeper: SignerWithAddress;
  let dataFeedKeeper: MockContract<DataFeedKeeper>;
  let dataFeedKeeperFactory: MockContractFactory<DataFeedKeeper__factory>;
  let keep3r: FakeContract<IKeep3r>;
  let dataFeed: FakeContract<IDataFeed>;
  let tx: ContractTransaction;
  let snapshotId: string;

  const defaultSenderAdapterAddress = wallet.generateRandomAddress();
  const initialJobCooldown = toBN(4 * 60 * 60);

  const randomSenderAdapterAddress = wallet.generateRandomAddress();
  const randomChainId = 32;
  const randomChainId2 = 22;
  const randomSalt = VALID_POOL_SALT;
  const randomSalt2 = getRandomBytes32();

  before(async () => {
    [, governor, keeper] = await ethers.getSigners();

    keep3r = await smock.fake('IKeep3r', { address: KEEP3R });
    keep3r.isKeeper.whenCalledWith(keeper.address).returns(true);
    dataFeed = await smock.fake('IDataFeed');

    dataFeedKeeperFactory = await smock.mock('DataFeedKeeper');
    dataFeedKeeper = await dataFeedKeeperFactory.deploy(governor.address, dataFeed.address, defaultSenderAdapterAddress, initialJobCooldown);

    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('constructor(...)', () => {
    it('should set the governor', async () => {
      expect(await dataFeedKeeper.governor()).to.eq(governor.address);
    });

    it('should initialize dataFeed interface', async () => {
      let dataFeedInterface = await dataFeedKeeper.dataFeed();
      expect(dataFeedInterface).to.eq(dataFeed.address);
    });

    it('should set the defaultBridgeSenderAdapter', async () => {
      let defaultBridgeSenderAdapter = await dataFeedKeeper.defaultBridgeSenderAdapter();
      expect(defaultBridgeSenderAdapter).to.eq(defaultSenderAdapterAddress);
    });

    it('should set the jobCooldown', async () => {
      let jobCooldown = await dataFeedKeeper.jobCooldown();
      expect(jobCooldown).to.eq(initialJobCooldown);
    });
  });

  describe('work(...)', () => {
    let now: number;
    let periodLength: number;
    const lastBlockTimestampObserved = 0;

    beforeEach(async () => {
      periodLength = await dataFeedKeeper.periodLength();
      dataFeed.lastPoolStateObserved.returns([0, lastBlockTimestampObserved, 0, 0]);
    });

    it('should revert if the keeper is not valid', async () => {
      keep3r.isKeeper.whenCalledWith(governor.address).returns(false);
      await expect(dataFeedKeeper.connect(governor)['work(bytes32)'](randomSalt)).to.be.revertedWith('KeeperNotValid()');
    });

    it.skip('should revert if the pool is not whitelisted', async () => {
      await expect(dataFeedKeeper.connect(keeper)['work(bytes32)'](randomSalt)).to.be.revertedWith('NotWorkable()');
    });

    context('when the pool is whitelisted', () => {
      beforeEach(async () => {
        await dataFeedKeeper.connect(governor).whitelistPool(randomChainId, randomSalt, true);
        now = (await ethers.provider.getBlock('latest')).timestamp;
      });

      it('should revert if jobCooldown has not expired', async () => {
        dataFeed.lastPoolStateObserved.returns([1, now, 0, 0]);
        await expect(dataFeedKeeper.connect(keeper)['work(bytes32)'](randomSalt)).to.be.revertedWith('NotWorkable()');
      });

      it('should call to fetch observations (having calculated secondsAgos)', async () => {
        dataFeed.fetchObservations.reset();
        await dataFeedKeeper.connect(keeper)['work(bytes32)'](randomSalt);
        const secondsAgos = await dataFeedKeeper.calculateSecondsAgos(periodLength, lastBlockTimestampObserved);
        expect(dataFeed.fetchObservations).to.have.been.calledOnceWith(randomSalt, secondsAgos);
      });

      it('should call to pay the keeper', async () => {
        keep3r.worked.reset();
        await dataFeedKeeper.connect(keeper)['work(bytes32)'](randomSalt);
        expect(keep3r.worked).to.have.been.calledOnceWith(keeper.address);
      });
    });
  });

  describe('forceWork(...)', () => {
    let periodLength: number;
    let secondsAgos: number[];
    const fromTimestamp = 0;

    beforeEach(async () => {
      periodLength = await dataFeedKeeper.periodLength();
      secondsAgos = await dataFeedKeeper.calculateSecondsAgos(periodLength, fromTimestamp);
    });

    onlyGovernor(
      () => dataFeedKeeper,
      'forceWork',
      () => governor,
      () => [randomSalt, fromTimestamp]
    );

    it('should call to fetch observations (having calculated secondsAgos)', async () => {
      dataFeed.fetchObservations.reset();
      await dataFeedKeeper.connect(governor).forceWork(randomSalt, fromTimestamp);
      expect(dataFeed.fetchObservations).to.have.been.calledOnceWith(randomSalt, secondsAgos);
    });
  });

  describe('setDefaultBridgeSenderAdapter(...)', () => {
    onlyGovernor(
      () => dataFeedKeeper,
      'setDefaultBridgeSenderAdapter',
      () => governor,
      () => [randomSenderAdapterAddress]
    );

    it('should update the defaultBridgeSenderAdapter', async () => {
      await dataFeedKeeper.connect(governor).setDefaultBridgeSenderAdapter(randomSenderAdapterAddress);
      let defaultBridgeSenderAdapter = await dataFeedKeeper.defaultBridgeSenderAdapter();
      expect(defaultBridgeSenderAdapter).to.eq(randomSenderAdapterAddress);
    });

    it('should emit DefaultBridgeSenderAdapterUpdated', async () => {
      await expect(dataFeedKeeper.connect(governor).setDefaultBridgeSenderAdapter(randomSenderAdapterAddress))
        .to.emit(dataFeedKeeper, 'DefaultBridgeSenderAdapterUpdated')
        .withArgs(randomSenderAdapterAddress);
    });
  });

  describe('setJobCooldown(...)', () => {
    let newJobCooldown = initialJobCooldown.add(1 * 60 * 60);

    onlyGovernor(
      () => dataFeedKeeper,
      'setJobCooldown',
      () => governor,
      () => [newJobCooldown]
    );

    it('should update the jobCooldown', async () => {
      await dataFeedKeeper.connect(governor).setJobCooldown(newJobCooldown);
      let jobCooldown = await dataFeedKeeper.jobCooldown();
      expect(jobCooldown).to.eq(newJobCooldown);
    });

    it('should emit JobCooldownUpdated', async () => {
      await expect(dataFeedKeeper.connect(governor).setJobCooldown(newJobCooldown))
        .to.emit(dataFeedKeeper, 'JobCooldownUpdated')
        .withArgs(newJobCooldown);
    });
  });

  describe('whitelistPool(...)', () => {
    onlyGovernor(
      () => dataFeedKeeper,
      'whitelistPool',
      () => governor,
      () => [randomChainId, randomSalt, true]
    );

    it('should whitelist the adapter', async () => {
      await dataFeedKeeper.connect(governor).whitelistPool(randomChainId, randomSalt, true);
      expect(await dataFeedKeeper.whitelistedPools(randomChainId, randomSalt)).to.eq(true);
    });

    it('should remove whitelist from the adapter', async () => {
      await dataFeedKeeper.connect(governor).whitelistPool(randomChainId, randomSalt, true);
      await dataFeedKeeper.connect(governor).whitelistPool(randomChainId, randomSalt, false);
      expect(await dataFeedKeeper.whitelistedPools(randomChainId, randomSalt)).to.eq(false);
    });

    it('should emit an event when adapter is whitelisted', async () => {
      await expect(await dataFeedKeeper.connect(governor).whitelistPool(randomChainId, randomSalt, true))
        .to.emit(dataFeedKeeper, 'PoolWhitelisted')
        .withArgs(randomChainId, randomSalt, true);
    });

    it('should emit an event when adapter whitelist is revoked', async () => {
      await dataFeedKeeper.connect(governor).whitelistPool(randomChainId, randomSalt, true);
      await expect(await dataFeedKeeper.connect(governor).whitelistPool(randomChainId, randomSalt, false))
        .to.emit(dataFeedKeeper, 'PoolWhitelisted')
        .withArgs(randomChainId, randomSalt, false);
    });
  });

  describe('whitelistPools(...)', () => {
    onlyGovernor(
      () => dataFeedKeeper,
      'whitelistPools',
      () => governor,
      () => [
        [randomChainId, randomChainId2],
        [randomSalt, randomSalt2],
        [true, true],
      ]
    );

    it('should revert if the lengths of the arguments do not match', async () => {
      const mismatchedArgs = [[randomChainId, randomChainId2], [randomSalt, randomSalt2], [true]];

      const mismatchedArgs2 = [[randomChainId, randomChainId2], [randomSalt], [true, true]];

      const mismatchedArgs3 = [[randomChainId], [randomSalt, randomSalt2], [true, true]];

      await expect(dataFeedKeeper.connect(governor).whitelistPools(...mismatchedArgs)).to.be.revertedWith('LengthMismatch()');

      await expect(dataFeedKeeper.connect(governor).whitelistPools(...mismatchedArgs2)).to.be.revertedWith('LengthMismatch()');

      await expect(dataFeedKeeper.connect(governor).whitelistPools(...mismatchedArgs3)).to.be.revertedWith('LengthMismatch()');
    });

    it('should whitelist the adapters', async () => {
      await dataFeedKeeper.connect(governor).whitelistPools([randomChainId, randomChainId2], [randomSalt, randomSalt2], [true, true]);
      expect(await dataFeedKeeper.whitelistedPools(randomChainId, randomSalt)).to.eq(true);
      expect(await dataFeedKeeper.whitelistedPools(randomChainId2, randomSalt2)).to.eq(true);
    });

    it('should remove whitelist from the adapters', async () => {
      await dataFeedKeeper.connect(governor).whitelistPools([randomChainId, randomChainId2], [randomSalt, randomSalt2], [true, true]);
      await dataFeedKeeper.connect(governor).whitelistPools([randomChainId, randomChainId2], [randomSalt, randomSalt2], [false, false]);
      expect(await dataFeedKeeper.whitelistedPools(randomChainId, randomSalt)).to.eq(false);
      expect(await dataFeedKeeper.whitelistedPools(randomChainId2, randomSalt2)).to.eq(false);
    });

    it('should emit n events when n adapters are whitelisted', async () => {
      tx = await dataFeedKeeper.connect(governor).whitelistPools([randomChainId, randomChainId2], [randomSalt, randomSalt2], [true, true]);
      await expect(tx).to.emit(dataFeedKeeper, 'PoolWhitelisted').withArgs(randomChainId, randomSalt, true);

      await expect(tx).to.emit(dataFeedKeeper, 'PoolWhitelisted').withArgs(randomChainId2, randomSalt2, true);
    });

    it('should emit n events when n adapters whitelists are revoked', async () => {
      tx = await dataFeedKeeper.connect(governor).whitelistPools([randomChainId, randomChainId2], [randomSalt, randomSalt2], [false, false]);

      await dataFeedKeeper.connect(governor).whitelistPools([randomChainId, randomChainId2], [randomSalt, randomSalt2], [true, true]);
      await expect(tx).to.emit(dataFeedKeeper, 'PoolWhitelisted').withArgs(randomChainId, randomSalt, false);

      await expect(tx).to.emit(dataFeedKeeper, 'PoolWhitelisted').withArgs(randomChainId2, randomSalt2, false);
    });
  });

  describe('workable(...)', () => {
    let now: number;
    let jobCooldown = initialJobCooldown.toNumber();

    it.skip('should return false if the pool is not whitelisted', async () => {
      let workable = await dataFeedKeeper['workable(bytes32)'](randomSalt);
      expect(workable).to.eq(false);
    });

    context('when the pool is whitelisted', () => {
      beforeEach(async () => {
        await dataFeedKeeper.connect(governor).whitelistPool(randomChainId, randomSalt, true);
        now = (await ethers.provider.getBlock('latest')).timestamp;
      });

      it('should return true if jobCooldown is 0', async () => {
        dataFeed.lastPoolStateObserved.returns([0, 0, 0, 0]);
        let workable = await dataFeedKeeper['workable(bytes32)'](randomSalt);
        expect(workable).to.eq(true);
      });

      it('should return true if jobCooldown has expired', async () => {
        dataFeed.lastPoolStateObserved.returns([0, now - jobCooldown, 0, 0]);
        let workable = await dataFeedKeeper['workable(bytes32)'](randomSalt);
        expect(workable).to.eq(true);
      });

      it('should return false if jobCooldown has not expired', async () => {
        dataFeed.lastPoolStateObserved.returns([0, now - jobCooldown + 1, 0, 0]);
        let workable = await dataFeedKeeper['workable(bytes32)'](randomSalt);
        expect(workable).to.eq(false);
      });
    });
  });

  describe('calculateSecondsAgos(...)', () => {
    let fromTimestamp: number;
    let now: number;
    let unknownTime: number;
    let periods: number;
    let remainder: number;
    const periodLength = 1_000;

    beforeEach(async () => {
      fromTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
    });

    context('when less than a period has passed since fromTimestamp', () => {
      beforeEach(async () => {
        await evm.advanceToTimeAndBlock(fromTimestamp + periodLength / 2);
      });

      it('should return a single datapoint array with 0', async () => {
        const secondsAgos = await dataFeedKeeper.calculateSecondsAgos(periodLength, fromTimestamp);
        expect(secondsAgos).to.deep.eq([0]);
      });
    });

    context('when more than a period has passed since fromTimestamp', () => {
      beforeEach(async () => {
        await evm.advanceToTimeAndBlock(fromTimestamp + periodLength * 3.14);
        now = (await ethers.provider.getBlock('latest')).timestamp;
        unknownTime = now - fromTimestamp;
        periods = Math.trunc(unknownTime / periodLength);
        remainder = unknownTime % periodLength;
      });

      it('should return an array with proper length', async () => {
        periods++; // adds the bridged remainder [periodLength % time]

        const secondsAgos = await dataFeedKeeper.calculateSecondsAgos(periodLength, fromTimestamp);
        expect(secondsAgos.length).to.eq(periods);
      });

      it('should build the array of secondsAgos', async () => {
        periods++; // adds the bridged remainder [periodLength % time]

        let expectedSecondsAgos: number[] = [];

        for (let i = 0; i < periods; i++) {
          expectedSecondsAgos[i] = unknownTime - remainder - i * periodLength;
        }

        let secondsAgos = await dataFeedKeeper.calculateSecondsAgos(periodLength, fromTimestamp);
        expect(secondsAgos).to.deep.eq(expectedSecondsAgos);
      });

      it('should have 0 as last item', async () => {
        let secondsAgos = await dataFeedKeeper.calculateSecondsAgos(periodLength, fromTimestamp);
        expect(secondsAgos[secondsAgos.length - 1]).to.eq(0);
      });
    });

    context('when exactly n periods have passed since fromTimestamp', () => {
      beforeEach(async () => {
        await evm.advanceToTimeAndBlock(fromTimestamp + periodLength * 3);
        now = (await ethers.provider.getBlock('latest')).timestamp;
        unknownTime = now - fromTimestamp;
        periods = Math.trunc(unknownTime / periodLength);
      });

      it('should return an array with proper length', async () => {
        const secondsAgos = await dataFeedKeeper.calculateSecondsAgos(periodLength, fromTimestamp);
        expect(secondsAgos.length).to.eq(periods);
      });

      it('should build the array of secondsAgos', async () => {
        let expectedSecondsAgos: number[] = [];

        for (let i = 0; i < periods; i++) {
          expectedSecondsAgos[i] = unknownTime - (i + 1) * periodLength;
        }

        let secondsAgos = await dataFeedKeeper.calculateSecondsAgos(periodLength, fromTimestamp);
        expect(secondsAgos).to.deep.eq(expectedSecondsAgos);
      });

      it('should have 0 as last item', async () => {
        let secondsAgos = await dataFeedKeeper.calculateSecondsAgos(periodLength, fromTimestamp);
        expect(secondsAgos[secondsAgos.length - 1]).to.eq(0);
      });
    });
  });
});
