import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import { OracleSidechain, OracleSidechain__factory, IOracleSidechain, OracleFactory, DataReceiver } from '@typechained';
import { smock, MockContract, MockContractFactory, FakeContract } from '@defi-wonderland/smock';
import { evm, wallet } from '@utils';
import { ZERO_ADDRESS, CARDINALITY } from '@utils/constants';
import { toBN, toUnit } from '@utils/bn';
import { onlyDataReceiver } from '@utils/behaviours';
import { sortTokens, calculateSalt } from '@utils/misc';
import chai, { expect } from 'chai';

chai.use(smock.matchers);

describe('OracleSidechain.sol', () => {
  let oracleSidechain: MockContract<OracleSidechain>;
  let oracleSidechainFactory: MockContractFactory<OracleSidechain__factory>;
  let oracleFactory: FakeContract<OracleFactory>;
  let dataReceiver: FakeContract<DataReceiver>;
  let snapshotId: string;

  const randomTokenA = wallet.generateRandomAddress();
  const randomTokenB = wallet.generateRandomAddress();
  const randomFee = 3000;
  const randomNonce = 420;
  const salt = calculateSalt(randomTokenA, randomTokenB, randomFee);

  before(async () => {
    dataReceiver = await smock.fake('DataReceiver');
    await wallet.setBalance(dataReceiver.address, toUnit(10));
    oracleFactory = await smock.fake('OracleFactory');
    await wallet.setBalance(oracleFactory.address, toUnit(10));
    oracleFactory.dataReceiver.returns(dataReceiver.address);
    oracleFactory.oracleParameters.returns([oracleFactory.address, salt, randomNonce, CARDINALITY]);
    oracleSidechainFactory = await smock.mock('OracleSidechain');
    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
    oracleSidechain = await oracleSidechainFactory.connect(oracleFactory.wallet).deploy();
  });

  describe('constructor(...)', () => {
    it('should return the correct factory', async () => {
      expect(await oracleSidechain.factory()).to.eq(oracleFactory.address);
    });

    it('should not initialize token0', async () => {
      expect(await oracleSidechain.token0()).to.eq(ZERO_ADDRESS);
    });

    it('should not initialize token1', async () => {
      expect(await oracleSidechain.token1()).to.eq(ZERO_ADDRESS);
    });

    it('should not initialize fee', async () => {
      expect(await oracleSidechain.fee()).to.eq(0);
    });

    it('should initialize sqrtPriceX96 to 0', async () => {
      expect((await oracleSidechain.slot0()).sqrtPriceX96).to.eq(0);
    });

    it('should initialize tick to 0', async () => {
      expect((await oracleSidechain.slot0()).tick).to.eq(0);
    });

    it('should initialize observationIndex to initial cardinality - 1', async () => {
      expect((await oracleSidechain.slot0()).observationIndex).to.eq(CARDINALITY - 1);
    });

    it('should initialize cardinality to initial cardinality', async () => {
      expect((await oracleSidechain.slot0()).observationCardinality).to.eq(CARDINALITY);
    });

    it('should initialize cardinalityNext to initial cardinality', async () => {
      expect((await oracleSidechain.slot0()).observationCardinalityNext).to.eq(CARDINALITY);
    });

    it('should initialize feeProtocol to 0', async () => {
      expect((await oracleSidechain.slot0()).feeProtocol).to.eq(0);
    });

    it('should initialize unlocked to true', async () => {
      expect((await oracleSidechain.slot0()).unlocked).to.eq(true);
    });
  });

  describe('initializePoolInfo(...)', async () => {
    it('should revert if pool info is incorrect', async () => {
      await expect(oracleSidechain.initializePoolInfo(randomTokenA, randomTokenB, 0)).to.be.revertedWith('InvalidPool()');
      await expect(oracleSidechain.initializePoolInfo(ZERO_ADDRESS, randomTokenB, randomFee)).to.be.revertedWith('InvalidPool()');
      await expect(oracleSidechain.initializePoolInfo(randomTokenA, ZERO_ADDRESS, randomFee)).to.be.revertedWith('InvalidPool()');
    });

    it('should work with disordered tokens', async () => {
      await expect(oracleSidechain.callStatic.initializePoolInfo(randomTokenA, randomTokenB, randomFee)).not.to.be.revertedWith('InvalidPool()');
      await expect(oracleSidechain.callStatic.initializePoolInfo(randomTokenA, randomTokenB, randomFee)).not.to.be.revertedWith('InvalidPool()');
    });

    it('should set token0', async () => {
      await oracleSidechain.initializePoolInfo(randomTokenA, randomTokenB, randomFee);
      const [token0] = sortTokens([randomTokenA, randomTokenB]);

      expect(await oracleSidechain.token0()).to.eq(token0);
    });

    it('should set token1', async () => {
      await oracleSidechain.initializePoolInfo(randomTokenA, randomTokenB, randomFee);
      const [, token1] = sortTokens([randomTokenA, randomTokenB]);

      expect(await oracleSidechain.token1()).to.eq(token1);
    });

    it('should set fee', async () => {
      await oracleSidechain.initializePoolInfo(randomTokenA, randomTokenB, randomFee);

      expect(await oracleSidechain.fee()).to.eq(randomFee);
    });

    it('should set unlocked to false', async () => {
      await oracleSidechain.initializePoolInfo(randomTokenA, randomTokenB, randomFee);

      expect((await oracleSidechain.slot0()).unlocked).to.eq(false);
    });

    it('should revert after pool info was initialized', async () => {
      await oracleSidechain.setVariable('slot0', { ['unlocked']: false });

      await expect(oracleSidechain.initializePoolInfo(ZERO_ADDRESS, ZERO_ADDRESS, 0)).to.be.revertedWith('AI()');
    });
  });

  describe('observe(...)', () => {
    let blockTimestamp1: number;
    let tick1 = 100;
    let observationData1: number[];
    let delta2 = 30;
    let blockTimestamp2: number;
    let tick2 = 300;
    let observationData2: number[];
    let observationsData: number[][];
    let tickCumulatives: BigNumber[];
    let secondsPerLiquidityCumulativeX128s: BigNumber[];

    beforeEach(async () => {
      blockTimestamp1 = (await ethers.provider.getBlock('latest')).timestamp + 1;
      observationData1 = [blockTimestamp1, tick1];
      blockTimestamp2 = blockTimestamp1 + delta2;
      observationData2 = [blockTimestamp2, tick2];
      observationsData = [observationData1, observationData2];
      await oracleSidechain.connect(dataReceiver.wallet).write(observationsData, randomNonce);
      await evm.advanceTimeAndBlock(delta2);
    });

    context('when queried data is older than the first written timestamp', () => {
      let secondsAgos = [delta2 + 1, 0];

      it('should revert with OLD()', async () => {
        await expect(oracleSidechain.observe(secondsAgos)).to.be.revertedWith('OLD()');
      });
    });

    context('when queried data is factual', () => {
      let secondsAgos = [delta2, 0];

      it('should return the observation data', async () => {
        let tickCumulative1 = toBN(0);
        let tickCumulative2 = toBN(tick1 * delta2);
        let expectedTickCumulatives = [tickCumulative1, tickCumulative2];
        let secondsPerLiquidityCumulativeX128_1 = toBN(blockTimestamp1).shl(128);
        let secondsPerLiquidityCumulativeX128_2 = secondsPerLiquidityCumulativeX128_1.add(toBN(delta2).shl(128));
        let expectedSecondsPerLiquidityCumulativeX128s = [secondsPerLiquidityCumulativeX128_1, secondsPerLiquidityCumulativeX128_2];

        [tickCumulatives, secondsPerLiquidityCumulativeX128s] = await oracleSidechain.observe(secondsAgos);

        for (let i = 0; i < secondsAgos.length; ++i) {
          expect(tickCumulatives[i]).to.eq(expectedTickCumulatives[i]);
          expect(secondsPerLiquidityCumulativeX128s[i]).to.eq(expectedSecondsPerLiquidityCumulativeX128s[i]);
        }
      });
    });

    context('when queried data is counterfactual (interpolation)', () => {
      let secondsAgos = [delta2, delta2 / 2];

      it('should return the interpolated data', async () => {
        let beforeTickCumulative = toBN(0);
        let afterTickCumulative = toBN(tick1 * delta2);
        let interpolatedTickCumulative = beforeTickCumulative.add(
          afterTickCumulative
            .sub(beforeTickCumulative)
            .div(delta2)
            .mul(delta2 / 2)
        );
        let expectedTickCumulatives = [beforeTickCumulative, interpolatedTickCumulative];
        let beforeSecondsPerLiquidityCumulativeX128 = toBN(blockTimestamp1).shl(128);
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

        for (let i = 0; i < secondsAgos.length; ++i) {
          expect(tickCumulatives[i]).to.eq(expectedTickCumulatives[i]);
          expect(secondsPerLiquidityCumulativeX128s[i]).to.eq(expectedSecondsPerLiquidityCumulativeX128s[i]);
        }
      });
    });

    context('when queried data is counterfactual (extrapolation)', () => {
      let delta3 = 60;
      let secondsAgos = [delta2 + delta3, 0];

      beforeEach(async () => {
        await evm.advanceTimeAndBlock(delta3);
      });

      it('should return the extrapolated data', async () => {
        let tickCumulative1 = toBN(0);
        let lastTickCumulative = toBN(tick1 * delta2);
        let extrapolatedTickCumulative = lastTickCumulative.add(tick2 * delta3);
        let expectedTickCumulatives = [tickCumulative1, extrapolatedTickCumulative];
        let secondsPerLiquidityCumulativeX128_1 = toBN(blockTimestamp1).shl(128);
        let lastSecondsPerLiquidityCumulativeX128 = secondsPerLiquidityCumulativeX128_1.add(toBN(delta2).shl(128));
        let extrapolatedSecondsPerLiquidityCumulativeX128 = lastSecondsPerLiquidityCumulativeX128.add(toBN(delta3).shl(128));
        let expectedSecondsPerLiquidityCumulativeX128s = [secondsPerLiquidityCumulativeX128_1, extrapolatedSecondsPerLiquidityCumulativeX128];

        [tickCumulatives, secondsPerLiquidityCumulativeX128s] = await oracleSidechain.observe(secondsAgos);

        for (let i = 0; i < secondsAgos.length; ++i) {
          expect(tickCumulatives[i]).to.eq(expectedTickCumulatives[i]);
          expect(secondsPerLiquidityCumulativeX128s[i]).to.eq(expectedSecondsPerLiquidityCumulativeX128s[i]);
        }
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

    onlyDataReceiver(
      () => oracleSidechain,
      'write',
      () => dataReceiver.wallet,
      () => [observationsData, randomNonce]
    );

    context('when the caller is the data receiver', () => {
      context('when the observations are writable', () => {
        it('should write the observations', async () => {
          let tickCumulative1 = toBN(0);
          let secondsPerLiquidityCumulativeX128_1 = toBN(blockTimestamp1).shl(128);
          let delta2 = blockTimestamp2 - blockTimestamp1;
          let tickCumulative2 = toBN(tick1 * delta2);
          let secondsPerLiquidityCumulativeX128_2 = secondsPerLiquidityCumulativeX128_1.add(toBN(delta2).shl(128));

          await oracleSidechain.connect(dataReceiver.wallet).write(observationsData, randomNonce);
          let observation1 = await oracleSidechain.observations(0);
          let observation2 = await oracleSidechain.observations(1);

          expect(observation1.blockTimestamp).to.eq(blockTimestamp1);
          expect(observation1.tickCumulative).to.eq(tickCumulative1);
          expect(observation1.secondsPerLiquidityCumulativeX128).to.eq(secondsPerLiquidityCumulativeX128_1);
          expect(observation1.initialized).to.eq(true);

          expect(observation2.blockTimestamp).to.eq(blockTimestamp2);
          expect(observation2.tickCumulative).to.eq(tickCumulative2);
          expect(observation2.secondsPerLiquidityCumulativeX128).to.eq(secondsPerLiquidityCumulativeX128_2);
          expect(observation2.initialized).to.eq(true);
        });

        it('should update slot0', async () => {
          await oracleSidechain.connect(dataReceiver.wallet).write(observationsData, randomNonce);
          let slot0 = await oracleSidechain.slot0();

          expect(slot0.sqrtPriceX96).to.eq(0);
          expect(slot0.tick).to.eq(tick2);
          expect(slot0.observationIndex).to.eq(1);
          expect(slot0.observationCardinality).to.eq(CARDINALITY);
          expect(slot0.observationCardinalityNext).to.eq(CARDINALITY);
          expect(slot0.feeProtocol).to.eq(0);
          expect(slot0.unlocked).to.eq(true);
        });

        it('should emit ObservationWritten', async () => {
          let tx = await oracleSidechain.connect(dataReceiver.wallet).write(observationsData, randomNonce);
          await expect(tx).to.emit(oracleSidechain, 'ObservationWritten').withArgs(dataReceiver.address, observationData1);
          await expect(tx).to.emit(oracleSidechain, 'ObservationWritten').withArgs(dataReceiver.address, observationData2);
        });

        it('should return true', async () => {
          let written = await oracleSidechain.connect(dataReceiver.wallet).callStatic.write(observationsData, randomNonce);
          expect(written).to.eq(true);
        });
      });

      context('when the observations are not writable', () => {
        let blockTimestamp2Before = blockTimestamp2 - 1;
        let observationData2Before = [blockTimestamp2Before, tick2] as IOracleSidechain.ObservationDataStructOutput;
        let oldObservationsData = [observationData2Before, observationData2];

        beforeEach(async () => {
          await oracleSidechain.connect(dataReceiver.wallet).write(observationsData, randomNonce);
        });

        it('should return false', async () => {
          let written = await oracleSidechain.connect(dataReceiver.wallet).callStatic.write(oldObservationsData, randomNonce);
          expect(written).to.eq(false);
        });
      });
    });
  });
});
