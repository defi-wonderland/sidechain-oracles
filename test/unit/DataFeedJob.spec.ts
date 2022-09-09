import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { DataFeedJob, DataFeedJob__factory, IKeep3r, IDataFeed } from '@typechained';
import { smock, MockContract, MockContractFactory, FakeContract } from '@defi-wonderland/smock';
import { evm, wallet } from '@utils';
import { KEEP3R } from '@utils/constants';
import { toBN } from '@utils/bn';
import { onlyGovernor } from '@utils/behaviours';
import { sortTokens } from '@utils/misc';
import chai, { expect } from 'chai';

chai.use(smock.matchers);

describe('DataFeedJob.sol', () => {
  let governor: SignerWithAddress;
  let keeper: SignerWithAddress;
  let dataFeedJob: MockContract<DataFeedJob>;
  let dataFeedJobFactory: MockContractFactory<DataFeedJob__factory>;
  let keep3r: FakeContract<IKeep3r>;
  let dataFeed: FakeContract<IDataFeed>;
  let snapshotId: string;

  const initialJobCooldown = toBN(4 * 60 * 60);
  const secondsAgos = [14400, 10800, 7200, 3600, 0];

  const randomSenderAdapterAddress = wallet.generateRandomAddress();
  const randomChainId = 32;

  const randomTokenA = wallet.generateRandomAddress();
  const randomTokenB = wallet.generateRandomAddress();
  const [randomToken0, randomToken1] = sortTokens([randomTokenA, randomTokenB]);
  const randomFee = 3000;

  before(async () => {
    [, governor, keeper] = await ethers.getSigners();

    keep3r = await smock.fake('IKeep3r', { address: KEEP3R });
    keep3r.isKeeper.whenCalledWith(keeper.address).returns(true);
    dataFeed = await smock.fake('IDataFeed');

    dataFeedJobFactory = await smock.mock('DataFeedJob');
    dataFeedJob = await dataFeedJobFactory.deploy(dataFeed.address, governor.address, initialJobCooldown);

    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('constructor(...)', () => {
    it('should set the governor', async () => {
      expect(await dataFeedJob.governor()).to.eq(governor.address);
    });

    it('should initialize dataFeed interface', async () => {
      let dataFeedInterface = await dataFeedJob.dataFeed();
      expect(dataFeedInterface).to.eq(dataFeed.address);
    });

    it('should set the jobCooldown', async () => {
      let jobCooldown = await dataFeedJob.jobCooldown();
      expect(jobCooldown).to.eq(initialJobCooldown);
    });
  });

  describe('work(...)', () => {
    it('should revert if the keeper is not valid', async () => {
      keep3r.isKeeper.whenCalledWith(governor.address).returns(false);
      await expect(
        dataFeedJob.connect(governor).work(randomSenderAdapterAddress, randomChainId, randomTokenA, randomTokenB, randomFee, secondsAgos)
      ).to.be.revertedWith('KeeperNotValid()');
    });

    it('should revert if the job is not workable', async () => {
      await dataFeedJob.connect(keeper).work(randomSenderAdapterAddress, randomChainId, randomTokenA, randomTokenB, randomFee, secondsAgos);
      await expect(
        dataFeedJob.connect(keeper).work(randomSenderAdapterAddress, randomChainId, randomTokenA, randomTokenB, randomFee, secondsAgos)
      ).to.be.revertedWith('NotWorkable()');
    });

    it('should update the last work timestamp', async () => {
      await dataFeedJob.connect(keeper).work(randomSenderAdapterAddress, randomChainId, randomTokenA, randomTokenB, randomFee, secondsAgos);
      let workTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
      let lastWorkTimestamp = await dataFeedJob.getVariable('_lastWorkTime', [randomToken0, randomToken1]);
      expect(lastWorkTimestamp).to.eq(workTimestamp);
      await evm.advanceTimeAndBlock(initialJobCooldown.toNumber());
      await dataFeedJob.connect(keeper).work(randomSenderAdapterAddress, randomChainId, randomTokenB, randomTokenA, randomFee, secondsAgos);
      workTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
      lastWorkTimestamp = await dataFeedJob.getVariable('_lastWorkTime', [randomToken0, randomToken1]);
      expect(lastWorkTimestamp).to.eq(workTimestamp);
    });

    it.skip('should call to send observations', async () => {
      dataFeed.sendObservations.reset();
      await dataFeedJob.connect(keeper).work(randomSenderAdapterAddress, randomChainId, randomTokenA, randomTokenB, randomFee, secondsAgos);
      expect(dataFeed.sendObservations).to.have.been.calledOnceWith(
        randomSenderAdapterAddress,
        randomChainId,
        randomTokenA,
        randomTokenB,
        randomFee,
        secondsAgos
      );
    });

    it('should emit Bridged', async () => {
      await expect(
        dataFeedJob.connect(keeper).work(randomSenderAdapterAddress, randomChainId, randomTokenA, randomTokenB, randomFee, secondsAgos)
      )
        .to.emit(dataFeedJob, 'Bridged')
        .withArgs(keeper.address, randomSenderAdapterAddress, randomChainId, randomTokenA, randomTokenB, randomFee, secondsAgos);
    });

    it('should call to pay the keeper', async () => {
      keep3r.worked.reset();
      await dataFeedJob.connect(keeper).work(randomSenderAdapterAddress, randomChainId, randomTokenA, randomTokenB, randomFee, secondsAgos);
      expect(keep3r.worked).to.have.been.calledOnceWith(keeper.address);
    });
  });

  describe('forceWork(...)', () => {
    onlyGovernor(
      () => dataFeedJob,
      'forceWork',
      () => governor,
      () => [randomSenderAdapterAddress, randomChainId, randomTokenA, randomTokenB, randomFee, secondsAgos]
    );

    it('should update the last work timestamp', async () => {
      await dataFeedJob
        .connect(governor)
        .forceWork(randomSenderAdapterAddress, randomChainId, randomTokenA, randomTokenB, randomFee, secondsAgos);
      let forceWorkTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
      let lastWorkTimestamp = await dataFeedJob.getVariable('_lastWorkTime', [randomToken0, randomToken1]);
      expect(lastWorkTimestamp).to.eq(forceWorkTimestamp);
      await dataFeedJob
        .connect(governor)
        .forceWork(randomSenderAdapterAddress, randomChainId, randomTokenB, randomTokenA, randomFee, secondsAgos);
      forceWorkTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
      lastWorkTimestamp = await dataFeedJob.getVariable('_lastWorkTime', [randomToken0, randomToken1]);
      expect(lastWorkTimestamp).to.eq(forceWorkTimestamp);
    });

    it.skip('should call to send observations', async () => {
      dataFeed.sendObservations.reset();
      await dataFeedJob
        .connect(governor)
        .forceWork(randomSenderAdapterAddress, randomChainId, randomTokenA, randomTokenB, randomFee, secondsAgos);
      expect(dataFeed.sendObservations).to.have.been.calledOnceWith(
        randomSenderAdapterAddress,
        randomChainId,
        randomTokenA,
        randomTokenB,
        randomFee,
        secondsAgos
      );
    });

    it('should emit ForceBridged', async () => {
      await expect(
        dataFeedJob.connect(governor).forceWork(randomSenderAdapterAddress, randomChainId, randomTokenA, randomTokenB, randomFee, secondsAgos)
      )
        .to.emit(dataFeedJob, 'ForceBridged')
        .withArgs(randomSenderAdapterAddress, randomChainId, randomTokenA, randomTokenB, randomFee, secondsAgos);
    });
  });

  describe('setJobCooldown(...)', () => {
    let newJobCooldown = toBN(1 * 60 * 60);

    onlyGovernor(
      () => dataFeedJob,
      'setJobCooldown',
      () => governor,
      () => [newJobCooldown]
    );

    it('should update the jobCooldown', async () => {
      await dataFeedJob.connect(governor).setJobCooldown(newJobCooldown);
      let jobCooldown = await dataFeedJob.jobCooldown();
      expect(jobCooldown).to.eq(newJobCooldown);
    });

    it('should emit JobCooldownUpdated', async () => {
      await expect(dataFeedJob.connect(governor).setJobCooldown(newJobCooldown))
        .to.emit(dataFeedJob, 'JobCooldownUpdated')
        .withArgs(newJobCooldown);
    });
  });

  describe('workable(...)', () => {
    it('should return true if jobCooldown is 0', async () => {
      let workable = await dataFeedJob.workable(randomTokenA, randomTokenB);
      expect(workable).to.eq(true);
    });

    it('should return true if jobCooldown has expired', async () => {
      await dataFeedJob.connect(keeper).work(randomSenderAdapterAddress, randomChainId, randomTokenA, randomTokenB, randomFee, secondsAgos);
      await evm.advanceTimeAndBlock(initialJobCooldown.toNumber());
      let workable = await dataFeedJob.workable(randomTokenA, randomTokenB);
      expect(workable).to.eq(true);
    });

    it('should return false if jobCooldown has not expired', async () => {
      await dataFeedJob.connect(keeper).work(randomSenderAdapterAddress, randomChainId, randomTokenA, randomTokenB, randomFee, secondsAgos);
      await evm.advanceTimeAndBlock(initialJobCooldown.sub(1).toNumber());
      let workable = await dataFeedJob.workable(randomTokenA, randomTokenB);
      expect(workable).to.eq(false);
    });
  });

  describe('getLastWorkTimestamp(...)', () => {
    let workTimestamp: number;

    beforeEach(async () => {
      await dataFeedJob.connect(keeper).work(randomSenderAdapterAddress, randomChainId, randomTokenA, randomTokenB, randomFee, secondsAgos);
      workTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
    });

    it('should return the requested last work timestamp', async () => {
      let lastWorkTimestamp = await dataFeedJob.getLastWorkTimestamp(randomTokenA, randomTokenB);
      expect(lastWorkTimestamp).to.eq(workTimestamp);
      lastWorkTimestamp = await dataFeedJob.getLastWorkTimestamp(randomTokenB, randomTokenA);
      expect(lastWorkTimestamp).to.eq(workTimestamp);
    });
  });
});
