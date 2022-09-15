import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { DataFeedKeeper, DataFeedKeeper__factory, IKeep3r, IDataFeed } from '@typechained';
import { smock, MockContract, MockContractFactory, FakeContract } from '@defi-wonderland/smock';
import { evm, wallet } from '@utils';
import { KEEP3R, VALID_POOL_SALT } from '@utils/constants';
import { toBN } from '@utils/bn';
import { onlyGovernor } from '@utils/behaviours';
import chai, { expect } from 'chai';

chai.use(smock.matchers);

describe('DataFeedKeeper.sol', () => {
  let governor: SignerWithAddress;
  let keeper: SignerWithAddress;
  let dataFeedKeeper: MockContract<DataFeedKeeper>;
  let dataFeedKeeperFactory: MockContractFactory<DataFeedKeeper__factory>;
  let keep3r: FakeContract<IKeep3r>;
  let dataFeed: FakeContract<IDataFeed>;
  let snapshotId: string;

  const initialJobCooldown = toBN(4 * 60 * 60);
  const secondsAgos = [14400, 10800, 7200, 3600, 0];

  const randomSenderAdapterAddress = wallet.generateRandomAddress();
  const randomChainId = 32;
  const randomSalt = VALID_POOL_SALT;

  before(async () => {
    [, governor, keeper] = await ethers.getSigners();

    keep3r = await smock.fake('IKeep3r', { address: KEEP3R });
    keep3r.isKeeper.whenCalledWith(keeper.address).returns(true);
    dataFeed = await smock.fake('IDataFeed');

    dataFeedKeeperFactory = await smock.mock('DataFeedKeeper');
    dataFeedKeeper = await dataFeedKeeperFactory.deploy(governor.address, dataFeed.address, initialJobCooldown);

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

    it('should set the jobCooldown', async () => {
      let jobCooldown = await dataFeedKeeper.jobCooldown();
      expect(jobCooldown).to.eq(initialJobCooldown);
    });
  });

  describe('work(...)', () => {
    let lastWorkedAt: number;
    let periodLength: number;

    beforeEach(async () => {
      periodLength = await dataFeedKeeper.periodLength();
      lastWorkedAt = await dataFeedKeeper.lastWorkedAt(randomChainId, randomSalt);
    });

    it('should revert if the keeper is not valid', async () => {
      keep3r.isKeeper.whenCalledWith(governor.address).returns(false);
      await expect(dataFeedKeeper.connect(governor).work(randomSenderAdapterAddress, randomChainId, randomSalt)).to.be.revertedWith(
        'KeeperNotValid()'
      );
    });

    it('should revert if the job is not workable', async () => {
      let now = (await ethers.provider.getBlock('latest')).timestamp;
      await dataFeedKeeper.setVariable('lastWorkedAt', {
        [randomChainId]: { [randomSalt]: now },
      });
      await expect(dataFeedKeeper.connect(keeper).work(randomSenderAdapterAddress, randomChainId, randomSalt)).to.be.revertedWith(
        'NotWorkable()'
      );
    });

    it('should update the last work timestamp', async () => {
      await dataFeedKeeper.connect(keeper).work(randomSenderAdapterAddress, randomChainId, randomSalt);
      let workTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
      let lastWorkTimestamp = await dataFeedKeeper.lastWorkedAt(randomChainId, randomSalt);
      expect(lastWorkTimestamp).to.eq(workTimestamp);
    });

    it('should call to send observations', async () => {
      dataFeed.sendObservations.reset();
      await dataFeedKeeper.connect(keeper).work(randomSenderAdapterAddress, randomChainId, randomSalt);
      const secondsAgos = await dataFeedKeeper.calculateSecondsAgos(periodLength, lastWorkedAt);
      expect(dataFeed.sendObservations).to.have.been.calledOnceWith(randomSenderAdapterAddress, randomChainId, randomSalt, secondsAgos);
    });

    it('should emit Bridged', async () => {
      const tx = await dataFeedKeeper.connect(keeper).work(randomSenderAdapterAddress, randomChainId, randomSalt);
      const secondsAgos = await dataFeedKeeper.calculateSecondsAgos(periodLength, lastWorkedAt);

      await expect(tx)
        .to.emit(dataFeedKeeper, 'Bridged')
        .withArgs(keeper.address, randomSenderAdapterAddress, randomChainId, randomSalt, secondsAgos);
    });

    it('should call to pay the keeper', async () => {
      keep3r.worked.reset();
      await dataFeedKeeper.connect(keeper).work(randomSenderAdapterAddress, randomChainId, randomSalt);
      expect(keep3r.worked).to.have.been.calledOnceWith(keeper.address);
    });
  });

  describe('forceWork(...)', () => {
    onlyGovernor(
      () => dataFeedKeeper,
      'forceWork',
      () => governor,
      () => [randomSenderAdapterAddress, randomChainId, randomSalt, secondsAgos]
    );

    it('should update the last work timestamp', async () => {
      await dataFeedKeeper.connect(governor).forceWork(randomSenderAdapterAddress, randomChainId, randomSalt, secondsAgos);
      let forceWorkTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
      let lastWorkTimestamp = await dataFeedKeeper.lastWorkedAt(randomChainId, randomSalt);
      expect(lastWorkTimestamp).to.eq(forceWorkTimestamp);
    });

    it('should call to send observations', async () => {
      dataFeed.sendObservations.reset();
      await dataFeedKeeper.connect(governor).forceWork(randomSenderAdapterAddress, randomChainId, randomSalt, secondsAgos);
      expect(dataFeed.sendObservations).to.have.been.calledOnceWith(randomSenderAdapterAddress, randomChainId, randomSalt, secondsAgos);
    });

    it('should emit ForceBridged', async () => {
      await expect(dataFeedKeeper.connect(governor).forceWork(randomSenderAdapterAddress, randomChainId, randomSalt, secondsAgos))
        .to.emit(dataFeedKeeper, 'ForceBridged')
        .withArgs(randomSenderAdapterAddress, randomChainId, randomSalt, secondsAgos);
    });
  });

  describe('calculateSecondsAgos(...)', () => {
    let time: number;
    let now: number;
    let unknownTime: number;
    let periods: number;
    let remainder: number;
    const periodLength = 1_000;

    beforeEach(async () => {
      time = (await ethers.provider.getBlock('latest')).timestamp;
    });

    context('when less than a period has passed since last known timestamp', () => {
      beforeEach(async () => {
        await evm.advanceToTimeAndBlock(time + periodLength / 2);
      });

      it('should return a single datapoint array with 0', async () => {
        const secondsAgos = await dataFeedKeeper.calculateSecondsAgos(periodLength, time);
        expect(secondsAgos).to.deep.eq([0]);
      });
    });

    context('when more than a period has passed since last known timestamp', () => {
      beforeEach(async () => {
        await evm.advanceToTimeAndBlock(time + periodLength * 3.14);
        now = (await ethers.provider.getBlock('latest')).timestamp;
        unknownTime = now - time;
        periods = Math.trunc(unknownTime / periodLength);
        remainder = unknownTime % periodLength;
      });

      it('should return an array with proper length', async () => {
        periods++; // adds the bridged remainder [periodLength % time]

        const secondsAgos = await dataFeedKeeper.calculateSecondsAgos(periodLength, time);
        expect(secondsAgos.length).to.eq(periods);
      });

      it('should build the array of secondsAgos', async () => {
        periods++; // adds the bridged remainder [periodLength % time]

        let expectedSecondsAgos: number[] = [];

        for (let i = 0; i < periods; i++) {
          expectedSecondsAgos[i] = unknownTime - remainder - i * periodLength;
        }

        let secondsAgos = await dataFeedKeeper.calculateSecondsAgos(periodLength, time);
        expect(secondsAgos).to.deep.eq(expectedSecondsAgos);
      });

      it('should have 0 as last item', async () => {
        let secondsAgos = await dataFeedKeeper.calculateSecondsAgos(periodLength, time);
        expect(secondsAgos[secondsAgos.length - 1]).to.eq(0);
      });
    });

    context('when exactly n periods have passed since last known timestamp', () => {
      beforeEach(async () => {
        await evm.advanceToTimeAndBlock(time + periodLength * 3);
        now = (await ethers.provider.getBlock('latest')).timestamp;
        unknownTime = now - time;
        periods = Math.trunc(unknownTime / periodLength);
      });

      it('should return an array with proper length', async () => {
        const secondsAgos = await dataFeedKeeper.calculateSecondsAgos(periodLength, time);
        expect(secondsAgos.length).to.eq(periods);
      });

      it('should build the array of secondsAgos', async () => {
        let expectedSecondsAgos: number[] = [];

        for (let i = 0; i < periods; i++) {
          expectedSecondsAgos[i] = unknownTime - (i + 1) * periodLength;
        }

        let secondsAgos = await dataFeedKeeper.calculateSecondsAgos(periodLength, time);
        expect(secondsAgos).to.deep.eq(expectedSecondsAgos);
      });

      it('should have 0 as last item', async () => {
        let secondsAgos = await dataFeedKeeper.calculateSecondsAgos(periodLength, time);
        expect(secondsAgos[secondsAgos.length - 1]).to.eq(0);
      });
    });
  });

  describe('setJobCooldown(...)', () => {
    let newJobCooldown = toBN(1 * 60 * 60);

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

  describe('workable(...)', () => {
    let now: number;
    let jobCooldown: number;

    beforeEach(async () => {
      now = (await ethers.provider.getBlock('latest')).timestamp;
      jobCooldown = initialJobCooldown.toNumber();
    });

    it('should return true if jobCooldown is 0', async () => {
      await dataFeedKeeper.setVariable('lastWorkedAt', { [randomChainId]: { [randomSalt]: 0 } });
      let workable = await dataFeedKeeper.workable(randomChainId, randomSalt);
      expect(workable).to.eq(true);
    });

    it('should return true if jobCooldown has expired', async () => {
      await dataFeedKeeper.setVariable('lastWorkedAt', { [randomChainId]: { [randomSalt]: now - jobCooldown } });
      let workable = await dataFeedKeeper.workable(randomChainId, randomSalt);
      expect(workable).to.eq(true);
    });

    it('should return false if jobCooldown has not expired', async () => {
      await dataFeedKeeper.setVariable('lastWorkedAt', { [randomChainId]: { [randomSalt]: now - jobCooldown + 1 } });
      let workable = await dataFeedKeeper.workable(randomChainId, randomSalt);
      expect(workable).to.eq(false);
    });
  });
});
