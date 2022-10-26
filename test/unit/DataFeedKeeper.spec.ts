import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { DataFeedKeeper, DataFeedKeeper__factory, IKeep3r, IDataFeed, IUniswapV3Pool } from '@typechained';
import { smock, MockContract, MockContractFactory, FakeContract } from '@defi-wonderland/smock';
import { evm, wallet } from '@utils';
import { KEEP3R, UNI_FACTORY, POOL_INIT_CODE_HASH, VALID_POOL_SALT } from '@utils/constants';
import { toBN } from '@utils/bn';
import { onlyGovernor } from '@utils/behaviours';
import { getCreate2Address } from '@utils/misc';
import chai, { expect } from 'chai';

chai.use(smock.matchers);

describe('DataFeedKeeper.sol', () => {
  let governor: SignerWithAddress;
  let keeper: SignerWithAddress;
  let dataFeedKeeper: MockContract<DataFeedKeeper>;
  let dataFeedKeeperFactory: MockContractFactory<DataFeedKeeper__factory>;
  let keep3r: FakeContract<IKeep3r>;
  let dataFeed: FakeContract<IDataFeed>;
  let uniswapV3Pool: FakeContract<IUniswapV3Pool>;
  let snapshotId: string;

  const defaultSenderAdapterAddress = wallet.generateRandomAddress();
  const initialJobCooldown = 4 * 60 * 60;
  const initialPeriodLength = 1 * 60 * 60;
  const initialTwapLength = 4 * 60 * 60;
  const initialUpperTwapThreshold = toBN(953); // log_{1.0001}(1.1) = log(1.1)/log(1.0001) = 953 ===> (+10 %)
  const initialLowerTwapThreshold = toBN(-1053); // log_{1.0001}(0.9) = log(0.9)/log(1.0001) = -1053 ===> (-10 %)

  const randomSenderAdapterAddress = wallet.generateRandomAddress();
  const randomChainId = 32;
  const randomSalt = VALID_POOL_SALT;
  const randomNonce = 2;

  const NONE_TRIGGER = 0;
  const TIME_TRIGGER = 1;
  const TWAP_TRIGGER = 2;

  before(async () => {
    [, governor, keeper] = await ethers.getSigners();

    keep3r = await smock.fake('IKeep3r', { address: KEEP3R });
    keep3r.isKeeper.whenCalledWith(keeper.address).returns(true);
    dataFeed = await smock.fake('IDataFeed');

    uniswapV3Pool = await smock.fake('IUniswapV3Pool', {
      address: getCreate2Address(UNI_FACTORY, randomSalt, POOL_INIT_CODE_HASH),
    });

    dataFeedKeeperFactory = await smock.mock('DataFeedKeeper');
    dataFeedKeeper = await dataFeedKeeperFactory.deploy(
      governor.address,
      dataFeed.address,
      defaultSenderAdapterAddress,
      initialJobCooldown,
      initialPeriodLength
    );

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

    it('should set the periodLength', async () => {
      let periodLength = await dataFeedKeeper.periodLength();
      expect(periodLength).to.eq(initialPeriodLength);
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

  describe('work(bytes32,uint8)', () => {
    let now: number;

    it('should revert if the keeper is not valid', async () => {
      keep3r.isKeeper.whenCalledWith(governor.address).returns(false);
      await expect(dataFeedKeeper.connect(governor)['work(bytes32,uint8)'](randomSalt, TIME_TRIGGER)).to.be.revertedWith('KeeperNotValid()');
      await expect(dataFeedKeeper.connect(governor)['work(bytes32,uint8)'](randomSalt, TWAP_TRIGGER)).to.be.revertedWith('KeeperNotValid()');
    });

    context('when the trigger reason is TIME', () => {
      const lastBlockTimestampObserved = 0;

      beforeEach(async () => {
        now = (await ethers.provider.getBlock('latest')).timestamp + 1;
        dataFeed.lastPoolStateObserved.whenCalledWith(randomSalt).returns([0, lastBlockTimestampObserved, 0, 0]);
      });

      it('should revert if jobCooldown has not expired', async () => {
        dataFeed.lastPoolStateObserved.whenCalledWith(randomSalt).returns([1, now, 0, 0]);
        await expect(dataFeedKeeper.connect(keeper)['work(bytes32,uint8)'](randomSalt, TIME_TRIGGER)).to.be.revertedWith('NotWorkable()');
      });

      it('should call to fetch observations (having calculated secondsAgos)', async () => {
        dataFeed.fetchObservations.reset();
        await dataFeedKeeper.connect(keeper)['work(bytes32,uint8)'](randomSalt, TIME_TRIGGER);
        const secondsAgos = await dataFeedKeeper.calculateSecondsAgos(initialPeriodLength, lastBlockTimestampObserved);
        expect(dataFeed.fetchObservations).to.have.been.calledOnceWith(randomSalt, secondsAgos);
      });

      it('should call to pay the keeper', async () => {
        keep3r.worked.reset();
        await dataFeedKeeper.connect(keeper)['work(bytes32,uint8)'](randomSalt, TIME_TRIGGER);
        expect(keep3r.worked).to.have.been.calledOnceWith(keeper.address);
      });
    });

    context('when the trigger reason is TWAP', () => {
      let twapLength = 30;
      let secondsAgos = [twapLength, 0];
      let tickCumulative = 3000;
      let tickCumulativesDelta: number;
      let tickCumulatives: number[];
      let poolArithmeticMeanTick: number;
      let lastBlockTimestampObserved: number;
      let lastTickCumulativeObserved: number;
      let lastArithmeticMeanTickObserved = 200;
      let oracleDelta = 10;
      let oracleTickCumulative: number;
      let oracleTickCumulativesDelta: number;
      let oracleArithmeticMeanTick: number;
      let upperIsSurpassed = 25;
      let upperIsNotSurpassed = 50;
      let lowerIsSurpassed = 50;
      let lowerIsNotSurpassed = 25;

      beforeEach(async () => {
        await dataFeedKeeper.connect(governor).setTwapLength(twapLength);
        now = (await ethers.provider.getBlock('latest')).timestamp + 2;
      });

      // arithmeticMeanTick = tickCumulativesDelta / delta
      context('when the arithmetic mean ticks are truncated', () => {
        beforeEach(async () => {
          tickCumulativesDelta = 2000;
          tickCumulatives = [tickCumulative, tickCumulative + tickCumulativesDelta];
          poolArithmeticMeanTick = Math.trunc(tickCumulativesDelta / twapLength);
          uniswapV3Pool.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
          lastBlockTimestampObserved = now - oracleDelta;
          lastTickCumulativeObserved = 2000;
          oracleTickCumulative = lastTickCumulativeObserved + lastArithmeticMeanTickObserved * oracleDelta;
          oracleTickCumulativesDelta = oracleTickCumulative - tickCumulative;
          oracleArithmeticMeanTick = Math.trunc(oracleTickCumulativesDelta / twapLength);
          dataFeed.lastPoolStateObserved
            .whenCalledWith(randomSalt)
            .returns([0, lastBlockTimestampObserved, lastTickCumulativeObserved, lastArithmeticMeanTickObserved]);
        });

        context('when no thresholds are surpassed', () => {
          beforeEach(async () => {
            await dataFeedKeeper.connect(governor).setTwapThresholds(upperIsNotSurpassed, lowerIsNotSurpassed);
          });

          it('should revert', async () => {
            await expect(dataFeedKeeper.connect(keeper)['work(bytes32,uint8)'](randomSalt, TWAP_TRIGGER)).to.be.revertedWith('NotWorkable()');
          });
        });

        context('when a threshold is surpassed', () => {
          beforeEach(async () => {
            await dataFeedKeeper.connect(governor).setTwapThresholds(upperIsSurpassed, lowerIsNotSurpassed);
          });

          it('should call to fetch observations (having calculated secondsAgos)', async () => {
            dataFeed.fetchObservations.reset();
            await dataFeedKeeper.connect(keeper)['work(bytes32,uint8)'](randomSalt, TWAP_TRIGGER);
            const secondsAgos = await dataFeedKeeper.calculateSecondsAgos(initialPeriodLength, lastBlockTimestampObserved);
            expect(dataFeed.fetchObservations).to.have.been.calledOnceWith(randomSalt, secondsAgos);
          });

          it('should call to pay the keeper', async () => {
            keep3r.worked.reset();
            await dataFeedKeeper.connect(keeper)['work(bytes32,uint8)'](randomSalt, TWAP_TRIGGER);
            expect(keep3r.worked).to.have.been.calledOnceWith(keeper.address);
          });
        });
      });

      // arithmeticMeanTick = tickCumulativesDelta / delta
      context('when the arithmetic mean ticks are rounded to negative infinity', () => {
        beforeEach(async () => {
          tickCumulativesDelta = -2001;
          tickCumulatives = [tickCumulative, tickCumulative + tickCumulativesDelta];
          poolArithmeticMeanTick = Math.floor(tickCumulativesDelta / twapLength);
          uniswapV3Pool.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
          lastBlockTimestampObserved = now - oracleDelta;
          lastTickCumulativeObserved = -2001;
          oracleTickCumulative = lastTickCumulativeObserved + lastArithmeticMeanTickObserved * oracleDelta;
          oracleTickCumulativesDelta = oracleTickCumulative - tickCumulative;
          oracleArithmeticMeanTick = Math.floor(oracleTickCumulativesDelta / twapLength);
          dataFeed.lastPoolStateObserved
            .whenCalledWith(randomSalt)
            .returns([0, lastBlockTimestampObserved, lastTickCumulativeObserved, lastArithmeticMeanTickObserved]);
        });

        context('when no thresholds are surpassed', () => {
          beforeEach(async () => {
            await dataFeedKeeper.connect(governor).setTwapThresholds(upperIsNotSurpassed, lowerIsNotSurpassed);
          });

          it('should revert', async () => {
            await expect(dataFeedKeeper.connect(keeper)['work(bytes32,uint8)'](randomSalt, TWAP_TRIGGER)).to.be.revertedWith('NotWorkable()');
          });
        });

        context('when a threshold is surpassed', () => {
          beforeEach(async () => {
            await dataFeedKeeper.connect(governor).setTwapThresholds(upperIsNotSurpassed, lowerIsSurpassed);
          });

          it('should call to fetch observations (having calculated secondsAgos)', async () => {
            dataFeed.fetchObservations.reset();
            await dataFeedKeeper.connect(keeper)['work(bytes32,uint8)'](randomSalt, TWAP_TRIGGER);
            const secondsAgos = await dataFeedKeeper.calculateSecondsAgos(initialPeriodLength, lastBlockTimestampObserved);
            expect(dataFeed.fetchObservations).to.have.been.calledOnceWith(randomSalt, secondsAgos);
          });

          it('should call to pay the keeper', async () => {
            keep3r.worked.reset();
            await dataFeedKeeper.connect(keeper)['work(bytes32,uint8)'](randomSalt, TWAP_TRIGGER);
            expect(keep3r.worked).to.have.been.calledOnceWith(keeper.address);
          });
        });
      });
    });
  });

  describe('forceWork(...)', () => {
    let secondsAgos: number[];
    const fromTimestamp = 0;

    beforeEach(async () => {
      secondsAgos = await dataFeedKeeper.calculateSecondsAgos(initialPeriodLength, fromTimestamp);
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
    let newJobCooldown = initialJobCooldown + 1 * 60 * 60;

    onlyGovernor(
      () => dataFeedKeeper,
      'setJobCooldown',
      () => governor,
      () => [newJobCooldown]
    );

    it('should revert if jobCooldown <= periodLength', async () => {
      await expect(dataFeedKeeper.connect(governor).setJobCooldown(initialPeriodLength)).to.be.revertedWith('WrongSetting()');
      await expect(dataFeedKeeper.connect(governor).setJobCooldown(initialPeriodLength + 1)).not.to.be.reverted;
    });

    it.skip('should revert if jobCooldown >= twapLength', async () => {
      await expect(dataFeedKeeper.connect(governor).setJobCooldown(initialTwapLength)).to.be.revertedWith('WrongSetting()');
      await expect(dataFeedKeeper.connect(governor).setJobCooldown(initialTwapLength - 1)).not.to.be.reverted;
    });

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

  describe('setPeriodLength(...)', () => {
    let newPeriodLength = initialPeriodLength + 1 * 60 * 60;

    onlyGovernor(
      () => dataFeedKeeper,
      'setPeriodLength',
      () => governor,
      () => [newPeriodLength]
    );

    it('should revert if periodLength >= jobCooldown', async () => {
      await expect(dataFeedKeeper.connect(governor).setPeriodLength(initialJobCooldown)).to.be.revertedWith('WrongSetting()');
      await expect(dataFeedKeeper.connect(governor).setPeriodLength(initialJobCooldown - 1)).not.to.be.reverted;
    });

    it('should update the periodLength', async () => {
      await dataFeedKeeper.connect(governor).setPeriodLength(newPeriodLength);
      let periodLength = await dataFeedKeeper.periodLength();
      expect(periodLength).to.eq(newPeriodLength);
    });

    it('should emit PeriodLengthUpdated', async () => {
      await expect(dataFeedKeeper.connect(governor).setPeriodLength(newPeriodLength))
        .to.emit(dataFeedKeeper, 'PeriodLengthUpdated')
        .withArgs(newPeriodLength);
    });
  });

  describe('setTwapLength(...)', () => {
    let newTwapLength = initialTwapLength + 1 * 60 * 60;

    onlyGovernor(
      () => dataFeedKeeper,
      'setTwapLength',
      () => governor,
      () => [newTwapLength]
    );

    it.skip('should revert if twapLength <= jobCooldown', async () => {
      await expect(dataFeedKeeper.connect(governor).setTwapLength(initialJobCooldown)).to.be.revertedWith('WrongSetting()');
      await expect(dataFeedKeeper.connect(governor).setTwapLength(initialJobCooldown + 1)).not.to.be.reverted;
    });

    it('should update the twapLength', async () => {
      await dataFeedKeeper.connect(governor).setTwapLength(newTwapLength);
      let twapLength = await dataFeedKeeper.twapLength();
      expect(twapLength).to.eq(newTwapLength);
    });

    it('should emit TwapLengthUpdated', async () => {
      await expect(dataFeedKeeper.connect(governor).setTwapLength(newTwapLength))
        .to.emit(dataFeedKeeper, 'TwapLengthUpdated')
        .withArgs(newTwapLength);
    });
  });

  describe('setTwapThresholds(...)', () => {
    let newUpperTwapThreshold = initialUpperTwapThreshold.add(10);
    let newLowerTwapThreshold = initialLowerTwapThreshold.add(10);

    onlyGovernor(
      () => dataFeedKeeper,
      'setTwapThresholds',
      () => governor,
      () => [newUpperTwapThreshold, newLowerTwapThreshold]
    );

    it.skip('should revert if newUpperTwapThreshold < 0 || newLowerTwapThreshold > 0', async () => {
      await expect(dataFeedKeeper.connect(governor).setTwapThresholds(newLowerTwapThreshold, newUpperTwapThreshold)).to.be.revertedWith(
        'WrongSetting()'
      );
      await expect(dataFeedKeeper.connect(governor).setTwapThresholds(newUpperTwapThreshold, newLowerTwapThreshold)).not.to.be.reverted;
    });

    it('should update the upperTwapThreshold', async () => {
      await dataFeedKeeper.connect(governor).setTwapThresholds(newUpperTwapThreshold, newLowerTwapThreshold);
      let upperTwapThreshold = await dataFeedKeeper.upperTwapThreshold();
      expect(upperTwapThreshold).to.eq(newUpperTwapThreshold);
    });

    it('should update the lowerTwapThreshold', async () => {
      await dataFeedKeeper.connect(governor).setTwapThresholds(newUpperTwapThreshold, newLowerTwapThreshold);
      let lowerTwapThreshold = await dataFeedKeeper.lowerTwapThreshold();
      expect(lowerTwapThreshold).to.eq(newLowerTwapThreshold);
    });

    it('should emit TwapThresholdsUpdated', async () => {
      await expect(dataFeedKeeper.connect(governor).setTwapThresholds(newUpperTwapThreshold, newLowerTwapThreshold))
        .to.emit(dataFeedKeeper, 'TwapThresholdsUpdated')
        .withArgs(newUpperTwapThreshold, newLowerTwapThreshold);
    });
  });

  describe('workable(uint16,bytes32,uint24)', () => {
    let isWorkable: boolean;

    it('should return false if the pipeline is not whitelisted', async () => {
      dataFeed.whitelistedNonces.whenCalledWith(randomChainId, randomSalt).returns(0);
      isWorkable = await dataFeedKeeper['workable(uint16,bytes32,uint24)'](randomChainId, randomSalt, randomNonce);
      expect(isWorkable).to.eq(false);
    });

    context('when the pipeline is whitelisted', () => {
      beforeEach(async () => {
        dataFeed.whitelistedNonces.whenCalledWith(randomChainId, randomSalt).returns(randomNonce);
      });

      it('should return false if the nonce is lower than the whitelisted nonce', async () => {
        isWorkable = await dataFeedKeeper['workable(uint16,bytes32,uint24)'](randomChainId, randomSalt, randomNonce - 1);
        expect(isWorkable).to.eq(false);
      });

      context('when lastPoolNonceBridged is 0', () => {
        before(async () => {
          dataFeed.lastPoolStateObserved.whenCalledWith(randomSalt).returns([randomNonce, 0, 0, 0]);
        });

        it('should return true if the nonce equals the last pool nonce observed', async () => {
          isWorkable = await dataFeedKeeper['workable(uint16,bytes32,uint24)'](randomChainId, randomSalt, randomNonce);
          expect(isWorkable).to.eq(true);
        });

        it('should return false if the nonce is different than the last pool nonce observed', async () => {
          isWorkable = await dataFeedKeeper['workable(uint16,bytes32,uint24)'](randomChainId, randomSalt, randomNonce - 1);
          expect(isWorkable).to.eq(false);
          isWorkable = await dataFeedKeeper['workable(uint16,bytes32,uint24)'](randomChainId, randomSalt, randomNonce + 1);
          expect(isWorkable).to.eq(false);
        });
      });

      context('when lastPoolNonceBridged is not 0', () => {
        beforeEach(async () => {
          await dataFeedKeeper.setVariable('lastPoolNonceBridged', { [randomChainId]: { [randomSalt]: randomNonce - 1 } });
        });

        it('should return true if the nonce is one higher than lastPoolNonceBridged', async () => {
          isWorkable = await dataFeedKeeper['workable(uint16,bytes32,uint24)'](randomChainId, randomSalt, randomNonce);
          expect(isWorkable).to.eq(true);
        });

        it('should return false if the nonce is not one higher than lastPoolNonceBridged', async () => {
          isWorkable = await dataFeedKeeper['workable(uint16,bytes32,uint24)'](randomChainId, randomSalt, randomNonce - 1);
          expect(isWorkable).to.eq(false);
          isWorkable = await dataFeedKeeper['workable(uint16,bytes32,uint24)'](randomChainId, randomSalt, randomNonce + 1);
          expect(isWorkable).to.eq(false);
        });
      });
    });
  });

  describe('workable(bytes32)', () => {
    let now: number;
    let twapLength = 30;
    let secondsAgos = [twapLength, 0];
    let tickCumulative = 3000;
    let tickCumulativesDelta: number;
    let tickCumulatives: number[];
    let poolArithmeticMeanTick: number;
    let lastBlockTimestampObserved: number;
    let lastTickCumulativeObserved: number;
    let lastArithmeticMeanTickObserved = 200;
    let oracleDelta = 10;
    let oracleTickCumulative: number;
    let oracleTickCumulativesDelta: number;
    let oracleArithmeticMeanTick: number;
    let upperIsSurpassed = 25;
    let upperIsNotSurpassed = 50;
    let lowerIsSurpassed = 50;
    let lowerIsNotSurpassed = 25;
    let reason: number;

    it('should return NONE if the pool is not whitelisted', async () => {
      dataFeed.isWhitelistedPool.whenCalledWith(randomSalt).returns(false);
      reason = await dataFeedKeeper['workable(bytes32)'](randomSalt);
      expect(reason).to.eq(NONE_TRIGGER);
    });

    context('when the pool is whitelisted', () => {
      beforeEach(async () => {
        dataFeed.isWhitelistedPool.whenCalledWith(randomSalt).returns(true);
      });

      it('should return TIME if jobCooldown is 0', async () => {
        dataFeed.lastPoolStateObserved.whenCalledWith(randomSalt).returns([0, 0, 0, 0]);
        reason = await dataFeedKeeper['workable(bytes32)'](randomSalt);
        expect(reason).to.eq(TIME_TRIGGER);
      });

      context('when jobCooldown has expired', () => {
        beforeEach(async () => {
          now = (await ethers.provider.getBlock('latest')).timestamp;
          dataFeed.lastPoolStateObserved.whenCalledWith(randomSalt).returns([0, now - initialJobCooldown, 0, 0]);
        });

        it('should return TIME', async () => {
          reason = await dataFeedKeeper['workable(bytes32)'](randomSalt);
          expect(reason).to.eq(TIME_TRIGGER);
        });
      });

      context('when jobCooldown has not expired', () => {
        beforeEach(async () => {
          await dataFeedKeeper.connect(governor).setTwapLength(twapLength);
          now = (await ethers.provider.getBlock('latest')).timestamp + 1;
        });

        // arithmeticMeanTick = tickCumulativesDelta / delta
        context('when the arithmetic mean ticks are truncated', () => {
          beforeEach(async () => {
            tickCumulativesDelta = 2000;
            tickCumulatives = [tickCumulative, tickCumulative + tickCumulativesDelta];
            poolArithmeticMeanTick = Math.trunc(tickCumulativesDelta / twapLength);
            uniswapV3Pool.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
            lastBlockTimestampObserved = now - oracleDelta;
            lastTickCumulativeObserved = 2000;
            oracleTickCumulative = lastTickCumulativeObserved + lastArithmeticMeanTickObserved * oracleDelta;
            oracleTickCumulativesDelta = oracleTickCumulative - tickCumulative;
            oracleArithmeticMeanTick = Math.trunc(oracleTickCumulativesDelta / twapLength);
            dataFeed.lastPoolStateObserved
              .whenCalledWith(randomSalt)
              .returns([0, lastBlockTimestampObserved, lastTickCumulativeObserved, lastArithmeticMeanTickObserved]);
          });

          it('should return TWAP if only the upper threshold is surpassed', async () => {
            await dataFeedKeeper.connect(governor).setTwapThresholds(upperIsSurpassed, lowerIsNotSurpassed);

            reason = await dataFeedKeeper['workable(bytes32)'](randomSalt);
            expect(reason).to.eq(TWAP_TRIGGER);
          });

          it('should return TWAP if only the lower threshold is surpassed', async () => {
            await dataFeedKeeper.connect(governor).setTwapThresholds(upperIsNotSurpassed, lowerIsSurpassed);

            reason = await dataFeedKeeper['workable(bytes32)'](randomSalt);
            expect(reason).to.eq(TWAP_TRIGGER);
          });

          it('should return NONE if no thresholds are surpassed', async () => {
            await dataFeedKeeper.connect(governor).setTwapThresholds(upperIsNotSurpassed, lowerIsNotSurpassed);

            reason = await dataFeedKeeper['workable(bytes32)'](randomSalt);
            expect(reason).to.eq(NONE_TRIGGER);
          });
        });

        // arithmeticMeanTick = tickCumulativesDelta / delta
        context('when the arithmetic mean ticks are rounded to negative infinity', () => {
          beforeEach(async () => {
            tickCumulativesDelta = -2001;
            tickCumulatives = [tickCumulative, tickCumulative + tickCumulativesDelta];
            poolArithmeticMeanTick = Math.floor(tickCumulativesDelta / twapLength);
            uniswapV3Pool.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
            lastBlockTimestampObserved = now - oracleDelta;
            lastTickCumulativeObserved = -2001;
            oracleTickCumulative = lastTickCumulativeObserved + lastArithmeticMeanTickObserved * oracleDelta;
            oracleTickCumulativesDelta = oracleTickCumulative - tickCumulative;
            oracleArithmeticMeanTick = Math.floor(oracleTickCumulativesDelta / twapLength);
            dataFeed.lastPoolStateObserved
              .whenCalledWith(randomSalt)
              .returns([0, lastBlockTimestampObserved, lastTickCumulativeObserved, lastArithmeticMeanTickObserved]);
          });

          it('should return TWAP if only the upper threshold is surpassed', async () => {
            await dataFeedKeeper.connect(governor).setTwapThresholds(upperIsSurpassed, lowerIsNotSurpassed);

            reason = await dataFeedKeeper['workable(bytes32)'](randomSalt);
            expect(reason).to.eq(TWAP_TRIGGER);
          });

          it('should return TWAP if only the lower threshold is surpassed', async () => {
            await dataFeedKeeper.connect(governor).setTwapThresholds(upperIsNotSurpassed, lowerIsSurpassed);

            reason = await dataFeedKeeper['workable(bytes32)'](randomSalt);
            expect(reason).to.eq(TWAP_TRIGGER);
          });

          it('should return NONE if no thresholds are surpassed', async () => {
            await dataFeedKeeper.connect(governor).setTwapThresholds(upperIsNotSurpassed, lowerIsNotSurpassed);

            reason = await dataFeedKeeper['workable(bytes32)'](randomSalt);
            expect(reason).to.eq(NONE_TRIGGER);
          });
        });
      });
    });
  });

  describe('workable(bytes32,uint8)', () => {
    let now: number;
    let isWorkable: boolean;

    it('should return false if the pool is not whitelisted', async () => {
      dataFeed.isWhitelistedPool.whenCalledWith(randomSalt).returns(false);
      isWorkable = await dataFeedKeeper['workable(bytes32,uint8)'](randomSalt, TIME_TRIGGER);
      expect(isWorkable).to.eq(false);
      isWorkable = await dataFeedKeeper['workable(bytes32,uint8)'](randomSalt, TWAP_TRIGGER);
      expect(isWorkable).to.eq(false);
    });

    context('when the pool is whitelisted', () => {
      beforeEach(async () => {
        dataFeed.isWhitelistedPool.whenCalledWith(randomSalt).returns(true);
      });

      context('when the trigger reason is TIME', () => {
        beforeEach(async () => {
          now = (await ethers.provider.getBlock('latest')).timestamp;
        });

        it('should return true if jobCooldown is 0', async () => {
          dataFeed.lastPoolStateObserved.whenCalledWith(randomSalt).returns([0, 0, 0, 0]);
          isWorkable = await dataFeedKeeper['workable(bytes32,uint8)'](randomSalt, TIME_TRIGGER);
          expect(isWorkable).to.eq(true);
        });

        it('should return true if jobCooldown has expired', async () => {
          dataFeed.lastPoolStateObserved.whenCalledWith(randomSalt).returns([0, now - initialJobCooldown, 0, 0]);
          isWorkable = await dataFeedKeeper['workable(bytes32,uint8)'](randomSalt, TIME_TRIGGER);
          expect(isWorkable).to.eq(true);
        });

        it('should return false if jobCooldown has not expired', async () => {
          dataFeed.lastPoolStateObserved.whenCalledWith(randomSalt).returns([0, now - initialJobCooldown + 1, 0, 0]);
          isWorkable = await dataFeedKeeper['workable(bytes32,uint8)'](randomSalt, TIME_TRIGGER);
          expect(isWorkable).to.eq(false);
        });
      });

      context('when the trigger reason is TWAP', () => {
        let twapLength = 30;
        let secondsAgos = [twapLength, 0];
        let tickCumulative = 3000;
        let tickCumulativesDelta: number;
        let tickCumulatives: number[];
        let poolArithmeticMeanTick: number;
        let lastBlockTimestampObserved: number;
        let lastTickCumulativeObserved: number;
        let lastArithmeticMeanTickObserved = 200;
        let oracleDelta = 10;
        let oracleTickCumulative: number;
        let oracleTickCumulativesDelta: number;
        let oracleArithmeticMeanTick: number;
        let upperIsSurpassed = 25;
        let upperIsNotSurpassed = 50;
        let lowerIsSurpassed = 50;
        let lowerIsNotSurpassed = 25;

        beforeEach(async () => {
          await dataFeedKeeper.connect(governor).setTwapLength(twapLength);
          now = (await ethers.provider.getBlock('latest')).timestamp + 1;
        });

        // arithmeticMeanTick = tickCumulativesDelta / delta
        context('when the arithmetic mean ticks are truncated', () => {
          beforeEach(async () => {
            tickCumulativesDelta = 2000;
            tickCumulatives = [tickCumulative, tickCumulative + tickCumulativesDelta];
            poolArithmeticMeanTick = Math.trunc(tickCumulativesDelta / twapLength);
            uniswapV3Pool.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
            lastBlockTimestampObserved = now - oracleDelta;
            lastTickCumulativeObserved = 2000;
            oracleTickCumulative = lastTickCumulativeObserved + lastArithmeticMeanTickObserved * oracleDelta;
            oracleTickCumulativesDelta = oracleTickCumulative - tickCumulative;
            oracleArithmeticMeanTick = Math.trunc(oracleTickCumulativesDelta / twapLength);
            dataFeed.lastPoolStateObserved
              .whenCalledWith(randomSalt)
              .returns([0, lastBlockTimestampObserved, lastTickCumulativeObserved, lastArithmeticMeanTickObserved]);
          });

          it('should return true if only the upper threshold is surpassed', async () => {
            await dataFeedKeeper.connect(governor).setTwapThresholds(upperIsSurpassed, lowerIsNotSurpassed);

            isWorkable = await dataFeedKeeper['workable(bytes32,uint8)'](randomSalt, TWAP_TRIGGER);
            expect(isWorkable).to.eq(true);
          });

          it('should return true if only the lower threshold is surpassed', async () => {
            await dataFeedKeeper.connect(governor).setTwapThresholds(upperIsNotSurpassed, lowerIsSurpassed);

            isWorkable = await dataFeedKeeper['workable(bytes32,uint8)'](randomSalt, TWAP_TRIGGER);
            expect(isWorkable).to.eq(true);
          });

          it('should return false if no thresholds are surpassed', async () => {
            await dataFeedKeeper.connect(governor).setTwapThresholds(upperIsNotSurpassed, lowerIsNotSurpassed);

            isWorkable = await dataFeedKeeper['workable(bytes32,uint8)'](randomSalt, TWAP_TRIGGER);
            expect(isWorkable).to.eq(false);
          });
        });

        // arithmeticMeanTick = tickCumulativesDelta / delta
        context('when the arithmetic mean ticks are rounded to negative infinity', () => {
          beforeEach(async () => {
            tickCumulativesDelta = -2001;
            tickCumulatives = [tickCumulative, tickCumulative + tickCumulativesDelta];
            poolArithmeticMeanTick = Math.floor(tickCumulativesDelta / twapLength);
            uniswapV3Pool.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
            lastBlockTimestampObserved = now - oracleDelta;
            lastTickCumulativeObserved = -2001;
            oracleTickCumulative = lastTickCumulativeObserved + lastArithmeticMeanTickObserved * oracleDelta;
            oracleTickCumulativesDelta = oracleTickCumulative - tickCumulative;
            oracleArithmeticMeanTick = Math.floor(oracleTickCumulativesDelta / twapLength);
            dataFeed.lastPoolStateObserved
              .whenCalledWith(randomSalt)
              .returns([0, lastBlockTimestampObserved, lastTickCumulativeObserved, lastArithmeticMeanTickObserved]);
          });

          it('should return true if only the upper threshold is surpassed', async () => {
            await dataFeedKeeper.connect(governor).setTwapThresholds(upperIsSurpassed, lowerIsNotSurpassed);

            isWorkable = await dataFeedKeeper['workable(bytes32,uint8)'](randomSalt, TWAP_TRIGGER);
            expect(isWorkable).to.eq(true);
          });

          it('should return true if only the lower threshold is surpassed', async () => {
            await dataFeedKeeper.connect(governor).setTwapThresholds(upperIsNotSurpassed, lowerIsSurpassed);

            isWorkable = await dataFeedKeeper['workable(bytes32,uint8)'](randomSalt, TWAP_TRIGGER);
            expect(isWorkable).to.eq(true);
          });

          it('should return false if no thresholds are surpassed', async () => {
            await dataFeedKeeper.connect(governor).setTwapThresholds(upperIsNotSurpassed, lowerIsNotSurpassed);

            isWorkable = await dataFeedKeeper['workable(bytes32,uint8)'](randomSalt, TWAP_TRIGGER);
            expect(isWorkable).to.eq(false);
          });
        });
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
        expect(secondsAgos).to.eql([0]);
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
        periods++; // adds the bridged remainder
      });

      it('should return an array with proper length', async () => {
        const secondsAgos = await dataFeedKeeper.calculateSecondsAgos(periodLength, fromTimestamp);
        expect(secondsAgos.length).to.eq(periods);
      });

      it('should build the array of secondsAgos', async () => {
        let expectedSecondsAgos: number[] = [];

        for (let i = 0; i < periods; i++) {
          expectedSecondsAgos[i] = unknownTime - remainder - i * periodLength;
        }

        let secondsAgos = await dataFeedKeeper.calculateSecondsAgos(periodLength, fromTimestamp);
        expect(secondsAgos).to.eql(expectedSecondsAgos);
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
        expect(secondsAgos).to.eql(expectedSecondsAgos);
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
        unknownTime = now - (now - (periodLength + 1));
        periods = Math.trunc(unknownTime / periodLength);
        remainder = unknownTime % periodLength;
        periods++; // adds the bridged remainder
      });

      it('should return an array with proper length', async () => {
        const secondsAgos = await dataFeedKeeper.calculateSecondsAgos(periodLength, fromTimestamp);
        expect(secondsAgos.length).to.eq(periods);
      });

      it('should build the array of secondsAgos', async () => {
        let expectedSecondsAgos: number[] = [];

        for (let i = 0; i < periods; i++) {
          expectedSecondsAgos[i] = unknownTime - remainder - i * periodLength;
        }

        let secondsAgos = await dataFeedKeeper.calculateSecondsAgos(periodLength, fromTimestamp);
        expect(secondsAgos).to.eql(expectedSecondsAgos);
      });

      it('should have 0 as last item', async () => {
        let secondsAgos = await dataFeedKeeper.calculateSecondsAgos(periodLength, fromTimestamp);
        expect(secondsAgos[secondsAgos.length - 1]).to.eq(0);
      });
    });
  });
});
