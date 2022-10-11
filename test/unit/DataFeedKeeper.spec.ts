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

  const defaultSenderAdapterAddress = wallet.generateRandomAddress();
  const initialJobCooldown = toBN(4 * 60 * 60);

  const randomSenderAdapterAddress = wallet.generateRandomAddress();
  const randomChainId = 32;
  const randomSalt = VALID_POOL_SALT;
  const randomNonce = 2;

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

  describe('work(uint16,bytes32,uint24,(uint32,int24)[])', () => {
    let observationData0 = [500000, 50];
    let observationData1 = [1000000, 100];
    let observationData2 = [3000000, 300];
    let observationsData = [observationData0, observationData1, observationData2];

    it('should revert if the keeper is not valid', async () => {
      keep3r.isKeeper.whenCalledWith(governor.address).returns(false);
      await expect(
        dataFeedKeeper
          .connect(governor)
          ['work(uint16,bytes32,uint24,(uint32,int24)[])'](randomChainId, randomSalt, randomNonce, observationsData)
      ).to.be.revertedWith('KeeperNotValid()');
    });

    context('when lastPoolNonceBridged is 0', () => {
      before(async () => {
        dataFeed.lastPoolStateObserved.whenCalledWith(randomSalt).returns([randomNonce, 0, 0, 0]);
      });

      it('should revert if the nonce is different than the last pool nonce observed', async () => {
        await expect(
          dataFeedKeeper
            .connect(keeper)
            ['work(uint16,bytes32,uint24,(uint32,int24)[])'](randomChainId, randomSalt, randomNonce - 1, observationsData)
        ).to.be.revertedWith('NotWorkable()');
        await expect(
          dataFeedKeeper
            .connect(keeper)
            ['work(uint16,bytes32,uint24,(uint32,int24)[])'](randomChainId, randomSalt, randomNonce + 1, observationsData)
        ).to.be.revertedWith('NotWorkable()');
      });

      it('should update lastPoolNonceBridged', async () => {
        await dataFeedKeeper
          .connect(keeper)
          ['work(uint16,bytes32,uint24,(uint32,int24)[])'](randomChainId, randomSalt, randomNonce, observationsData);
        let lastPoolNonceBridged = await dataFeedKeeper.lastPoolNonceBridged(randomChainId, randomSalt);
        expect(lastPoolNonceBridged).to.eq(randomNonce);
      });

      it('should call to send observations', async () => {
        dataFeed.sendObservations.reset();
        await dataFeedKeeper
          .connect(keeper)
          ['work(uint16,bytes32,uint24,(uint32,int24)[])'](randomChainId, randomSalt, randomNonce, observationsData);
        expect(dataFeed.sendObservations).to.have.been.calledOnceWith(
          defaultSenderAdapterAddress,
          randomChainId,
          randomSalt,
          randomNonce,
          observationsData
        );
      });

      it('should call to pay the keeper', async () => {
        keep3r.worked.reset();
        await dataFeedKeeper
          .connect(keeper)
          ['work(uint16,bytes32,uint24,(uint32,int24)[])'](randomChainId, randomSalt, randomNonce, observationsData);
        expect(keep3r.worked).to.have.been.calledOnceWith(keeper.address);
      });
    });

    context('when lastPoolNonceBridged is not 0', () => {
      beforeEach(async () => {
        await dataFeedKeeper.setVariable('lastPoolNonceBridged', { [randomChainId]: { [randomSalt]: randomNonce - 1 } });
      });

      it('should revert if the nonce is not one higher than lastPoolNonceBridged', async () => {
        await expect(
          dataFeedKeeper
            .connect(keeper)
            ['work(uint16,bytes32,uint24,(uint32,int24)[])'](randomChainId, randomSalt, randomNonce - 1, observationsData)
        ).to.be.revertedWith('NotWorkable()');
        await expect(
          dataFeedKeeper
            .connect(keeper)
            ['work(uint16,bytes32,uint24,(uint32,int24)[])'](randomChainId, randomSalt, randomNonce + 1, observationsData)
        ).to.be.revertedWith('NotWorkable()');
      });

      it('should update lastPoolNonceBridged', async () => {
        await dataFeedKeeper
          .connect(keeper)
          ['work(uint16,bytes32,uint24,(uint32,int24)[])'](randomChainId, randomSalt, randomNonce, observationsData);
        let lastPoolNonceBridged = await dataFeedKeeper.lastPoolNonceBridged(randomChainId, randomSalt);
        expect(lastPoolNonceBridged).to.eq(randomNonce);
      });

      it('should call to send observations', async () => {
        dataFeed.sendObservations.reset();
        await dataFeedKeeper
          .connect(keeper)
          ['work(uint16,bytes32,uint24,(uint32,int24)[])'](randomChainId, randomSalt, randomNonce, observationsData);
        expect(dataFeed.sendObservations).to.have.been.calledOnceWith(
          defaultSenderAdapterAddress,
          randomChainId,
          randomSalt,
          randomNonce,
          observationsData
        );
      });

      it('should call to pay the keeper', async () => {
        keep3r.worked.reset();
        await dataFeedKeeper
          .connect(keeper)
          ['work(uint16,bytes32,uint24,(uint32,int24)[])'](randomChainId, randomSalt, randomNonce, observationsData);
        expect(keep3r.worked).to.have.been.calledOnceWith(keeper.address);
      });
    });
  });

  describe('work(bytes32)', () => {
    let now: number;
    let periodLength: number;
    const lastBlockTimestampObserved = 0;

    beforeEach(async () => {
      now = (await ethers.provider.getBlock('latest')).timestamp + 1;
      periodLength = await dataFeedKeeper.periodLength();
      dataFeed.lastPoolStateObserved.whenCalledWith(randomSalt).returns([0, lastBlockTimestampObserved, 0, 0]);
    });

    it('should revert if the keeper is not valid', async () => {
      keep3r.isKeeper.whenCalledWith(governor.address).returns(false);
      await expect(dataFeedKeeper.connect(governor)['work(bytes32)'](randomSalt)).to.be.revertedWith('KeeperNotValid()');
    });

    it('should revert if jobCooldown has not expired', async () => {
      dataFeed.lastPoolStateObserved.whenCalledWith(randomSalt).returns([1, now, 0, 0]);
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

  describe('workable(uint16,bytes32,uint24)', () => {
    it('should return false if the pipeline is not whitelisted', async () => {
      dataFeed.whitelistedNonces.whenCalledWith(randomChainId, randomSalt).returns(0);
      let workable = await dataFeedKeeper['workable(uint16,bytes32,uint24)'](randomChainId, randomSalt, randomNonce);
      expect(workable).to.eq(false);
    });

    context('when the pipeline is whitelisted', () => {
      beforeEach(async () => {
        dataFeed.whitelistedNonces.whenCalledWith(randomChainId, randomSalt).returns(randomNonce);
      });

      it('should return false if the nonce is lower than the whitelisted nonce', async () => {
        let workable = await dataFeedKeeper['workable(uint16,bytes32,uint24)'](randomChainId, randomSalt, randomNonce - 1);
        expect(workable).to.eq(false);
      });

      context('when lastPoolNonceBridged is 0', () => {
        before(async () => {
          dataFeed.lastPoolStateObserved.whenCalledWith(randomSalt).returns([randomNonce, 0, 0, 0]);
        });

        it('should return true if the nonce equals the last pool nonce observed', async () => {
          let workable = await dataFeedKeeper['workable(uint16,bytes32,uint24)'](randomChainId, randomSalt, randomNonce);
          expect(workable).to.eq(true);
        });

        it('should return false if the nonce is different than the last pool nonce observed', async () => {
          let workable = await dataFeedKeeper['workable(uint16,bytes32,uint24)'](randomChainId, randomSalt, randomNonce - 1);
          expect(workable).to.eq(false);
          workable = await dataFeedKeeper['workable(uint16,bytes32,uint24)'](randomChainId, randomSalt, randomNonce + 1);
          expect(workable).to.eq(false);
        });
      });

      context('when lastPoolNonceBridged is not 0', () => {
        beforeEach(async () => {
          await dataFeedKeeper.setVariable('lastPoolNonceBridged', { [randomChainId]: { [randomSalt]: randomNonce - 1 } });
        });

        it('should return true if the nonce is one higher than lastPoolNonceBridged', async () => {
          let workable = await dataFeedKeeper['workable(uint16,bytes32,uint24)'](randomChainId, randomSalt, randomNonce);
          expect(workable).to.eq(true);
        });

        it('should return false if the nonce is not one higher than lastPoolNonceBridged', async () => {
          let workable = await dataFeedKeeper['workable(uint16,bytes32,uint24)'](randomChainId, randomSalt, randomNonce - 1);
          expect(workable).to.eq(false);
          workable = await dataFeedKeeper['workable(uint16,bytes32,uint24)'](randomChainId, randomSalt, randomNonce + 1);
          expect(workable).to.eq(false);
        });
      });
    });
  });

  describe('workable(bytes32)', () => {
    let now: number;
    let jobCooldown = initialJobCooldown.toNumber();

    it('should return false if the pool is not whitelisted', async () => {
      dataFeed.isWhitelistedPool.whenCalledWith(randomSalt).returns(false);
      let workable = await dataFeedKeeper['workable(bytes32)'](randomSalt);
      expect(workable).to.eq(false);
    });

    context('when the pool is whitelisted', () => {
      beforeEach(async () => {
        dataFeed.isWhitelistedPool.whenCalledWith(randomSalt).returns(true);
        now = (await ethers.provider.getBlock('latest')).timestamp;
      });

      it('should return true if jobCooldown is 0', async () => {
        dataFeed.lastPoolStateObserved.whenCalledWith(randomSalt).returns([0, 0, 0, 0]);
        let workable = await dataFeedKeeper['workable(bytes32)'](randomSalt);
        expect(workable).to.eq(true);
      });

      it('should return true if jobCooldown has expired', async () => {
        dataFeed.lastPoolStateObserved.whenCalledWith(randomSalt).returns([0, now - jobCooldown, 0, 0]);
        let workable = await dataFeedKeeper['workable(bytes32)'](randomSalt);
        expect(workable).to.eq(true);
      });

      it('should return false if jobCooldown has not expired', async () => {
        dataFeed.lastPoolStateObserved.whenCalledWith(randomSalt).returns([0, now - jobCooldown + 1, 0, 0]);
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

    context('when less than a period has passed since fromTimestamp', () => {
      beforeEach(async () => {
        fromTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
        await evm.advanceToTimeAndBlock(fromTimestamp + periodLength / 2);
      });

      it('should return a single datapoint array with 0', async () => {
        const secondsAgos = await dataFeedKeeper.calculateSecondsAgos(periodLength, fromTimestamp);
        expect(secondsAgos).to.deep.eq([0]);
      });
    });

    context('when more than a period has passed since fromTimestamp', () => {
      beforeEach(async () => {
        fromTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
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
        fromTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
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

    context('when fromTimestamp is 0', () => {
      beforeEach(async () => {
        fromTimestamp = 0;
        now = (await ethers.provider.getBlock('latest')).timestamp;
        unknownTime = now - (now - 5 * periodLength);
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
