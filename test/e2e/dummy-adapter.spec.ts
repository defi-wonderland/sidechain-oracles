import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { DataFeed, DummyAdapterForTest, DataReceiver, OracleSidechain, OracleFactory, ERC20 } from '@typechained';
import { UniswapV3Pool } from '@eth-sdk-types';
import { evm } from '@utils';
import { RANDOM_CHAIN_ID } from '@utils/constants';
import { toBN } from '@utils/bn';
import { GOERLI_DESTINATION_DOMAIN_CONNEXT } from 'utils/constants';
import { getNodeUrl } from 'utils/env';
import forkBlockNumber from './fork-block-numbers';
import { setupContracts, getEnvironment, getOracle } from './common';
import { expect } from 'chai';

describe('@skip-on-coverage Dummy Data Briding', () => {
  let governance: SignerWithAddress;
  let dataFeed: DataFeed;
  let uniV3Pool: UniswapV3Pool;
  let tokenA: ERC20;
  let tokenB: ERC20;
  let fee: number;
  let dataReceiver: DataReceiver;
  let oracleFactory: OracleFactory;
  let oracleSidechain: OracleSidechain;
  let snapshotId: string;
  let dummyAdapterForTest: DummyAdapterForTest;
  let secondsNow: number;
  let secondsAgo = 30;
  let secondsAgosDelta1 = 20;
  let secondsAgosDelta2 = 10;
  let secondsAgos = [secondsAgo, secondsAgo - secondsAgosDelta1, secondsAgo - (secondsAgosDelta1 + secondsAgosDelta2)];
  let blockTimestamp1: number;
  let blockTimestamp2: number;
  let tickCumulativesDelta1: BigNumber;
  let tickCumulativesDelta2: BigNumber;
  let tickCumulatives: BigNumber[];
  let arithmeticMeanTick1: BigNumber;
  let arithmeticMeanTick2: BigNumber;

  before(async () => {
    await evm.reset({
      jsonRpcUrl: getNodeUrl('ethereum'),
      blockNumber: forkBlockNumber.oracleSidechain,
    });

    const dummyAdapterForTestFactory = await ethers.getContractFactory('DummyAdapterForTest');
    dummyAdapterForTest = (await dummyAdapterForTestFactory.deploy()) as DummyAdapterForTest;

    ({ uniV3Pool, tokenA, tokenB, fee } = await getEnvironment());

    ({ governance, dataFeed, dataReceiver, oracleFactory } = await setupContracts());

    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('observation bridging flow', () => {
    context('when the adapter, destination domain and receiver are set and whitelisted', () => {
      beforeEach(async () => {
        await dataFeed.connect(governance).whitelistAdapter(dummyAdapterForTest.address, true);
        await dataFeed
          .connect(governance)
          .setDestinationDomainId(dummyAdapterForTest.address, RANDOM_CHAIN_ID, GOERLI_DESTINATION_DOMAIN_CONNEXT);
        await dataFeed.connect(governance).setReceiver(dummyAdapterForTest.address, GOERLI_DESTINATION_DOMAIN_CONNEXT, dataReceiver.address);
        await dataReceiver.connect(governance).whitelistAdapter(dummyAdapterForTest.address, true);

        await evm.advanceTimeAndBlock(1);
        secondsNow = (await ethers.provider.getBlock('latest')).timestamp;
        blockTimestamp1 = secondsNow - secondsAgos[1];
        blockTimestamp2 = secondsNow - secondsAgos[2];

        [tickCumulatives] = await uniV3Pool.observe(secondsAgos);
        tickCumulativesDelta1 = tickCumulatives[1].sub(tickCumulatives[0]);
        tickCumulativesDelta2 = tickCumulatives[2].sub(tickCumulatives[1]);
        arithmeticMeanTick1 = tickCumulativesDelta1.div(secondsAgosDelta1);
        arithmeticMeanTick2 = tickCumulativesDelta2.div(secondsAgosDelta2);
        await evm.advanceTimeAndBlock(-1);
      });

      // TODO: fix time related errors in tests
      it.skip('should bridge the data and add the observations correctly', async () => {
        let observationsDelta2 = blockTimestamp2 - blockTimestamp1;

        // tickCumulative in new observation formula = last tickCumulative + tick * delta, in this case we can omit last.tickCumulative as it's 0
        // due to initialize() being the prev obs writer
        let tickCumulative1 = toBN(0);
        let tickCumulative2 = tickCumulative1.add(arithmeticMeanTick1.mul(observationsDelta2));

        // formula = lastSecondsPLCX128 + (delta << 128) / (liquidity > 0 ? liquidity : 1)
        // lastSecondsPLCX128 = 0 because of initialize initializing it as 0, delta remains as it is, and liquidity is 0 due to our changes so it will always be
        // divided by 1
        // final formula = lastSecondsPLCX128 + (delta << 128) / 1, which in this case is 0 + (delta << 128)
        let secondsPerLiquidityCumulativeX128_1 = toBN(blockTimestamp1).shl(128);
        let secondsPerLiquidityCumulativeX128_2 = secondsPerLiquidityCumulativeX128_1.add(toBN(observationsDelta2).shl(128));

        let expectedObservation1 = [blockTimestamp1, tickCumulative1, secondsPerLiquidityCumulativeX128_1, true];
        let expectedObservation2 = [blockTimestamp2, tickCumulative2, secondsPerLiquidityCumulativeX128_2, true];

        await dataFeed.sendObservations(dummyAdapterForTest.address, RANDOM_CHAIN_ID, tokenA.address, tokenB.address, fee, secondsAgos);
        ({ oracleSidechain } = await getOracle(oracleFactory.address, tokenA.address, tokenB.address, fee));

        let observation1 = await oracleSidechain.observations(0);
        let observation2 = await oracleSidechain.observations(1);
        let lastTick = await oracleSidechain.lastTick();

        expect(observation1).to.eql(expectedObservation1);
        expect(observation2).to.eql(expectedObservation2);
        expect(lastTick).to.eq(arithmeticMeanTick2);
      });

      it('should bridge the data twice', async () => {
        await dataFeed.sendObservations(dummyAdapterForTest.address, RANDOM_CHAIN_ID, tokenA.address, tokenB.address, fee, secondsAgos);
        await evm.advanceTimeAndBlock(10);
        await dataFeed.sendObservations(dummyAdapterForTest.address, RANDOM_CHAIN_ID, tokenA.address, tokenB.address, fee, secondsAgos);
      });
    });
  });
});
