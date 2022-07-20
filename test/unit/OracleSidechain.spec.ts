import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { OracleSidechain, OracleSidechain__factory, IOracleSidechain } from '@typechained';
import { smock, MockContract, MockContractFactory } from '@defi-wonderland/smock';
import { evm } from '@utils';
import { toBN } from '@utils/bn';
import { onlyDataReceiver } from '@utils/behaviours';
import chai, { expect } from 'chai';

chai.use(smock.matchers);

describe('OracleSidechain.sol', () => {
  let fakeDataReceiver: SignerWithAddress;
  let oracleSidechain: MockContract<OracleSidechain>;
  let oracleSidechainFactory: MockContractFactory<OracleSidechain__factory>;
  let snapshotId: string;

  before(async () => {
    [, fakeDataReceiver] = await ethers.getSigners();
    oracleSidechainFactory = await smock.mock('OracleSidechain');
    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
    oracleSidechain = await oracleSidechainFactory.deploy(fakeDataReceiver.address);
  });

  describe('observe(...)', () => {
    let initialBlockTimestamp: number;
    let initialTick = 50;
    let initialObservationData: number[];
    let delta1 = 20;
    let blockTimestamp1: number;
    let tick1 = 100;
    let observationData1: number[];
    let delta2 = 60;
    let blockTimestamp2: number;
    let tick2 = 300;
    let observationData2: number[];
    let observationsData: number[][];
    let tickCumulatives: BigNumber[];
    let secondsPerLiquidityCumulativeX128s: BigNumber[];

    beforeEach(async () => {
      initialBlockTimestamp = (await ethers.provider.getBlock('latest')).timestamp + 1;
      initialObservationData = [initialBlockTimestamp, initialTick];
      await oracleSidechain.initialize(initialObservationData);
      await oracleSidechain.increaseObservationCardinalityNext(3);
      await evm.advanceTimeAndBlock(delta1 + delta2 - 2);
      blockTimestamp1 = initialBlockTimestamp + delta1;
      observationData1 = [blockTimestamp1, tick1];
      blockTimestamp2 = blockTimestamp1 + delta2;
      observationData2 = [blockTimestamp2, tick2];
      observationsData = [observationData1, observationData2];
      await oracleSidechain.connect(fakeDataReceiver).write(observationsData);
    });

    context('when queried data is factual', () => {
      let secondsAgos = [delta2, 0];

      it('should return the observation data', async () => {
        let tickCumulative1 = toBN(tick1 * delta1);
        let tickCumulative2 = tickCumulative1.add(tick2 * delta2);
        let expectedTickCumulatives = [tickCumulative1, tickCumulative2];
        let secondsPerLiquidityCumulativeX128_1 = toBN(delta1).shl(128);
        let secondsPerLiquidityCumulativeX128_2 = secondsPerLiquidityCumulativeX128_1.add(toBN(delta2).shl(128));
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
        let beforeSecondsPerLiquidityCumulativeX128 = toBN(delta1).shl(128);
        let afterSecondsPerLiquidityCumulativeX128 = beforeSecondsPerLiquidityCumulativeX128.add(toBN(delta2).shl(128));
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
        let secondsPerLiquidityCumulativeX128_1 = toBN(delta1).shl(128);
        let lastSecondsPerLiquidityCumulativeX128 = secondsPerLiquidityCumulativeX128_1.add(toBN(delta2).shl(128));
        let extrapolatedSecondsPerLiquidityCumulativeX128 = lastSecondsPerLiquidityCumulativeX128.add(toBN(delta3).shl(128));
        let expectedSecondsPerLiquidityCumulativeX128s = [secondsPerLiquidityCumulativeX128_1, extrapolatedSecondsPerLiquidityCumulativeX128];
        [tickCumulatives, secondsPerLiquidityCumulativeX128s] = await oracleSidechain.observe(secondsAgos);
        expect(tickCumulatives).to.eql(expectedTickCumulatives);
        expect(secondsPerLiquidityCumulativeX128s).to.eql(expectedSecondsPerLiquidityCumulativeX128s);
      });
    });
  });

  describe('write(...)', () => {
    let blockTimestamp1 = 1000000;
    let tick1 = 100;
    let observationData1 = [blockTimestamp1, tick1] as IOracleSidechain.ObservationDataStructOutput;
    let blockTimestamp2 = 3000000;
    let tick2 = 300;
    let observationData2 = [blockTimestamp2, tick2] as IOracleSidechain.ObservationDataStructOutput;
    let observationsData = [observationData1, observationData2];

    it.skip('should revert if the oracle is not initialized', async () => {
      await expect(oracleSidechain.write(observationsData)).to.be.revertedWith('CustomError()');
    });

    onlyDataReceiver(
      () => oracleSidechain,
      'write',
      () => fakeDataReceiver,
      () => [observationsData]
    );

    context('when the oracle is initialized and the caller is the data receiver', () => {
      let initialBlockTimestamp = 500000;
      let initialTick = 50;
      let initialObservationData = [initialBlockTimestamp, initialTick] as IOracleSidechain.ObservationDataStructOutput;

      beforeEach(async () => {
        await oracleSidechain.initialize(initialObservationData);
        await oracleSidechain.increaseObservationCardinalityNext(2);
      });

      context('when the observations are writable', () => {
        it('should write the observations', async () => {
          let delta1 = blockTimestamp1 - initialBlockTimestamp;
          let tickCumulative1 = toBN(tick1 * delta1);
          let secondsPerLiquidityCumulativeX128_1 = toBN(delta1).shl(128);
          let expectedObservation1 = [blockTimestamp1, tickCumulative1, secondsPerLiquidityCumulativeX128_1, true];
          let delta2 = blockTimestamp2 - blockTimestamp1;
          let tickCumulative2 = tickCumulative1.add(tick2 * delta2);
          let secondsPerLiquidityCumulativeX128_2 = secondsPerLiquidityCumulativeX128_1.add(toBN(delta2).shl(128));
          let expectedObservation2 = [blockTimestamp2, tickCumulative2, secondsPerLiquidityCumulativeX128_2, true];
          await oracleSidechain.connect(fakeDataReceiver).write(observationsData);
          let observation1 = await oracleSidechain.observations(1);
          let observation2 = await oracleSidechain.observations(0);
          expect(observation1).to.eql(expectedObservation1);
          expect(observation2).to.eql(expectedObservation2);
        });

        it('should update slot0', async () => {
          let expectedSlot0 = [0, 2, 2];
          await oracleSidechain.connect(fakeDataReceiver).write(observationsData);
          let slot0 = await oracleSidechain.slot0();
          expect(slot0).to.eql(expectedSlot0);
        });

        it('should update lastTick', async () => {
          await oracleSidechain.connect(fakeDataReceiver).write(observationsData);
          let lastTick = await oracleSidechain.lastTick();
          expect(lastTick).to.eq(tick2);
        });

        it('should emit ObservationWritten', async () => {
          let tx = await oracleSidechain.connect(fakeDataReceiver).write(observationsData);
          await expect(tx).to.emit(oracleSidechain, 'ObservationWritten').withArgs(fakeDataReceiver.address, observationData1);
          await expect(tx).to.emit(oracleSidechain, 'ObservationWritten').withArgs(fakeDataReceiver.address, observationData2);
        });

        it('should return true', async () => {
          let written = await oracleSidechain.connect(fakeDataReceiver).callStatic.write(observationsData);
          expect(written).to.eq(true);
        });
      });

      context('when the observations are not writable', () => {
        let initialBlockTimestampBefore = initialBlockTimestamp - 1;
        let initialObservationDataBefore = [initialBlockTimestampBefore, initialTick] as IOracleSidechain.ObservationDataStructOutput;
        let initialObservationsData = [initialObservationDataBefore, initialObservationData];

        it('should return false', async () => {
          let written = await oracleSidechain.connect(fakeDataReceiver).callStatic.write(initialObservationsData);
          expect(written).to.eq(false);
        });
      });
    });
  });

  describe('initialize(...)', () => {
    let initialBlockTimestamp = 500000;
    let initialTick = 50;
    let initialObservationData = [initialBlockTimestamp, initialTick];

    it('should revert if the oracle is already initialized', async () => {
      await oracleSidechain.initialize(initialObservationData);
      await expect(oracleSidechain.initialize(initialObservationData)).to.be.revertedWith('AI()');
    });

    it('should update lastTick', async () => {
      await oracleSidechain.initialize(initialObservationData);
      let lastTick = await oracleSidechain.lastTick();
      expect(lastTick).to.eq(initialTick);
    });

    it('should initialize observations', async () => {
      let expectedInitialObservation = [initialBlockTimestamp, toBN(0), toBN(0), true];
      await oracleSidechain.initialize(initialObservationData);
      let initialObservation = await oracleSidechain.observations(0);
      expect(initialObservation).to.eql(expectedInitialObservation);
    });

    it('should update slot0', async () => {
      let expectedSlot0 = [0, 1, 1];
      await oracleSidechain.initialize(initialObservationData);
      let slot0 = await oracleSidechain.slot0();
      expect(slot0).to.eql(expectedSlot0);
    });

    it('should emit Initialize', async () => {
      await expect(oracleSidechain.initialize(initialObservationData)).to.emit(oracleSidechain, 'Initialize').withArgs(initialObservationData);
    });
  });
});
