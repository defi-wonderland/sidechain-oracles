import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { OracleSidechain, OracleSidechain__factory } from '@typechained';
import { smock, MockContract, MockContractFactory } from '@defi-wonderland/smock';
import { evm } from '@utils';
import { toBN } from '@utils/bn';
import chai, { expect } from 'chai';
import { onlyDataReceiver } from '@utils/behaviours';

chai.use(smock.matchers);

describe('OracleSidechain.sol', () => {
  let deployer: SignerWithAddress;
  let randomUser: SignerWithAddress;
  let fakeDataReceiver: SignerWithAddress;
  let oracleSidechain: MockContract<OracleSidechain>;
  let oracleSidechainFactory: MockContractFactory<OracleSidechain__factory>;
  let snapshotId: string;

  before(async () => {
    [, deployer, randomUser, fakeDataReceiver] = await ethers.getSigners();
    oracleSidechainFactory = await smock.mock('OracleSidechain');
    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
    oracleSidechain = await oracleSidechainFactory.connect(deployer).deploy(fakeDataReceiver.address);
  });

  describe('observe(...)', () => {
    let initializeTimestamp: number;
    let initialTick = 50;
    let writeTimestamp1: number;
    let tick1 = 100;
    let liquidity1 = 1;
    let delta1 = 20;
    let writeTimestamp2: number;
    let tick2 = 300;
    let liquidity2 = 1;
    let delta2 = 60;
    let tickCumulatives: BigNumber[];
    let secondsPerLiquidityCumulativeX128s: BigNumber[];

    beforeEach(async () => {
      initializeTimestamp = (await ethers.provider.getBlock('latest')).timestamp + 1;
      await oracleSidechain.initialize(initializeTimestamp, initialTick);
      await oracleSidechain.increaseObservationCardinalityNext(3);
      await evm.advanceTimeAndBlock(delta1 - 2);
      writeTimestamp1 = (await ethers.provider.getBlock('latest')).timestamp + 1;
      await oracleSidechain.connect(fakeDataReceiver).write(writeTimestamp1, tick1);
      await evm.advanceTimeAndBlock(delta2 - 1);
      writeTimestamp2 = (await ethers.provider.getBlock('latest')).timestamp + 1;
      await oracleSidechain.connect(fakeDataReceiver).write(writeTimestamp2, tick2);
    });

    context('when queried data is factual', () => {
      let secondsAgos = [delta2, 0];

      it('should return the observation data', async () => {
        let tickCumulative1 = toBN(tick1 * delta1);
        let tickCumulative2 = tickCumulative1.add(tick2 * delta2);
        let expectedTickCumulatives = [tickCumulative1, tickCumulative2];
        let secondsPerLiquidityCumulativeX128_1 = toBN(delta1).shl(128).div(liquidity1);
        let secondsPerLiquidityCumulativeX128_2 = secondsPerLiquidityCumulativeX128_1.add(toBN(delta2).shl(128).div(liquidity2));
        let expectedSecondsPerLiquidityCumulativeX128s = [secondsPerLiquidityCumulativeX128_1, secondsPerLiquidityCumulativeX128_2];
        [tickCumulatives, secondsPerLiquidityCumulativeX128s] = await oracleSidechain.observe(secondsAgos);
        expect(tickCumulatives).to.eql(expectedTickCumulatives);
        expect(secondsPerLiquidityCumulativeX128s).to.eql(expectedSecondsPerLiquidityCumulativeX128s);
      });
    });

    context('when queried data is counterfactual (interpolation)', () => {
      let secondsAgos = [delta2, delta2 / 2];

      it('should return the interpolated data', async () => {
        let beforeTickCumulative = toBN(tick1 * delta1);
        let afterTickCumulative = beforeTickCumulative.add(tick2 * delta2);
        let interpolatedTickCumulative = beforeTickCumulative.add(
          afterTickCumulative
            .sub(beforeTickCumulative)
            .div(delta2)
            .mul(delta2 / 2)
        );
        let expectedTickCumulatives = [beforeTickCumulative, interpolatedTickCumulative];
        let beforeSecondsPerLiquidityCumulativeX128 = toBN(delta1).shl(128).div(liquidity1);
        let afterSecondsPerLiquidityCumulativeX128 = beforeSecondsPerLiquidityCumulativeX128.add(toBN(delta2).shl(128).div(liquidity2));
        let interpolatedSecondsPerLiquidityCumulativeX128 = beforeSecondsPerLiquidityCumulativeX128.add(
          afterSecondsPerLiquidityCumulativeX128
            .sub(beforeSecondsPerLiquidityCumulativeX128)
            .mul(delta2 / 2)
            .div(delta2)
        );
        let expectedSecondsPerLiquidityCumulativeX128s = [
          beforeSecondsPerLiquidityCumulativeX128,
          interpolatedSecondsPerLiquidityCumulativeX128,
        ];
        [tickCumulatives, secondsPerLiquidityCumulativeX128s] = await oracleSidechain.observe(secondsAgos);
        expect(tickCumulatives).to.eql(expectedTickCumulatives);
        expect(secondsPerLiquidityCumulativeX128s).to.eql(expectedSecondsPerLiquidityCumulativeX128s);
      });
    });

    context('when queried data is counterfactual (extrapolation)', () => {
      let delta3 = 10;
      let secondsAgos = [delta2 + delta3, 0];

      beforeEach(async () => {
        await evm.advanceTimeAndBlock(delta3);
      });

      it('should return the extrapolated data', async () => {
        let tickCumulative1 = toBN(tick1 * delta1);
        let lastTickCumulative = tickCumulative1.add(tick2 * delta2);
        let extrapolatedTickCumulative = lastTickCumulative.add(tick2 * delta3);
        let expectedTickCumulatives = [tickCumulative1, extrapolatedTickCumulative];
        let secondsPerLiquidityCumulativeX128_1 = toBN(delta1).shl(128).div(liquidity1);
        let lastSecondsPerLiquidityCumulativeX128 = secondsPerLiquidityCumulativeX128_1.add(toBN(delta2).shl(128).div(liquidity2));
        let extrapolatedSecondsPerLiquidityCumulativeX128 = lastSecondsPerLiquidityCumulativeX128.add(toBN(delta3).shl(128).div(liquidity2));
        let expectedSecondsPerLiquidityCumulativeX128s = [secondsPerLiquidityCumulativeX128_1, extrapolatedSecondsPerLiquidityCumulativeX128];
        [tickCumulatives, secondsPerLiquidityCumulativeX128s] = await oracleSidechain.observe(secondsAgos);
        expect(tickCumulatives).to.eql(expectedTickCumulatives);
        expect(secondsPerLiquidityCumulativeX128s).to.eql(expectedSecondsPerLiquidityCumulativeX128s);
      });
    });
  });

  describe('write(...)', () => {
    let writeTimestamp = 1000000;
    let tick = 100;
    let liquidity = 1;
    let delta = 20;

    it.skip('should revert if the oracle is not initialized', async () => {
      await expect(oracleSidechain.write(writeTimestamp, tick)).to.be.revertedWith('CustomError()');
    });

    onlyDataReceiver(
      () => oracleSidechain,
      'write',
      () => fakeDataReceiver,
      () => [writeTimestamp, tick]
    );

    context('when the oracle is initialized and the caller is the data receiver', () => {
      let initializeTimestamp = writeTimestamp - delta;
      let initialTick = 50;

      beforeEach(async () => {
        await oracleSidechain.initialize(initializeTimestamp, initialTick);
      });

      context('when the observation is writable', () => {
        it('should write an observation', async () => {
          let tickCumulative = toBN(tick * delta);
          let secondsPerLiquidityCumulativeX128 = toBN(delta).shl(128).div(liquidity);
          let expectedWrittenObservation = [writeTimestamp, tickCumulative, secondsPerLiquidityCumulativeX128, true];
          await oracleSidechain.connect(fakeDataReceiver).write(writeTimestamp, tick);
          let writtenObservation = await oracleSidechain.observations(0);
          expect(writtenObservation).to.eql(expectedWrittenObservation);
        });

        it('should update slot0', async () => {
          let expectedSlot0 = [1, 3, 3];
          await oracleSidechain.increaseObservationCardinalityNext(3);
          await oracleSidechain.connect(fakeDataReceiver).write(writeTimestamp, tick);
          let slot0 = await oracleSidechain.slot0();
          expect(slot0).to.eql(expectedSlot0);
        });

        it('should update lastTick', async () => {
          await oracleSidechain.connect(fakeDataReceiver).write(writeTimestamp, tick);
          let lastTick = await oracleSidechain.lastTick();
          expect(lastTick).to.eq(tick);
        });

        it('should return true', async () => {
          let written = await oracleSidechain.connect(fakeDataReceiver).callStatic.write(writeTimestamp, tick);
          expect(written).to.eq(true);
        });

        it('should emit ObservationWritten', async () => {
          await expect(oracleSidechain.connect(fakeDataReceiver).write(writeTimestamp, tick))
            .to.emit(oracleSidechain, 'ObservationWritten')
            .withArgs(fakeDataReceiver.address, writeTimestamp, tick);
        });
      });

      context('when the observation is not writable', () => {
        let initializeTimestampBefore: number;

        beforeEach(async () => {
          initializeTimestampBefore = initializeTimestamp - 1;
        });

        it('should return false', async () => {
          let writtenAt = await oracleSidechain.connect(fakeDataReceiver).callStatic.write(initializeTimestamp, tick);
          let writtenBefore = await oracleSidechain.connect(fakeDataReceiver).callStatic.write(initializeTimestampBefore, tick);
          expect(writtenAt).to.eq(false);
          expect(writtenBefore).to.eq(false);
        });
      });
    });
  });

  describe('initialize(...)', () => {
    let initializeTimestamp = 500000;
    let initialTick = 50;

    it('should revert if the oracle is already initialized', async () => {
      await oracleSidechain.initialize(initializeTimestamp, initialTick);
      await expect(oracleSidechain.initialize(initializeTimestamp, initialTick)).to.be.revertedWith('AI()');
    });

    it('should update lastTick', async () => {
      await oracleSidechain.initialize(initializeTimestamp, initialTick);
      let lastTick = await oracleSidechain.lastTick();
      expect(lastTick).to.eq(initialTick);
    });

    it('should initialize observations', async () => {
      let expectedInitialObservation = [initializeTimestamp, toBN(0), toBN(0), true];
      await oracleSidechain.initialize(initializeTimestamp, initialTick);
      let initialObservation = await oracleSidechain.observations(0);
      expect(initialObservation).to.eql(expectedInitialObservation);
    });

    it('should update slot0', async () => {
      let expectedSlot0 = [0, 1, 1];
      await oracleSidechain.initialize(initializeTimestamp, initialTick);
      let slot0 = await oracleSidechain.slot0();
      expect(slot0).to.eql(expectedSlot0);
    });

    it('should emit Initialize', async () => {
      await expect(oracleSidechain.initialize(initializeTimestamp, initialTick))
        .to.emit(oracleSidechain, 'Initialize')
        .withArgs(initializeTimestamp, initialTick);
    });
  });
});
