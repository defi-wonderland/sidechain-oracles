import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { DataFeedStrategy, DataFeedStrategy__factory, IDataFeed, IUniswapV3Pool } from '@typechained';
import { smock, MockContract, MockContractFactory, FakeContract } from '@defi-wonderland/smock';
import { evm, wallet } from '@utils';
import { UNI_FACTORY, POOL_INIT_CODE_HASH, VALID_POOL_SALT } from '@utils/constants';
import { toBN } from '@utils/bn';
import { onlyGovernor } from '@utils/behaviours';
import { getCreate2Address } from '@utils/misc';
import chai, { expect } from 'chai';
import { readArgFromEvent } from '@utils/event-utils';

chai.use(smock.matchers);

describe('DataFeedStrategy.sol', () => {
  let governor: SignerWithAddress;
  let dataFeedStrategy: MockContract<DataFeedStrategy>;
  let dataFeedStrategyFactory: MockContractFactory<DataFeedStrategy__factory>;
  let dataFeed: FakeContract<IDataFeed>;
  let uniswapV3Pool: FakeContract<IUniswapV3Pool>;
  let snapshotId: string;

  const initialStrategyCooldown = 4 * 60 * 60;
  const initialPeriodLength = 1 * 60 * 60;
  const initialTwapLength = 4 * 60 * 60;
  const initialUpperTwapThreshold = toBN(953); // log_{1.0001}(1.1) = log(1.1)/log(1.0001) = 953 ===> (+10 %)
  const initialLowerTwapThreshold = toBN(-1053); // log_{1.0001}(0.9) = log(0.9)/log(1.0001) = -1053 ===> (-10 %)

  const randomSalt = VALID_POOL_SALT;

  const NONE_TRIGGER = 0;
  const TIME_TRIGGER = 1;
  const TWAP_TRIGGER = 2;

  before(async () => {
    [, governor] = await ethers.getSigners();

    dataFeed = await smock.fake('IDataFeed');

    uniswapV3Pool = await smock.fake('IUniswapV3Pool', {
      address: getCreate2Address(UNI_FACTORY, randomSalt, POOL_INIT_CODE_HASH),
    });

    dataFeedStrategyFactory = await smock.mock('DataFeedStrategy');
    dataFeedStrategy = await dataFeedStrategyFactory.deploy(governor.address, dataFeed.address, {
      cooldown: initialStrategyCooldown,
      periodLength: initialPeriodLength,
      twapLength: initialTwapLength,
      upperTwapThreshold: initialUpperTwapThreshold,
      lowerTwapThreshold: initialLowerTwapThreshold,
    });

    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('constructor(...)', () => {
    it('should set the governor', async () => {
      expect(await dataFeedStrategy.governor()).to.eq(governor.address);
    });

    it('should initialize dataFeed interface', async () => {
      expect(await dataFeedStrategy.dataFeed()).to.eq(dataFeed.address);
    });

    it('should set the strategyCooldown', async () => {
      expect(await dataFeedStrategy.strategyCooldown()).to.eq(initialStrategyCooldown);
    });

    it('should set the periodLength', async () => {
      expect(await dataFeedStrategy.periodLength()).to.eq(initialPeriodLength);
    });
  });

  describe('strategicFetchObservations(...)', () => {
    let now: number;

    context('when the trigger reason is TIME', () => {
      const lastBlockTimestampObserved = 0;

      beforeEach(async () => {
        now = (await ethers.provider.getBlock('latest')).timestamp + 1;
        dataFeed.lastPoolStateObserved.whenCalledWith(randomSalt).returns([0, lastBlockTimestampObserved, 0, 0]);
      });

      it('should revert if strategyCooldown has not expired', async () => {
        dataFeed.lastPoolStateObserved.whenCalledWith(randomSalt).returns([1, now, 0, 0]);
        await expect(dataFeedStrategy.strategicFetchObservations(randomSalt, TIME_TRIGGER)).to.be.revertedWith('NotStrategic()');
      });

      it('should call to fetch observations (having calculated secondsAgos)', async () => {
        dataFeed.fetchObservations.reset();
        await dataFeedStrategy.strategicFetchObservations(randomSalt, TIME_TRIGGER);
        const secondsAgos = await dataFeedStrategy.calculateSecondsAgos(initialPeriodLength, lastBlockTimestampObserved);
        expect(dataFeed.fetchObservations).to.have.been.calledOnceWith(randomSalt, secondsAgos);
      });

      it('should emit StrategicFetch', async () => {
        const tx = await dataFeedStrategy.strategicFetchObservations(randomSalt, TIME_TRIGGER);
        let eventPoolSalt = await readArgFromEvent(tx, 'StrategicFetch', '_poolSalt');
        let eventReason = await readArgFromEvent(tx, 'StrategicFetch', '_reason');

        expect(eventPoolSalt).to.eq(randomSalt);
        expect(eventReason).to.eq(TIME_TRIGGER);
      });
    });

    context.skip('when the trigger reason is TWAP', () => {
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
        await dataFeedStrategy.connect(governor).setTwapLength(twapLength);
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
            await dataFeedStrategy.connect(governor).setTwapThresholds(upperIsNotSurpassed, lowerIsNotSurpassed);
          });

          it('should revert', async () => {
            await expect(dataFeedStrategy.strategicFetchObservations(randomSalt, TWAP_TRIGGER)).to.be.revertedWith('NotStrategic()');
          });
        });

        context('when a threshold is surpassed', () => {
          beforeEach(async () => {
            await dataFeedStrategy.connect(governor).setTwapThresholds(upperIsSurpassed, lowerIsNotSurpassed);
          });

          it('should call to fetch observations (having calculated secondsAgos)', async () => {
            dataFeed.fetchObservations.reset();
            await dataFeedStrategy.strategicFetchObservations(randomSalt, TWAP_TRIGGER);
            const secondsAgos = await dataFeedStrategy.calculateSecondsAgos(initialPeriodLength, lastBlockTimestampObserved);
            expect(dataFeed.fetchObservations).to.have.been.calledOnceWith(randomSalt, secondsAgos);
          });

          it('should emit StrategicFetch', async () => {
            const tx = await dataFeedStrategy.strategicFetchObservations(randomSalt, TWAP_TRIGGER);
            let eventPoolSalt = await readArgFromEvent(tx, 'StrategicFetch', '_poolSalt');
            let eventReason = await readArgFromEvent(tx, 'StrategicFetch', '_reason');

            expect(eventPoolSalt).to.eq(randomSalt);
            expect(eventReason).to.eq(TWAP_TRIGGER);
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
            await dataFeedStrategy.connect(governor).setTwapThresholds(upperIsNotSurpassed, lowerIsNotSurpassed);
          });

          it('should revert', async () => {
            await expect(dataFeedStrategy.strategicFetchObservations(randomSalt, TWAP_TRIGGER)).to.be.revertedWith('NotStrategic()');
          });
        });

        context('when a threshold is surpassed', () => {
          beforeEach(async () => {
            await dataFeedStrategy.connect(governor).setTwapThresholds(upperIsNotSurpassed, lowerIsSurpassed);
          });

          it('should call to fetch observations (having calculated secondsAgos)', async () => {
            dataFeed.fetchObservations.reset();
            await dataFeedStrategy.strategicFetchObservations(randomSalt, TWAP_TRIGGER);
            const secondsAgos = await dataFeedStrategy.calculateSecondsAgos(initialPeriodLength, lastBlockTimestampObserved);
            expect(dataFeed.fetchObservations).to.have.been.calledOnceWith(randomSalt, secondsAgos);
          });
        });
      });
    });
  });

  describe('forceFetchObservations(...)', () => {
    let secondsAgos: number[];
    const fromTimestamp = 0;

    beforeEach(async () => {
      secondsAgos = await dataFeedStrategy.calculateSecondsAgos(initialPeriodLength, fromTimestamp);
    });

    onlyGovernor(
      () => dataFeedStrategy,
      'forceFetchObservations',
      () => governor,
      () => [randomSalt, fromTimestamp]
    );

    it('should call to fetch observations (having calculated secondsAgos)', async () => {
      dataFeed.fetchObservations.reset();
      await dataFeedStrategy.connect(governor).forceFetchObservations(randomSalt, fromTimestamp);
      expect(dataFeed.fetchObservations).to.have.been.calledOnceWith(randomSalt, secondsAgos);
    });
  });

  describe('setStrategyCooldown(...)', () => {
    let newStrategyCooldown = initialStrategyCooldown + 1 * 60 * 60;

    onlyGovernor(
      () => dataFeedStrategy,
      'setStrategyCooldown',
      () => governor,
      () => [newStrategyCooldown]
    );

    it('should revert if strategyCooldown < twapLength', async () => {
      await expect(dataFeedStrategy.connect(governor).setStrategyCooldown(initialTwapLength - 1)).to.be.revertedWith('WrongSetting()');
      await expect(dataFeedStrategy.connect(governor).setStrategyCooldown(initialTwapLength)).not.to.be.reverted;
    });

    it('should update the strategyCooldown', async () => {
      await dataFeedStrategy.connect(governor).setStrategyCooldown(newStrategyCooldown);
      expect(await dataFeedStrategy.strategyCooldown()).to.eq(newStrategyCooldown);
    });

    it('should emit StrategyCooldownUpdated', async () => {
      await expect(dataFeedStrategy.connect(governor).setStrategyCooldown(newStrategyCooldown))
        .to.emit(dataFeedStrategy, 'StrategyCooldownUpdated')
        .withArgs(newStrategyCooldown);
    });
  });

  describe('setPeriodLength(...)', () => {
    let newPeriodLength = initialPeriodLength + 1 * 60 * 60;

    onlyGovernor(
      () => dataFeedStrategy,
      'setPeriodLength',
      () => governor,
      () => [newPeriodLength]
    );

    it('should revert if periodLength > twapLength', async () => {
      await expect(dataFeedStrategy.connect(governor).setPeriodLength(initialTwapLength + 1)).to.be.revertedWith('WrongSetting()');
      await expect(dataFeedStrategy.connect(governor).setPeriodLength(initialTwapLength)).not.to.be.reverted;
    });

    it('should update the periodLength', async () => {
      await dataFeedStrategy.connect(governor).setPeriodLength(newPeriodLength);
      expect(await dataFeedStrategy.periodLength()).to.eq(newPeriodLength);
    });

    it('should emit PeriodLengthUpdated', async () => {
      await expect(dataFeedStrategy.connect(governor).setPeriodLength(newPeriodLength))
        .to.emit(dataFeedStrategy, 'PeriodLengthUpdated')
        .withArgs(newPeriodLength);
    });
  });

  describe('setTwapLength(...)', () => {
    let newTwapLength = 5_000;

    onlyGovernor(
      () => dataFeedStrategy,
      'setTwapLength',
      () => governor,
      () => [newTwapLength]
    );

    it('should revert if twapLength > strategyCooldown', async () => {
      await expect(dataFeedStrategy.connect(governor).setTwapLength(initialStrategyCooldown + 1)).to.be.revertedWith('WrongSetting()');
      await expect(dataFeedStrategy.connect(governor).setTwapLength(initialStrategyCooldown)).not.to.be.reverted;
    });

    it('should revert if twapLength < periodLength', async () => {
      await expect(dataFeedStrategy.connect(governor).setTwapLength(initialPeriodLength - 1)).to.be.revertedWith('WrongSetting()');
      await expect(dataFeedStrategy.connect(governor).setTwapLength(initialPeriodLength)).not.to.be.reverted;
    });

    it('should update the twapLength', async () => {
      await dataFeedStrategy.connect(governor).setTwapLength(newTwapLength);
      expect(await dataFeedStrategy.twapLength()).to.eq(newTwapLength);
    });

    it('should emit TwapLengthUpdated', async () => {
      await expect(dataFeedStrategy.connect(governor).setTwapLength(newTwapLength))
        .to.emit(dataFeedStrategy, 'TwapLengthUpdated')
        .withArgs(newTwapLength);
    });
  });

  describe('setTwapThresholds(...)', () => {
    let newUpperTwapThreshold = initialUpperTwapThreshold.add(10);
    let newLowerTwapThreshold = initialLowerTwapThreshold.add(10);

    onlyGovernor(
      () => dataFeedStrategy,
      'setTwapThresholds',
      () => governor,
      () => [newUpperTwapThreshold, newLowerTwapThreshold]
    );

    it.skip('should revert if newUpperTwapThreshold < 0 || newLowerTwapThreshold > 0', async () => {
      await expect(dataFeedStrategy.connect(governor).setTwapThresholds(newLowerTwapThreshold, newUpperTwapThreshold)).to.be.revertedWith(
        'WrongSetting()'
      );
      await expect(dataFeedStrategy.connect(governor).setTwapThresholds(newUpperTwapThreshold, newLowerTwapThreshold)).not.to.be.reverted;
    });

    it('should update the upperTwapThreshold', async () => {
      await dataFeedStrategy.connect(governor).setTwapThresholds(newUpperTwapThreshold, newLowerTwapThreshold);
      expect(await dataFeedStrategy.upperTwapThreshold()).to.eq(newUpperTwapThreshold);
    });

    it('should update the lowerTwapThreshold', async () => {
      await dataFeedStrategy.connect(governor).setTwapThresholds(newUpperTwapThreshold, newLowerTwapThreshold);
      expect(await dataFeedStrategy.lowerTwapThreshold()).to.eq(newLowerTwapThreshold);
    });

    it('should emit TwapThresholdsUpdated', async () => {
      await expect(dataFeedStrategy.connect(governor).setTwapThresholds(newUpperTwapThreshold, newLowerTwapThreshold))
        .to.emit(dataFeedStrategy, 'TwapThresholdsUpdated')
        .withArgs(newUpperTwapThreshold, newLowerTwapThreshold);
    });
  });

  describe('isStrategic(bytes32)', () => {
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

    it('should return TIME if strategyCooldown is 0', async () => {
      dataFeed.lastPoolStateObserved.whenCalledWith(randomSalt).returns([0, 0, 0, 0]);
      reason = await dataFeedStrategy['isStrategic(bytes32)'](randomSalt);
      expect(reason).to.eq(TIME_TRIGGER);
    });

    context('when strategyCooldown has expired', () => {
      beforeEach(async () => {
        now = (await ethers.provider.getBlock('latest')).timestamp;
        dataFeed.lastPoolStateObserved.whenCalledWith(randomSalt).returns([0, now - initialStrategyCooldown, 0, 0]);
      });

      it('should return TIME', async () => {
        reason = await dataFeedStrategy['isStrategic(bytes32)'](randomSalt);
        expect(reason).to.eq(TIME_TRIGGER);
      });
    });

    context.skip('when strategyCooldown has not expired', () => {
      beforeEach(async () => {
        await dataFeedStrategy.connect(governor).setTwapLength(twapLength);
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
          await dataFeedStrategy.connect(governor).setTwapThresholds(upperIsSurpassed, lowerIsNotSurpassed);

          reason = await dataFeedStrategy['isStrategic(bytes32)'](randomSalt);
          expect(reason).to.eq(TWAP_TRIGGER);
        });

        it('should return TWAP if only the lower threshold is surpassed', async () => {
          await dataFeedStrategy.connect(governor).setTwapThresholds(upperIsNotSurpassed, lowerIsSurpassed);

          reason = await dataFeedStrategy['isStrategic(bytes32)'](randomSalt);
          expect(reason).to.eq(TWAP_TRIGGER);
        });

        it('should return NONE if no thresholds are surpassed', async () => {
          await dataFeedStrategy.connect(governor).setTwapThresholds(upperIsNotSurpassed, lowerIsNotSurpassed);

          reason = await dataFeedStrategy['isStrategic(bytes32)'](randomSalt);
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
          await dataFeedStrategy.connect(governor).setTwapThresholds(upperIsSurpassed, lowerIsNotSurpassed);

          reason = await dataFeedStrategy['isStrategic(bytes32)'](randomSalt);
          expect(reason).to.eq(TWAP_TRIGGER);
        });

        it('should return TWAP if only the lower threshold is surpassed', async () => {
          await dataFeedStrategy.connect(governor).setTwapThresholds(upperIsNotSurpassed, lowerIsSurpassed);

          reason = await dataFeedStrategy['isStrategic(bytes32)'](randomSalt);
          expect(reason).to.eq(TWAP_TRIGGER);
        });

        it('should return NONE if no thresholds are surpassed', async () => {
          await dataFeedStrategy.connect(governor).setTwapThresholds(upperIsNotSurpassed, lowerIsNotSurpassed);

          reason = await dataFeedStrategy['isStrategic(bytes32)'](randomSalt);
          expect(reason).to.eq(NONE_TRIGGER);
        });
      });
    });
  });

  describe('isStrategic(bytes32,uint8)', () => {
    let now: number;
    let isStrategic: boolean;

    context('when the trigger reason is TIME', () => {
      beforeEach(async () => {
        now = (await ethers.provider.getBlock('latest')).timestamp;
      });

      it('should return true if strategyCooldown is 0', async () => {
        dataFeed.lastPoolStateObserved.whenCalledWith(randomSalt).returns([0, 0, 0, 0]);
        isStrategic = await dataFeedStrategy['isStrategic(bytes32,uint8)'](randomSalt, TIME_TRIGGER);
        expect(isStrategic).to.eq(true);
      });

      it('should return true if strategyCooldown has expired', async () => {
        dataFeed.lastPoolStateObserved.whenCalledWith(randomSalt).returns([0, now - initialStrategyCooldown, 0, 0]);
        isStrategic = await dataFeedStrategy['isStrategic(bytes32,uint8)'](randomSalt, TIME_TRIGGER);
        expect(isStrategic).to.eq(true);
      });

      it('should return false if strategyCooldown has not expired', async () => {
        dataFeed.lastPoolStateObserved.whenCalledWith(randomSalt).returns([0, now - initialStrategyCooldown + 1, 0, 0]);
        isStrategic = await dataFeedStrategy['isStrategic(bytes32,uint8)'](randomSalt, TIME_TRIGGER);
        expect(isStrategic).to.eq(false);
      });
    });

    context.skip('when the trigger reason is TWAP', () => {
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
        await dataFeedStrategy.connect(governor).setTwapLength(twapLength);
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
          await dataFeedStrategy.connect(governor).setTwapThresholds(upperIsSurpassed, lowerIsNotSurpassed);

          isStrategic = await dataFeedStrategy['isStrategic(bytes32,uint8)'](randomSalt, TWAP_TRIGGER);
          expect(isStrategic).to.eq(true);
        });

        it('should return true if only the lower threshold is surpassed', async () => {
          await dataFeedStrategy.connect(governor).setTwapThresholds(upperIsNotSurpassed, lowerIsSurpassed);

          isStrategic = await dataFeedStrategy['isStrategic(bytes32,uint8)'](randomSalt, TWAP_TRIGGER);
          expect(isStrategic).to.eq(true);
        });

        it('should return false if no thresholds are surpassed', async () => {
          await dataFeedStrategy.connect(governor).setTwapThresholds(upperIsNotSurpassed, lowerIsNotSurpassed);

          isStrategic = await dataFeedStrategy['isStrategic(bytes32,uint8)'](randomSalt, TWAP_TRIGGER);
          expect(isStrategic).to.eq(false);
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
          await dataFeedStrategy.connect(governor).setTwapThresholds(upperIsSurpassed, lowerIsNotSurpassed);

          isStrategic = await dataFeedStrategy['isStrategic(bytes32,uint8)'](randomSalt, TWAP_TRIGGER);
          expect(isStrategic).to.eq(true);
        });

        it('should return true if only the lower threshold is surpassed', async () => {
          await dataFeedStrategy.connect(governor).setTwapThresholds(upperIsNotSurpassed, lowerIsSurpassed);

          isStrategic = await dataFeedStrategy['isStrategic(bytes32,uint8)'](randomSalt, TWAP_TRIGGER);
          expect(isStrategic).to.eq(true);
        });

        it('should return false if no thresholds are surpassed', async () => {
          await dataFeedStrategy.connect(governor).setTwapThresholds(upperIsNotSurpassed, lowerIsNotSurpassed);

          isStrategic = await dataFeedStrategy['isStrategic(bytes32,uint8)'](randomSalt, TWAP_TRIGGER);
          expect(isStrategic).to.eq(false);
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
        const secondsAgos = await dataFeedStrategy.calculateSecondsAgos(periodLength, fromTimestamp);
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
        const secondsAgos = await dataFeedStrategy.calculateSecondsAgos(periodLength, fromTimestamp);
        expect(secondsAgos.length).to.eq(periods);
      });

      it('should build the array of secondsAgos', async () => {
        let expectedSecondsAgos: number[] = [];

        for (let i = 0; i < periods; i++) {
          expectedSecondsAgos[i] = unknownTime - remainder - i * periodLength;
        }

        const secondsAgos = await dataFeedStrategy.calculateSecondsAgos(periodLength, fromTimestamp);
        expect(secondsAgos).to.eql(expectedSecondsAgos);
      });

      it('should have 0 as last item', async () => {
        const secondsAgos = await dataFeedStrategy.calculateSecondsAgos(periodLength, fromTimestamp);
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
        const secondsAgos = await dataFeedStrategy.calculateSecondsAgos(periodLength, fromTimestamp);
        expect(secondsAgos.length).to.eq(periods);
      });

      it('should build the array of secondsAgos', async () => {
        let expectedSecondsAgos: number[] = [];

        for (let i = 0; i < periods; i++) {
          expectedSecondsAgos[i] = unknownTime - (i + 1) * periodLength;
        }

        const secondsAgos = await dataFeedStrategy.calculateSecondsAgos(periodLength, fromTimestamp);
        expect(secondsAgos).to.eql(expectedSecondsAgos);
      });

      it('should have 0 as last item', async () => {
        const secondsAgos = await dataFeedStrategy.calculateSecondsAgos(periodLength, fromTimestamp);
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
        const secondsAgos = await dataFeedStrategy.calculateSecondsAgos(periodLength, fromTimestamp);
        expect(secondsAgos.length).to.eq(periods);
      });

      it('should build the array of secondsAgos', async () => {
        let expectedSecondsAgos: number[] = [];

        for (let i = 0; i < periods; i++) {
          expectedSecondsAgos[i] = unknownTime - remainder - i * periodLength;
        }

        const secondsAgos = await dataFeedStrategy.calculateSecondsAgos(periodLength, fromTimestamp);
        expect(secondsAgos).to.eql(expectedSecondsAgos);
      });

      it('should have 0 as last item', async () => {
        const secondsAgos = await dataFeedStrategy.calculateSecondsAgos(periodLength, fromTimestamp);
        expect(secondsAgos[secondsAgos.length - 1]).to.eq(0);
      });
    });
  });
});
