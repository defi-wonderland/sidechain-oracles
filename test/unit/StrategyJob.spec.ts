import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { StrategyJob, StrategyJob__factory, IKeep3r, IDataFeedStrategy, IDataFeed } from '@typechained';
import { smock, MockContract, MockContractFactory, FakeContract } from '@defi-wonderland/smock';
import { evm, wallet } from '@utils';
import { ZERO_ADDRESS, KEEP3R, VALID_POOL_SALT } from '@utils/constants';
import { onlyGovernor } from '@utils/behaviours';
import chai, { expect } from 'chai';

chai.use(smock.matchers);

describe('StrategyJob.sol', () => {
  let governor: SignerWithAddress;
  let keeper: SignerWithAddress;
  let strategyJob: MockContract<StrategyJob>;
  let strategyJobFactory: MockContractFactory<StrategyJob__factory>;
  let keep3r: FakeContract<IKeep3r>;
  let dataFeedStrategy: FakeContract<IDataFeedStrategy>;
  let dataFeed: FakeContract<IDataFeed>;
  let snapshotId: string;

  const defaultSenderAdapterAddress = wallet.generateRandomAddress();

  const randomSenderAdapterAddress = wallet.generateRandomAddress();
  const randomChainId = 32;
  const randomSalt = VALID_POOL_SALT;
  const randomNonce = 420;
  const randomTrigger = 1;

  const NONE_TRIGGER = 0;

  before(async () => {
    [, governor, keeper] = await ethers.getSigners();

    keep3r = await smock.fake('IKeep3r', { address: KEEP3R });
    keep3r.isKeeper.whenCalledWith(keeper.address).returns(true);
    dataFeedStrategy = await smock.fake('IDataFeedStrategy');
    dataFeed = await smock.fake('IDataFeed');

    strategyJobFactory = await smock.mock('StrategyJob');
    strategyJob = await strategyJobFactory.deploy(governor.address, dataFeedStrategy.address, dataFeed.address, defaultSenderAdapterAddress);

    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('constructor(...)', () => {
    it('should revert if dataFeedStrategy is set to the zero address', async () => {
      await expect(strategyJobFactory.deploy(governor.address, ZERO_ADDRESS, dataFeed.address, defaultSenderAdapterAddress)).to.be.revertedWith(
        'ZeroAddress()'
      );
    });

    it('should revert if dataFeed is set to the zero address', async () => {
      await expect(
        strategyJobFactory.deploy(governor.address, dataFeedStrategy.address, ZERO_ADDRESS, defaultSenderAdapterAddress)
      ).to.be.revertedWith('ZeroAddress()');
    });

    it('should set the governor', async () => {
      expect(await strategyJob.governor()).to.eq(governor.address);
    });

    it('should initialize dataFeedStrategy interface', async () => {
      expect(await strategyJob.dataFeedStrategy()).to.eq(dataFeedStrategy.address);
    });

    it('should initialize dataFeed interface', async () => {
      expect(await strategyJob.dataFeed()).to.eq(dataFeed.address);
    });

    it('should set the defaultBridgeSenderAdapter', async () => {
      expect(await strategyJob.defaultBridgeSenderAdapter()).to.eq(defaultSenderAdapterAddress);
    });
  });

  describe('work(uint32,bytes32,uint24,(uint32,int24)[])', () => {
    let observationData0 = [500000, 50];
    let observationData1 = [1000000, 100];
    let observationData2 = [3000000, 300];
    let observationsData = [observationData0, observationData1, observationData2];

    it('should revert if the keeper is not valid', async () => {
      keep3r.isKeeper.whenCalledWith(governor.address).returns(false);
      await expect(
        strategyJob.connect(governor)['work(uint32,bytes32,uint24,(uint32,int24)[])'](randomChainId, randomSalt, randomNonce, observationsData)
      ).to.be.revertedWith('KeeperNotValid()');
    });

    context('when lastPoolNonceBridged is 0', () => {
      before(async () => {
        dataFeed.lastPoolStateObserved.whenCalledWith(randomSalt).returns([randomNonce, 0, 0, 0]);
      });

      it('should revert if the nonce is different than the last pool nonce observed', async () => {
        await expect(
          strategyJob
            .connect(keeper)
            ['work(uint32,bytes32,uint24,(uint32,int24)[])'](randomChainId, randomSalt, randomNonce - 1, observationsData)
        ).to.be.revertedWith('NotWorkable()');
        await expect(
          strategyJob
            .connect(keeper)
            ['work(uint32,bytes32,uint24,(uint32,int24)[])'](randomChainId, randomSalt, randomNonce + 1, observationsData)
        ).to.be.revertedWith('NotWorkable()');
      });

      it('should update lastPoolNonceBridged', async () => {
        await strategyJob
          .connect(keeper)
          ['work(uint32,bytes32,uint24,(uint32,int24)[])'](randomChainId, randomSalt, randomNonce, observationsData);
        let lastPoolNonceBridged = await strategyJob.lastPoolNonceBridged(randomChainId, randomSalt);
        expect(lastPoolNonceBridged).to.eq(randomNonce);
      });

      it('should call to send observations', async () => {
        dataFeed.sendObservations.reset();
        await strategyJob
          .connect(keeper)
          ['work(uint32,bytes32,uint24,(uint32,int24)[])'](randomChainId, randomSalt, randomNonce, observationsData);
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
        await strategyJob
          .connect(keeper)
          ['work(uint32,bytes32,uint24,(uint32,int24)[])'](randomChainId, randomSalt, randomNonce, observationsData);
        expect(keep3r.worked).to.have.been.calledOnceWith(keeper.address);
      });
    });

    context('when lastPoolNonceBridged is not 0', () => {
      beforeEach(async () => {
        await strategyJob.setVariable('lastPoolNonceBridged', { [randomChainId]: { [randomSalt]: randomNonce - 1 } });
      });

      it('should revert if the nonce is not one higher than lastPoolNonceBridged', async () => {
        await expect(
          strategyJob
            .connect(keeper)
            ['work(uint32,bytes32,uint24,(uint32,int24)[])'](randomChainId, randomSalt, randomNonce - 1, observationsData)
        ).to.be.revertedWith('NotWorkable()');
        await expect(
          strategyJob
            .connect(keeper)
            ['work(uint32,bytes32,uint24,(uint32,int24)[])'](randomChainId, randomSalt, randomNonce + 1, observationsData)
        ).to.be.revertedWith('NotWorkable()');
      });

      it('should update lastPoolNonceBridged', async () => {
        await strategyJob
          .connect(keeper)
          ['work(uint32,bytes32,uint24,(uint32,int24)[])'](randomChainId, randomSalt, randomNonce, observationsData);
        let lastPoolNonceBridged = await strategyJob.lastPoolNonceBridged(randomChainId, randomSalt);
        expect(lastPoolNonceBridged).to.eq(randomNonce);
      });

      it('should call to send observations', async () => {
        dataFeed.sendObservations.reset();
        await strategyJob
          .connect(keeper)
          ['work(uint32,bytes32,uint24,(uint32,int24)[])'](randomChainId, randomSalt, randomNonce, observationsData);
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
        await strategyJob
          .connect(keeper)
          ['work(uint32,bytes32,uint24,(uint32,int24)[])'](randomChainId, randomSalt, randomNonce, observationsData);
        expect(keep3r.worked).to.have.been.calledOnceWith(keeper.address);
      });
    });
  });

  describe('work(bytes32,uint8)', () => {
    it('should revert if the keeper is not valid', async () => {
      keep3r.isKeeper.whenCalledWith(governor.address).returns(false);
      await expect(strategyJob.connect(governor)['work(bytes32,uint8)'](randomSalt, randomTrigger)).to.be.revertedWith('KeeperNotValid()');
    });

    it('should call to fetch observations strategically', async () => {
      dataFeedStrategy.strategicFetchObservations.reset();
      await strategyJob.connect(keeper)['work(bytes32,uint8)'](randomSalt, randomTrigger);
      expect(dataFeedStrategy.strategicFetchObservations).to.have.been.calledOnceWith(randomSalt, randomTrigger);
    });

    it('should call to pay the keeper', async () => {
      keep3r.worked.reset();
      await strategyJob.connect(keeper)['work(bytes32,uint8)'](randomSalt, randomTrigger);
      expect(keep3r.worked).to.have.been.calledOnceWith(keeper.address);
    });
  });

  describe('setDefaultBridgeSenderAdapter(...)', () => {
    onlyGovernor(
      () => strategyJob,
      'setDefaultBridgeSenderAdapter',
      () => governor,
      () => [randomSenderAdapterAddress]
    );

    it('should revert if defaultBridgeSenderAdapter is set to the zero address', async () => {
      await expect(strategyJob.connect(governor).setDefaultBridgeSenderAdapter(ZERO_ADDRESS)).to.be.revertedWith('ZeroAddress()');
    });

    it('should update the defaultBridgeSenderAdapter', async () => {
      await strategyJob.connect(governor).setDefaultBridgeSenderAdapter(randomSenderAdapterAddress);
      expect(await strategyJob.defaultBridgeSenderAdapter()).to.eq(randomSenderAdapterAddress);
    });

    it('should emit DefaultBridgeSenderAdapterSet', async () => {
      await expect(strategyJob.connect(governor).setDefaultBridgeSenderAdapter(randomSenderAdapterAddress))
        .to.emit(strategyJob, 'DefaultBridgeSenderAdapterSet')
        .withArgs(randomSenderAdapterAddress);
    });
  });

  describe('workable(uint32,bytes32,uint24)', () => {
    let isWorkable: boolean;

    it('should return false if the pipeline is not whitelisted', async () => {
      dataFeed.whitelistedNonces.whenCalledWith(randomChainId, randomSalt).returns(0);
      isWorkable = await strategyJob['workable(uint32,bytes32,uint24)'](randomChainId, randomSalt, randomNonce);
      expect(isWorkable).to.eq(false);
    });

    context('when the pipeline is whitelisted', () => {
      beforeEach(async () => {
        dataFeed.whitelistedNonces.whenCalledWith(randomChainId, randomSalt).returns(randomNonce);
      });

      it('should return false if the nonce is lower than the whitelisted nonce', async () => {
        isWorkable = await strategyJob['workable(uint32,bytes32,uint24)'](randomChainId, randomSalt, randomNonce - 1);
        expect(isWorkable).to.eq(false);
      });

      context('when lastPoolNonceBridged is 0', () => {
        before(async () => {
          dataFeed.lastPoolStateObserved.whenCalledWith(randomSalt).returns([randomNonce, 0, 0, 0]);
        });

        it('should return true if the nonce equals the last pool nonce observed', async () => {
          isWorkable = await strategyJob['workable(uint32,bytes32,uint24)'](randomChainId, randomSalt, randomNonce);
          expect(isWorkable).to.eq(true);
        });

        it('should return false if the nonce is different than the last pool nonce observed', async () => {
          isWorkable = await strategyJob['workable(uint32,bytes32,uint24)'](randomChainId, randomSalt, randomNonce - 1);
          expect(isWorkable).to.eq(false);
          isWorkable = await strategyJob['workable(uint32,bytes32,uint24)'](randomChainId, randomSalt, randomNonce + 1);
          expect(isWorkable).to.eq(false);
        });
      });

      context('when lastPoolNonceBridged is not 0', () => {
        beforeEach(async () => {
          await strategyJob.setVariable('lastPoolNonceBridged', { [randomChainId]: { [randomSalt]: randomNonce - 1 } });
        });

        it('should return true if the nonce is one higher than lastPoolNonceBridged', async () => {
          isWorkable = await strategyJob['workable(uint32,bytes32,uint24)'](randomChainId, randomSalt, randomNonce);
          expect(isWorkable).to.eq(true);
        });

        it('should return false if the nonce is not one higher than lastPoolNonceBridged', async () => {
          isWorkable = await strategyJob['workable(uint32,bytes32,uint24)'](randomChainId, randomSalt, randomNonce - 1);
          expect(isWorkable).to.eq(false);
          isWorkable = await strategyJob['workable(uint32,bytes32,uint24)'](randomChainId, randomSalt, randomNonce + 1);
          expect(isWorkable).to.eq(false);
        });
      });
    });
  });

  describe('workable(bytes32)', () => {
    let reason: number;

    it('should return NONE if the pool is not whitelisted', async () => {
      dataFeed.isWhitelistedPool.whenCalledWith(randomSalt).returns(false);
      reason = await strategyJob['workable(bytes32)'](randomSalt);
      expect(reason).to.eq(NONE_TRIGGER);
    });

    context('when the pool is whitelisted', () => {
      beforeEach(async () => {
        dataFeed.isWhitelistedPool.whenCalledWith(randomSalt).returns(true);
      });

      it('should return the reason why the work is strategic', async () => {
        dataFeedStrategy['isStrategic(bytes32)'].whenCalledWith(randomSalt).returns(randomTrigger);
        reason = await strategyJob['workable(bytes32)'](randomSalt);
        expect(reason).to.eq(randomTrigger);
      });

      it('should return NONE if the work is not strategic', async () => {
        dataFeedStrategy['isStrategic(bytes32)'].whenCalledWith(randomSalt).returns(NONE_TRIGGER);
        reason = await strategyJob['workable(bytes32)'](randomSalt);
        expect(reason).to.eq(NONE_TRIGGER);
      });
    });
  });

  describe('workable(bytes32,uint8)', () => {
    let isWorkable: boolean;

    it('should return false if the pool is not whitelisted', async () => {
      dataFeed.isWhitelistedPool.whenCalledWith(randomSalt).returns(false);
      isWorkable = await strategyJob['workable(bytes32,uint8)'](randomSalt, randomTrigger);
      expect(isWorkable).to.eq(false);
    });

    context('when the pool is whitelisted', () => {
      beforeEach(async () => {
        dataFeed.isWhitelistedPool.whenCalledWith(randomSalt).returns(true);
      });

      it('should return true if the work is strategic', async () => {
        dataFeedStrategy['isStrategic(bytes32,uint8)'].whenCalledWith(randomSalt, randomTrigger).returns(true);
        isWorkable = await strategyJob['workable(bytes32,uint8)'](randomSalt, randomTrigger);
        expect(isWorkable).to.eq(true);
      });

      it('should return false if the work is not strategic', async () => {
        dataFeedStrategy['isStrategic(bytes32,uint8)'].whenCalledWith(randomSalt, randomTrigger).returns(false);
        isWorkable = await strategyJob['workable(bytes32,uint8)'](randomSalt, randomTrigger);
        expect(isWorkable).to.eq(false);
      });
    });
  });
});
