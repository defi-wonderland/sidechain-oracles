import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { DataFeedStrategy, DataFeedStrategy__factory, IDataFeed, IUniswapV3Pool } from '@typechained';
import { smock, MockContract, MockContractFactory, FakeContract } from '@defi-wonderland/smock';
import { evm } from '@utils';
import { ZERO_ADDRESS, UNI_FACTORY, POOL_INIT_CODE_HASH, VALID_POOL_SALT } from '@utils/constants';
import { readArgFromEvent } from '@utils/event-utils';
import { onlyGovernor } from '@utils/behaviours';
import { getCreate2Address, getRandomBytes32 } from '@utils/misc';
import chai, { expect } from 'chai';

chai.use(smock.matchers);

describe('DataFeedStrategy.sol', () => {
  let governor: SignerWithAddress;
  let dataFeedStrategy: MockContract<DataFeedStrategy>;
  let dataFeedStrategyFactory: MockContractFactory<DataFeedStrategy__factory>;
  let dataFeed: FakeContract<IDataFeed>;
  let uniswapV3Pool: FakeContract<IUniswapV3Pool>;
  let snapshotId: string;

  const initialPeriodDuration = 1200;
  const initialStrategyCooldown = 3600;
  const initialDefaultTwapThreshold = 500;
  const initialTwapLength = 2400;

  const randomSalt = VALID_POOL_SALT;
  const randomSalt2 = getRandomBytes32();

  const NONE_TRIGGER = 0;
  const TIME_TRIGGER = 1;
  const TWAP_TRIGGER = 2;
  const OLD_TRIGGER = 3;

  before(async () => {
    [, governor] = await ethers.getSigners();

    dataFeed = await smock.fake('IDataFeed');

    uniswapV3Pool = await smock.fake('IUniswapV3Pool', {
      address: getCreate2Address(UNI_FACTORY, randomSalt, POOL_INIT_CODE_HASH),
    });

    dataFeedStrategyFactory = await smock.mock('DataFeedStrategy');
    dataFeedStrategy = await dataFeedStrategyFactory.deploy(governor.address, dataFeed.address, UNI_FACTORY, {
      periodDuration: initialPeriodDuration,
      strategyCooldown: initialStrategyCooldown,
      defaultTwapThreshold: initialDefaultTwapThreshold,
      twapLength: initialTwapLength,
    });

    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('constructor(...)', () => {
    it('should revert if dataFeed is set to the zero address', async () => {
      await expect(
        dataFeedStrategyFactory.deploy(governor.address, ZERO_ADDRESS, UNI_FACTORY, {
          periodDuration: initialPeriodDuration,
          strategyCooldown: initialStrategyCooldown,
          defaultTwapThreshold: initialDefaultTwapThreshold,
          twapLength: initialTwapLength,
        })
      ).to.be.revertedWith('ZeroAddress()');
    });

    it('should set the governor', async () => {
      expect(await dataFeedStrategy.governor()).to.eq(governor.address);
    });

    it('should initialize dataFeed interface', async () => {
      expect(await dataFeedStrategy.dataFeed()).to.eq(dataFeed.address);
    });

    it('should set the strategyCooldown', async () => {
      expect(await dataFeedStrategy.strategyCooldown()).to.eq(initialStrategyCooldown);
    });

    it('should set the defaultTwapThreshold', async () => {
      expect(await dataFeedStrategy.defaultTwapThreshold()).to.eq(initialDefaultTwapThreshold);
    });

    it('should set the twapLength', async () => {
      expect(await dataFeedStrategy.twapLength()).to.eq(initialTwapLength);
    });

    it('should set the periodDuration', async () => {
      expect(await dataFeedStrategy.periodDuration()).to.eq(initialPeriodDuration);
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
        const secondsAgos = await dataFeedStrategy.calculateSecondsAgos(now);
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

    context('when the trigger reason is TWAP', () => {
      let twapLength = 30;
      let periodDuration = twapLength / 2;
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
      let thresholdIsSurpassed = 25;
      let thresholdIsNotSurpassed = 50;

      beforeEach(async () => {
        await dataFeedStrategy.connect(governor).setPeriodDuration(periodDuration);
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

        context('when the pool twap threshold is set', () => {
          context('when no thresholds are surpassed', () => {
            beforeEach(async () => {
              await dataFeedStrategy.connect(governor).setTwapThreshold(randomSalt, thresholdIsNotSurpassed);
            });

            it('should revert', async () => {
              await expect(dataFeedStrategy.strategicFetchObservations(randomSalt, TWAP_TRIGGER)).to.be.revertedWith('NotStrategic()');
            });
          });

          context('when the upper threshold is surpassed', () => {
            beforeEach(async () => {
              await dataFeedStrategy.connect(governor).setTwapThreshold(randomSalt, thresholdIsSurpassed);
            });

            it('should call to fetch observations (having calculated secondsAgos)', async () => {
              dataFeed.fetchObservations.reset();
              await dataFeedStrategy.strategicFetchObservations(randomSalt, TWAP_TRIGGER);
              const fromSecondsAgo = now - lastBlockTimestampObserved;
              const secondsAgos = await dataFeedStrategy.calculateSecondsAgos(fromSecondsAgo);
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
      });

      // arithmeticMeanTick = tickCumulativesDelta / delta
      context('when the arithmetic mean ticks are rounded to negative infinity', () => {
        beforeEach(async () => {
          tickCumulativesDelta = -2001;
          tickCumulatives = [tickCumulative, tickCumulative + tickCumulativesDelta];
          poolArithmeticMeanTick = Math.floor(tickCumulativesDelta / twapLength);
          uniswapV3Pool.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
          lastBlockTimestampObserved = now - oracleDelta;
          lastTickCumulativeObserved = -201;
          oracleTickCumulative = lastTickCumulativeObserved + lastArithmeticMeanTickObserved * oracleDelta;
          oracleTickCumulativesDelta = oracleTickCumulative - tickCumulative;
          oracleArithmeticMeanTick = Math.floor(oracleTickCumulativesDelta / twapLength);
          dataFeed.lastPoolStateObserved
            .whenCalledWith(randomSalt)
            .returns([0, lastBlockTimestampObserved, lastTickCumulativeObserved, lastArithmeticMeanTickObserved]);
        });

        context('when the pool twap threshold is not set', () => {
          context('when no thresholds are surpassed', () => {
            beforeEach(async () => {
              await dataFeedStrategy.connect(governor).setDefaultTwapThreshold(thresholdIsNotSurpassed);
            });

            it('should revert', async () => {
              await expect(dataFeedStrategy.strategicFetchObservations(randomSalt, TWAP_TRIGGER)).to.be.revertedWith('NotStrategic()');
            });
          });

          context('when the lower threshold is surpassed', () => {
            beforeEach(async () => {
              await dataFeedStrategy.connect(governor).setDefaultTwapThreshold(thresholdIsSurpassed);
            });

            it('should call to fetch observations (having calculated secondsAgos)', async () => {
              dataFeed.fetchObservations.reset();
              await dataFeedStrategy.strategicFetchObservations(randomSalt, TWAP_TRIGGER);
              const fromSecondsAgo = now - lastBlockTimestampObserved;
              const secondsAgos = await dataFeedStrategy.calculateSecondsAgos(fromSecondsAgo);
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
      });
    });

    context('when the trigger reason is OLD', () => {
      let poolOldestSecondsAgo = 60;
      let poolOldestObservationTimestamp: number;

      beforeEach(async () => {
        now = (await ethers.provider.getBlock('latest')).timestamp;
        poolOldestObservationTimestamp = now - poolOldestSecondsAgo;
        uniswapV3Pool.slot0.returns([0, 0, 1, 2, 0, 0, false]);
        uniswapV3Pool.observations.whenCalledWith(0).returns([poolOldestObservationTimestamp, 0, 0, true]);
        dataFeed.lastPoolStateObserved.whenCalledWith(randomSalt).returns([0, poolOldestObservationTimestamp - 1, 0, 0]);
      });

      it('should revert if the last pool state observed is not older than the oldest observation', async () => {
        dataFeed.lastPoolStateObserved.whenCalledWith(randomSalt).returns([0, poolOldestObservationTimestamp, 0, 0]);
        await expect(dataFeedStrategy.strategicFetchObservations(randomSalt, OLD_TRIGGER)).to.be.revertedWith('NotStrategic()');
      });

      it('should call to fetch observations (having calculated secondsAgos)', async () => {
        dataFeed.fetchObservations.reset();
        await dataFeedStrategy.strategicFetchObservations(randomSalt, OLD_TRIGGER);
        const secondsAgos = await dataFeedStrategy.calculateSecondsAgos(poolOldestSecondsAgo);
        expect(dataFeed.fetchObservations).to.have.been.calledOnceWith(randomSalt, secondsAgos);
      });

      it('should emit StrategicFetch', async () => {
        const tx = await dataFeedStrategy.strategicFetchObservations(randomSalt, OLD_TRIGGER);
        let eventPoolSalt = await readArgFromEvent(tx, 'StrategicFetch', '_poolSalt');
        let eventReason = await readArgFromEvent(tx, 'StrategicFetch', '_reason');

        expect(eventPoolSalt).to.eq(randomSalt);
        expect(eventReason).to.eq(OLD_TRIGGER);
      });
    });
  });

  describe('setStrategyCooldown(...)', () => {
    let newStrategyCooldown = initialStrategyCooldown + 1000;

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

    it('should emit StrategyCooldownSet', async () => {
      await expect(dataFeedStrategy.connect(governor).setStrategyCooldown(newStrategyCooldown))
        .to.emit(dataFeedStrategy, 'StrategyCooldownSet')
        .withArgs(newStrategyCooldown);
    });
  });

  describe('setDefaultTwapThreshold(...)', () => {
    let newDefaultTwapThreshold = initialDefaultTwapThreshold + 1000;

    onlyGovernor(
      () => dataFeedStrategy,
      'setDefaultTwapThreshold',
      () => governor,
      () => [newDefaultTwapThreshold]
    );

    it('should revert if set to zero', async () => {
      await expect(dataFeedStrategy.connect(governor).setDefaultTwapThreshold(0)).to.be.revertedWith('ZeroAmount()');
    });

    it('should update the defaultTwapThreshold', async () => {
      await dataFeedStrategy.connect(governor).setDefaultTwapThreshold(newDefaultTwapThreshold);
      expect(await dataFeedStrategy.defaultTwapThreshold()).to.eq(newDefaultTwapThreshold);
    });

    it('should emit DefaultTwapThresholdSet', async () => {
      await expect(dataFeedStrategy.connect(governor).setDefaultTwapThreshold(newDefaultTwapThreshold))
        .to.emit(dataFeedStrategy, 'DefaultTwapThresholdSet')
        .withArgs(newDefaultTwapThreshold);
    });
  });

  describe('setTwapThreshold(...)', () => {
    let newTwapThreshold = initialDefaultTwapThreshold + 1000;

    onlyGovernor(
      () => dataFeedStrategy,
      'setTwapThreshold',
      () => governor,
      () => [randomSalt, newTwapThreshold]
    );

    it('should update a twapThreshold', async () => {
      await dataFeedStrategy.connect(governor).setTwapThreshold(randomSalt, newTwapThreshold);
      expect(await dataFeedStrategy.twapThreshold(randomSalt)).to.eq(newTwapThreshold);
      expect(await dataFeedStrategy.twapThreshold(randomSalt2)).to.eq(initialDefaultTwapThreshold);
    });

    it('should fallback to default if set to 0', async () => {
      await dataFeedStrategy.connect(governor).setTwapThreshold(randomSalt, newTwapThreshold);
      await dataFeedStrategy.connect(governor).setTwapThreshold(randomSalt, 0);
      expect(await dataFeedStrategy.twapThreshold(randomSalt)).to.eq(initialDefaultTwapThreshold);
    });

    it('should emit TwapThresholdSet', async () => {
      await expect(dataFeedStrategy.connect(governor).setTwapThreshold(randomSalt, newTwapThreshold))
        .to.emit(dataFeedStrategy, 'TwapThresholdSet')
        .withArgs(randomSalt, newTwapThreshold);
    });
  });

  describe('setTwapLength(...)', () => {
    let newTwapLength = initialTwapLength + 1000;

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

    it('should revert if twapLength < periodDuration', async () => {
      await expect(dataFeedStrategy.connect(governor).setTwapLength(initialPeriodDuration - 1)).to.be.revertedWith('WrongSetting()');
      await expect(dataFeedStrategy.connect(governor).setTwapLength(initialPeriodDuration)).not.to.be.reverted;
    });

    it('should update the twapLength', async () => {
      await dataFeedStrategy.connect(governor).setTwapLength(newTwapLength);
      expect(await dataFeedStrategy.twapLength()).to.eq(newTwapLength);
    });

    it('should emit TwapLengthSet', async () => {
      await expect(dataFeedStrategy.connect(governor).setTwapLength(newTwapLength))
        .to.emit(dataFeedStrategy, 'TwapLengthSet')
        .withArgs(newTwapLength);
    });
  });

  describe('setPeriodDuration(...)', () => {
    let newPeriodDuration = initialPeriodDuration + 1000;

    onlyGovernor(
      () => dataFeedStrategy,
      'setPeriodDuration',
      () => governor,
      () => [newPeriodDuration]
    );

    it('should revert if periodDuration > twapLength', async () => {
      await expect(dataFeedStrategy.connect(governor).setPeriodDuration(initialTwapLength + 1)).to.be.revertedWith('WrongSetting()');
      await expect(dataFeedStrategy.connect(governor).setPeriodDuration(initialTwapLength)).not.to.be.reverted;
    });

    it('should revert if periodDuration = 0', async () => {
      await expect(dataFeedStrategy.connect(governor).setPeriodDuration(0)).to.be.revertedWith('WrongSetting()');
    });

    it('should update the periodDuration', async () => {
      await dataFeedStrategy.connect(governor).setPeriodDuration(newPeriodDuration);
      expect(await dataFeedStrategy.periodDuration()).to.eq(newPeriodDuration);
    });

    it('should emit PeriodDurationSet', async () => {
      await expect(dataFeedStrategy.connect(governor).setPeriodDuration(newPeriodDuration))
        .to.emit(dataFeedStrategy, 'PeriodDurationSet')
        .withArgs(newPeriodDuration);
    });
  });

  describe('isStrategic(bytes32)', () => {
    let now: number;
    let twapLength = 30;
    let periodDuration = twapLength / 2;
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
    let thresholdIsSurpassed = 25;
    let thresholdIsNotSurpassed = 50;
    let reason: number;

    context('when strategyCooldown is 0', () => {
      beforeEach(async () => {
        dataFeed.lastPoolStateObserved.whenCalledWith(randomSalt).returns([0, 0, 0, 0]);
      });

      it('should return TIME', async () => {
        reason = await dataFeedStrategy['isStrategic(bytes32)'](randomSalt);
        expect(reason).to.eq(TIME_TRIGGER);
      });
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

    context('when strategyCooldown has not expired', () => {
      beforeEach(async () => {
        await dataFeedStrategy.connect(governor).setPeriodDuration(periodDuration);
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

        context('when the pool twap threshold is set', () => {
          context('when the upper threshold is surpassed', () => {
            beforeEach(async () => {
              await dataFeedStrategy.connect(governor).setTwapThreshold(randomSalt, thresholdIsSurpassed);
            });

            it('should return TWAP', async () => {
              reason = await dataFeedStrategy['isStrategic(bytes32)'](randomSalt);
              expect(reason).to.eq(TWAP_TRIGGER);
            });
          });

          context('when no thresholds are surpassed', () => {
            beforeEach(async () => {
              await dataFeedStrategy.connect(governor).setTwapThreshold(randomSalt, thresholdIsNotSurpassed);
              uniswapV3Pool.slot0.returns([0, 0, 1, 2, 0, 0, false]);
            });

            context('when the last pool state observed is older than the oldest observation', () => {
              beforeEach(async () => {
                uniswapV3Pool.observations.whenCalledWith(0).returns([lastBlockTimestampObserved + 1, 0, 0, true]);
              });

              it('should return OLD', async () => {
                reason = await dataFeedStrategy['isStrategic(bytes32)'](randomSalt);
                expect(reason).to.eq(OLD_TRIGGER);
              });
            });

            context('when the last pool state observed is not older than the oldest observation', () => {
              beforeEach(async () => {
                uniswapV3Pool.observations.whenCalledWith(0).returns([lastBlockTimestampObserved, 0, 0, true]);
              });

              it('should return NONE', async () => {
                reason = await dataFeedStrategy['isStrategic(bytes32)'](randomSalt);
                expect(reason).to.eq(NONE_TRIGGER);
              });
            });
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
          lastTickCumulativeObserved = -201;
          oracleTickCumulative = lastTickCumulativeObserved + lastArithmeticMeanTickObserved * oracleDelta;
          oracleTickCumulativesDelta = oracleTickCumulative - tickCumulative;
          oracleArithmeticMeanTick = Math.floor(oracleTickCumulativesDelta / twapLength);
          dataFeed.lastPoolStateObserved
            .whenCalledWith(randomSalt)
            .returns([0, lastBlockTimestampObserved, lastTickCumulativeObserved, lastArithmeticMeanTickObserved]);
        });

        context('when the pool twap threshold is not set', () => {
          context('when the lower threshold is surpassed', () => {
            beforeEach(async () => {
              await dataFeedStrategy.connect(governor).setDefaultTwapThreshold(thresholdIsSurpassed);
            });

            it('should return TWAP', async () => {
              reason = await dataFeedStrategy['isStrategic(bytes32)'](randomSalt);
              expect(reason).to.eq(TWAP_TRIGGER);
            });
          });

          context('when no thresholds are surpassed', () => {
            beforeEach(async () => {
              await dataFeedStrategy.connect(governor).setDefaultTwapThreshold(thresholdIsNotSurpassed);
              uniswapV3Pool.slot0.returns([0, 0, 1, 2, 0, 0, false]);
            });

            context('when the last pool state observed is older than the oldest observation', () => {
              beforeEach(async () => {
                uniswapV3Pool.observations.whenCalledWith(0).returns([lastBlockTimestampObserved + 1, 0, 0, true]);
              });

              it('should return OLD', async () => {
                reason = await dataFeedStrategy['isStrategic(bytes32)'](randomSalt);
                expect(reason).to.eq(OLD_TRIGGER);
              });
            });

            context('when the last pool state observed is not older than the oldest observation', () => {
              beforeEach(async () => {
                uniswapV3Pool.observations.whenCalledWith(0).returns([lastBlockTimestampObserved, 0, 0, true]);
              });

              it('should return NONE', async () => {
                reason = await dataFeedStrategy['isStrategic(bytes32)'](randomSalt);
                expect(reason).to.eq(NONE_TRIGGER);
              });
            });
          });
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

      context('when strategyCooldown is 0', () => {
        beforeEach(async () => {
          dataFeed.lastPoolStateObserved.whenCalledWith(randomSalt).returns([0, 0, 0, 0]);
        });

        it('should return true', async () => {
          isStrategic = await dataFeedStrategy['isStrategic(bytes32,uint8)'](randomSalt, TIME_TRIGGER);
          expect(isStrategic).to.eq(true);
        });
      });

      context('when strategyCooldown has expired', () => {
        beforeEach(async () => {
          dataFeed.lastPoolStateObserved.whenCalledWith(randomSalt).returns([0, now - initialStrategyCooldown, 0, 0]);
        });

        it('should return true', async () => {
          isStrategic = await dataFeedStrategy['isStrategic(bytes32,uint8)'](randomSalt, TIME_TRIGGER);
          expect(isStrategic).to.eq(true);
        });
      });

      context('when strategyCooldown has not expired', () => {
        beforeEach(async () => {
          dataFeed.lastPoolStateObserved.whenCalledWith(randomSalt).returns([0, now - initialStrategyCooldown + 1, 0, 0]);
        });

        it('should return false', async () => {
          isStrategic = await dataFeedStrategy['isStrategic(bytes32,uint8)'](randomSalt, TIME_TRIGGER);
          expect(isStrategic).to.eq(false);
        });
      });
    });

    context('when the trigger reason is TWAP', () => {
      let twapLength = 30;
      let periodDuration = twapLength / 2;
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
      let thresholdIsSurpassed = 25;
      let thresholdIsNotSurpassed = 50;

      beforeEach(async () => {
        await dataFeedStrategy.connect(governor).setPeriodDuration(periodDuration);
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

        context('when the pool twap threshold is set', () => {
          context('when the upper threshold is surpassed', () => {
            beforeEach(async () => {
              await dataFeedStrategy.connect(governor).setTwapThreshold(randomSalt, thresholdIsSurpassed);
            });

            it('should return true', async () => {
              isStrategic = await dataFeedStrategy['isStrategic(bytes32,uint8)'](randomSalt, TWAP_TRIGGER);
              expect(isStrategic).to.eq(true);
            });
          });

          context('when no thresholds are surpassed', () => {
            beforeEach(async () => {
              await dataFeedStrategy.connect(governor).setTwapThreshold(randomSalt, thresholdIsNotSurpassed);
            });

            it('should return false', async () => {
              isStrategic = await dataFeedStrategy['isStrategic(bytes32,uint8)'](randomSalt, TWAP_TRIGGER);
              expect(isStrategic).to.eq(false);
            });
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
          lastTickCumulativeObserved = -201;
          oracleTickCumulative = lastTickCumulativeObserved + lastArithmeticMeanTickObserved * oracleDelta;
          oracleTickCumulativesDelta = oracleTickCumulative - tickCumulative;
          oracleArithmeticMeanTick = Math.floor(oracleTickCumulativesDelta / twapLength);
          dataFeed.lastPoolStateObserved
            .whenCalledWith(randomSalt)
            .returns([0, lastBlockTimestampObserved, lastTickCumulativeObserved, lastArithmeticMeanTickObserved]);
        });

        context('when the pool twap threshold is not set', () => {
          context('when the lower threshold is surpassed', () => {
            beforeEach(async () => {
              await dataFeedStrategy.connect(governor).setDefaultTwapThreshold(thresholdIsSurpassed);
            });

            it('should return true', async () => {
              isStrategic = await dataFeedStrategy['isStrategic(bytes32,uint8)'](randomSalt, TWAP_TRIGGER);
              expect(isStrategic).to.eq(true);
            });
          });

          context('when no thresholds are surpassed', () => {
            beforeEach(async () => {
              await dataFeedStrategy.connect(governor).setDefaultTwapThreshold(thresholdIsNotSurpassed);
            });

            it('should return false', async () => {
              isStrategic = await dataFeedStrategy['isStrategic(bytes32,uint8)'](randomSalt, TWAP_TRIGGER);
              expect(isStrategic).to.eq(false);
            });
          });
        });
      });
    });

    context('when the trigger reason is OLD', () => {
      let poolOldestSecondsAgo = 60;
      let poolOldestObservationTimestamp: number;

      beforeEach(async () => {
        now = (await ethers.provider.getBlock('latest')).timestamp;
        poolOldestObservationTimestamp = now - poolOldestSecondsAgo;
        uniswapV3Pool.slot0.returns([0, 0, 1, 2, 0, 0, false]);
        uniswapV3Pool.observations.whenCalledWith(0).returns([poolOldestObservationTimestamp, 0, 0, true]);
      });

      context('when the last pool state observed is older than the oldest observation', () => {
        beforeEach(async () => {
          dataFeed.lastPoolStateObserved.whenCalledWith(randomSalt).returns([0, poolOldestObservationTimestamp - 1, 0, 0]);
        });

        it('should return true', async () => {
          isStrategic = await dataFeedStrategy['isStrategic(bytes32,uint8)'](randomSalt, OLD_TRIGGER);
          expect(isStrategic).to.eq(true);
        });
      });

      context('when the last pool state observed is not older than the oldest observation', () => {
        beforeEach(async () => {
          dataFeed.lastPoolStateObserved.whenCalledWith(randomSalt).returns([0, poolOldestObservationTimestamp, 0, 0]);
        });

        it('should return false', async () => {
          isStrategic = await dataFeedStrategy['isStrategic(bytes32,uint8)'](randomSalt, OLD_TRIGGER);
          expect(isStrategic).to.eq(false);
        });
      });
    });
  });

  describe('calculateSecondsAgos(...)', () => {
    let fromSecondsAgo: number;
    let totalPeriods: number;
    let periods: number;
    let remainder: number;
    const maxPeriods = Math.trunc(initialStrategyCooldown / initialPeriodDuration);

    context('when less than a period has passed', () => {
      beforeEach(async () => {
        fromSecondsAgo = initialPeriodDuration / 2;
      });

      it('should return a single datapoint array with 0', async () => {
        const secondsAgos = await dataFeedStrategy.calculateSecondsAgos(fromSecondsAgo);
        expect(secondsAgos).to.eql([0]);
      });
    });

    context('when more than a period has passed', () => {
      context('when the amount of periods to bridge is not above the maximum', () => {
        beforeEach(async () => {
          fromSecondsAgo = Math.round(initialPeriodDuration * (maxPeriods + 0.14));
          periods = Math.trunc(fromSecondsAgo / initialPeriodDuration);
          remainder = fromSecondsAgo % initialPeriodDuration;
          periods++; // adds the bridged remainder
        });

        it('should return an array with proper length', async () => {
          const secondsAgos = await dataFeedStrategy.calculateSecondsAgos(fromSecondsAgo);
          expect(secondsAgos.length).to.eq(periods);
        });

        it('should build the array of secondsAgos', async () => {
          let expectedSecondsAgos: number[] = [];

          for (let i = 0; i < periods; i++) {
            expectedSecondsAgos[i] = fromSecondsAgo - remainder - i * initialPeriodDuration;
          }

          const secondsAgos = await dataFeedStrategy.calculateSecondsAgos(fromSecondsAgo);
          expect(secondsAgos).to.eql(expectedSecondsAgos);
        });

        it('should have 0 as last item', async () => {
          const secondsAgos = await dataFeedStrategy.calculateSecondsAgos(fromSecondsAgo);
          expect(secondsAgos[secondsAgos.length - 1]).to.eq(0);
        });
      });

      context('when the amount of periods to bridge is above the maximum', () => {
        beforeEach(async () => {
          fromSecondsAgo = Math.round(initialPeriodDuration * (maxPeriods + 3.14));
          totalPeriods = Math.trunc(fromSecondsAgo / initialPeriodDuration);
          periods = maxPeriods;
          remainder = (fromSecondsAgo % initialPeriodDuration) + (totalPeriods - maxPeriods) * initialPeriodDuration;
          periods++; // adds the bridged remainder
        });

        it('should return an array with proper length', async () => {
          const secondsAgos = await dataFeedStrategy.calculateSecondsAgos(fromSecondsAgo);
          expect(secondsAgos.length).to.eq(periods);
        });

        it('should build the array of secondsAgos', async () => {
          let expectedSecondsAgos: number[] = [];

          for (let i = 0; i < periods; i++) {
            expectedSecondsAgos[i] = fromSecondsAgo - remainder - i * initialPeriodDuration;
          }

          const secondsAgos = await dataFeedStrategy.calculateSecondsAgos(fromSecondsAgo);
          expect(secondsAgos).to.eql(expectedSecondsAgos);
        });

        it('should have 0 as last item', async () => {
          const secondsAgos = await dataFeedStrategy.calculateSecondsAgos(fromSecondsAgo);
          expect(secondsAgos[secondsAgos.length - 1]).to.eq(0);
        });
      });
    });

    context('when exactly n periods have passed', () => {
      context('when the amount of periods to bridge is not above the maximum', () => {
        beforeEach(async () => {
          fromSecondsAgo = initialPeriodDuration * maxPeriods;
          periods = Math.trunc(fromSecondsAgo / initialPeriodDuration);
        });

        it('should return an array with proper length', async () => {
          const secondsAgos = await dataFeedStrategy.calculateSecondsAgos(fromSecondsAgo);
          expect(secondsAgos.length).to.eq(periods);
        });

        it('should build the array of secondsAgos', async () => {
          let expectedSecondsAgos: number[] = [];

          for (let i = 0; i < periods; i++) {
            expectedSecondsAgos[i] = fromSecondsAgo - (i + 1) * initialPeriodDuration;
          }

          const secondsAgos = await dataFeedStrategy.calculateSecondsAgos(fromSecondsAgo);
          expect(secondsAgos).to.eql(expectedSecondsAgos);
        });

        it('should have 0 as last item', async () => {
          const secondsAgos = await dataFeedStrategy.calculateSecondsAgos(fromSecondsAgo);
          expect(secondsAgos[secondsAgos.length - 1]).to.eq(0);
        });
      });

      context('when the amount of periods to bridge is above the maximum', () => {
        beforeEach(async () => {
          fromSecondsAgo = initialPeriodDuration * (maxPeriods + 3);
          totalPeriods = Math.trunc(fromSecondsAgo / initialPeriodDuration);
          periods = maxPeriods;
          remainder = (totalPeriods - maxPeriods) * initialPeriodDuration;
          periods++; // adds the bridged remainder
        });

        it('should return an array with proper length', async () => {
          const secondsAgos = await dataFeedStrategy.calculateSecondsAgos(fromSecondsAgo);
          expect(secondsAgos.length).to.eq(periods);
        });

        it('should build the array of secondsAgos', async () => {
          let expectedSecondsAgos: number[] = [];

          for (let i = 0; i < periods; i++) {
            expectedSecondsAgos[i] = fromSecondsAgo - remainder - i * initialPeriodDuration;
          }

          const secondsAgos = await dataFeedStrategy.calculateSecondsAgos(fromSecondsAgo);
          expect(secondsAgos).to.eql(expectedSecondsAgos);
        });

        it('should have 0 as last item', async () => {
          const secondsAgos = await dataFeedStrategy.calculateSecondsAgos(fromSecondsAgo);
          expect(secondsAgos[secondsAgos.length - 1]).to.eq(0);
        });
      });
    });

    context('when fromSecondsAgo is the block timestamp', () => {
      beforeEach(async () => {
        fromSecondsAgo = (await ethers.provider.getBlock('latest')).timestamp;
      });

      it('should return an array with proper length', async () => {
        const secondsAgos = await dataFeedStrategy.calculateSecondsAgos(fromSecondsAgo);
        expect(secondsAgos.length).to.eq(2);
      });

      it('should build the array of secondsAgos', async () => {
        let expectedSecondsAgos = [initialPeriodDuration, 0];

        const secondsAgos = await dataFeedStrategy.calculateSecondsAgos(fromSecondsAgo);
        expect(secondsAgos).to.eql(expectedSecondsAgos);
      });

      it('should have 0 as last item', async () => {
        const secondsAgos = await dataFeedStrategy.calculateSecondsAgos(fromSecondsAgo);
        expect(secondsAgos[secondsAgos.length - 1]).to.eq(0);
      });
    });
  });
});
