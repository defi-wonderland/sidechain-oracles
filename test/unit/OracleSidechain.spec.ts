import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { OracleSidechain, OracleSidechain__factory } from '@typechained';
import { smock, MockContract, MockContractFactory } from '@defi-wonderland/smock';
import { evm, bn } from '@utils';
import chai, { expect } from 'chai';

chai.use(smock.matchers);

describe('OracleSidechain.sol - unit testing', () => {
  const MIN_SQRT_RATIO: BigNumber = bn.toBN(4295128739);
  let deployer: SignerWithAddress;
  let randomUser: SignerWithAddress;
  let oracleSidechain: MockContract<OracleSidechain>;
  let oracleSidechainFactory: MockContractFactory<OracleSidechain__factory>;
  let snapshotId: string;

  before(async () => {
    [, deployer, randomUser] = await ethers.getSigners();
    oracleSidechainFactory = await smock.mock('OracleSidechain');
    oracleSidechain = await oracleSidechainFactory.connect(deployer).deploy();
    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('observe(...)', () => {
    let writeTimestamp1: number;
    let tick1 = bn.toBN(100);
    let liquidity1 = bn.toBN(500);
    let delta1 = bn.toBN(2);
    let writeTimestamp2: number;
    let tick2 = bn.toBN(300);
    let liquidity2 = bn.toBN(600);
    let delta2 = bn.toBN(20);
    let tickCumulatives: BigNumber[];
    let secondsPerLiquidityCumulativeX128s: BigNumber[];

    beforeEach(async () => {
      await oracleSidechain.initialize(MIN_SQRT_RATIO);
      await oracleSidechain.increaseObservationCardinalityNext(3);
      writeTimestamp1 = (await ethers.provider.getBlock('latest')).timestamp + 1;
      await oracleSidechain.write(writeTimestamp1, tick1, liquidity1);
      await evm.advanceTimeAndBlock(delta2.toNumber() - 1);
      writeTimestamp2 = (await ethers.provider.getBlock('latest')).timestamp + 1;
      await oracleSidechain.write(writeTimestamp2, tick2, liquidity2);
    });

    context('when queried data is factual', () => {
      let secondsAgos = [delta2, bn.toBN(0)];

      it('should return the observation data', async () => {
        let tickCumulative1 = tick1.mul(delta1);
        let tickCumulative2 = tickCumulative1.add(tick2.mul(delta2));
        let expectedTickCumulatives = [tickCumulative1, tickCumulative2];
        let secondsPerLiquidityCumulativeX128_1 = delta1.shl(128).div(liquidity1);
        let secondsPerLiquidityCumulativeX128_2 = secondsPerLiquidityCumulativeX128_1.add(delta2.shl(128).div(liquidity2));
        let expectedSecondsPerLiquidityCumulativeX128s = [secondsPerLiquidityCumulativeX128_1, secondsPerLiquidityCumulativeX128_2];
        [tickCumulatives, secondsPerLiquidityCumulativeX128s] = await oracleSidechain.observe(secondsAgos);
        expect(tickCumulatives).to.eql(expectedTickCumulatives);
        expect(secondsPerLiquidityCumulativeX128s).to.eql(expectedSecondsPerLiquidityCumulativeX128s);
      });
    });

    context('when queried data is counterfactual (interpolation)', () => {
      let secondsAgos = [delta2, delta2.div(2)];

      it('should return the interpolated data', async () => {
        let beforeTickCumulative = tick1.mul(delta1);
        let afterTickCumulative = beforeTickCumulative.add(tick2.mul(delta2));
        let interpolatedTickCumulative = beforeTickCumulative.add(afterTickCumulative.sub(beforeTickCumulative).div(delta2).mul(delta2.div(2)));
        let expectedTickCumulatives = [beforeTickCumulative, interpolatedTickCumulative];
        let beforeSecondsPerLiquidityCumulativeX128 = delta1.shl(128).div(liquidity1);
        let afterSecondsPerLiquidityCumulativeX128 = beforeSecondsPerLiquidityCumulativeX128.add(delta2.shl(128).div(liquidity2));
        let interpolatedSecondsPerLiquidityCumulativeX128 = beforeSecondsPerLiquidityCumulativeX128.add(
          afterSecondsPerLiquidityCumulativeX128.sub(beforeSecondsPerLiquidityCumulativeX128).mul(delta2.div(2)).div(delta2)
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
      let delta3 = bn.toBN(10);
      let secondsAgos = [delta2.add(delta3), bn.toBN(0)];

      beforeEach(async () => {
        await evm.advanceTimeAndBlock(delta3.toNumber());
      });

      it('should return the extrapolated data', async () => {
        let tickCumulative1 = tick1.mul(delta1);
        let lastTickCumulative = tickCumulative1.add(tick2.mul(delta2));
        let extrapolatedTickCumulative = lastTickCumulative.add(tick2.mul(delta3));
        let expectedTickCumulatives = [tickCumulative1, extrapolatedTickCumulative];
        let secondsPerLiquidityCumulativeX128_1 = delta1.shl(128).div(liquidity1);
        let lastSecondsPerLiquidityCumulativeX128 = secondsPerLiquidityCumulativeX128_1.add(delta2.shl(128).div(liquidity2));
        let extrapolatedSecondsPerLiquidityCumulativeX128 = lastSecondsPerLiquidityCumulativeX128.add(delta3.shl(128).div(liquidity2));
        let expectedSecondsPerLiquidityCumulativeX128s = [secondsPerLiquidityCumulativeX128_1, extrapolatedSecondsPerLiquidityCumulativeX128];
        [tickCumulatives, secondsPerLiquidityCumulativeX128s] = await oracleSidechain.observe(secondsAgos);
        expect(tickCumulatives).to.eql(expectedTickCumulatives);
        expect(secondsPerLiquidityCumulativeX128s).to.eql(expectedSecondsPerLiquidityCumulativeX128s);
      });
    });
  });

  describe('write(...)', () => {
    let tick = bn.toBN(100);
    let liquidity = bn.toBN(500);
    let delta = bn.toBN(2);

    it('should revert if the oracle is not initialized', async () => {
      let writeTimestamp = (await ethers.provider.getBlock('latest')).timestamp + 1;
      await expect(oracleSidechain.write(writeTimestamp, tick, liquidity)).to.be.revertedWith('LOK()');
    });

    context('when the oracle is initialized', () => {
      let writeTimestamp: number;

      beforeEach(async () => {
        await oracleSidechain.initialize(MIN_SQRT_RATIO);
        await evm.advanceTimeAndBlock(delta.toNumber() - 1);
      });

      context('when the observation is writable', () => {
        beforeEach(async () => {
          writeTimestamp = (await ethers.provider.getBlock('latest')).timestamp + 1;
        });

        it('should write an observation', async () => {
          let tickCumulative = tick.mul(delta);
          let secondsPerLiquidityCumulativeX128 = delta.shl(128).div(liquidity);
          let expectedWrittenObservation = [writeTimestamp, tickCumulative, secondsPerLiquidityCumulativeX128, true];
          await oracleSidechain.write(writeTimestamp, tick, liquidity);
          let writtenObservation = await oracleSidechain.observations(0);
          expect(writtenObservation).to.eql(expectedWrittenObservation);
        });

        it('should update slot0', async () => {
          let expectedSlot0 = [MIN_SQRT_RATIO, tick.toNumber(), 0, 1, 1, 0, true];
          await oracleSidechain.write(writeTimestamp, tick, liquidity);
          let slot0 = await oracleSidechain.slot0();
          expect(slot0).to.eql(expectedSlot0);
        });

        it('should update liquidity', async () => {
          await oracleSidechain.write(writeTimestamp, tick, liquidity);
          let lastLiquidity = await oracleSidechain.liquidity();
          expect(lastLiquidity).to.eq(liquidity);
        });

        it('should return true', async () => {
          let written = await oracleSidechain.callStatic.write(writeTimestamp, tick, liquidity);
          expect(written).to.eq(true);
        });

        it('should emit ObservationWritten', async () => {
          await expect(oracleSidechain.connect(randomUser).write(writeTimestamp, tick, liquidity))
            .to.emit(oracleSidechain, 'ObservationWritten')
            .withArgs(randomUser.address, writeTimestamp, tick, liquidity);
        });
      });

      context('when the observation is not writable', () => {
        beforeEach(async () => {
          writeTimestamp = (await ethers.provider.getBlock('latest')).timestamp - delta.toNumber() + 1;
        });

        it('should return false', async () => {
          let written = await oracleSidechain.callStatic.write(writeTimestamp, tick, liquidity);
          expect(written).to.eq(false);
        });
      });
    });
  });
});
