import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import {
  DataReceiver,
  DataReceiver__factory,
  OracleSidechain,
  OracleSidechain__factory,
  ConnextHandlerForTest,
  ConnextHandlerForTest__factory,
  DataFeed,
  DataFeed__factory,
  ConnextSenderAdapter,
  ConnextSenderAdapter__factory,
} from '@typechained';
import { getMainnetSdk } from '@dethcrypto/eth-sdk-client';
import { UniswapV3Factory, UniswapV3Pool } from '@eth-sdk-types';
import { evm } from '@utils';
import { toBN } from '@utils/bn';
import { UNISWAP_V3_K3PR_ADDRESS } from '@utils/constants';
import { getNodeUrl } from 'utils/env';
import forkBlockNumber from './fork-block-numbers';
import { expect } from 'chai';

const randomDestinationDomain = 1111;
const mainnetOriginDomain = 1;

describe('@skip-on-coverage Data Bridging Flow', () => {
  let stranger: SignerWithAddress;
  let deployer: SignerWithAddress;
  let dataReceiver: DataReceiver;
  let dataReceiverFactory: DataReceiver__factory;
  let oracleSidechain: OracleSidechain;
  let oracleSidechainFactory: OracleSidechain__factory;
  let connextSenderAdapter: ConnextSenderAdapter;
  let connextSenderAdapterFactory: ConnextSenderAdapter__factory;
  let connextHandler: ConnextHandlerForTest;
  let connextHandlerFactory: ConnextHandlerForTest__factory;
  let dataFeed: DataFeed;
  let dataFeedFactory: DataFeed__factory;
  let uniswapV3Factory: UniswapV3Factory;
  let uniswapV3K3PR: UniswapV3Pool;
  let snapshotId: string;

  before(async () => {
    await evm.reset({
      jsonRpcUrl: getNodeUrl('ethereum'),
      blockNumber: forkBlockNumber.oracleSidechain,
    });
    [, stranger, deployer] = await ethers.getSigners();
    uniswapV3Factory = getMainnetSdk(stranger).uniswapV3Factory;
    uniswapV3K3PR = getMainnetSdk(stranger).uniswapV3Pool.attach(UNISWAP_V3_K3PR_ADDRESS);
    oracleSidechainFactory = await ethers.getContractFactory('OracleSidechain');
    oracleSidechain = await oracleSidechainFactory.connect(deployer).deploy();
    dataReceiverFactory = await ethers.getContractFactory('DataReceiver');
    dataReceiver = await dataReceiverFactory.connect(deployer).deploy(oracleSidechain.address);
    connextHandlerFactory = await ethers.getContractFactory('ConnextHandlerForTest');
    connextHandler = await connextHandlerFactory.connect(deployer).deploy(dataReceiver.address);
    connextSenderAdapterFactory = await ethers.getContractFactory('ConnextSenderAdapter');
    connextSenderAdapter = await connextSenderAdapterFactory.connect(deployer).deploy(connextHandler.address);
    dataFeedFactory = await ethers.getContractFactory('DataFeed');
    dataFeed = await dataFeedFactory.connect(deployer).deploy(connextSenderAdapter.address);
    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('observation bridging flow', () => {
    let blockTimestamp: number;
    let tick: BigNumber;
    let oracleDelta = 2;

    before(async () => {
      let [, , observationIndex, observationCardinality, , ,] = await uniswapV3K3PR.slot0();
      let tickCumulative;
      [blockTimestamp, tickCumulative, ,] = await uniswapV3K3PR.observations(observationIndex);
      let [blockTimestampBefore, tickCumulativeBefore, ,] = await uniswapV3K3PR.observations(
        (observationIndex + observationCardinality - 1) % observationCardinality
      );
      let mainnetDelta = blockTimestamp - blockTimestampBefore;
      tick = tickCumulative.sub(tickCumulativeBefore).div(mainnetDelta);
    });

    it.skip('should revert if the oracle is not initialized', async () => {
      await expect(
        dataFeed.sendObservation(dataReceiver.address, mainnetOriginDomain, randomDestinationDomain, uniswapV3K3PR.address)
      ).to.be.revertedWith('CustomError()');
    });

    context('when the oracle is initialized', () => {
      let initializeTimestamp: number;
      let initialTick = 50;

      beforeEach(async () => {
        initializeTimestamp = blockTimestamp - oracleDelta;
        await oracleSidechain.initialize(initializeTimestamp, initialTick);
        await oracleSidechain.increaseObservationCardinalityNext(2);
      });

      it('should bridge the data and add an observation correctly', async () => {
        // tickCumulative in new observation formula = last tickCumulative + tick * delta, in this case we can omit last.tickCumulative as it's 0
        // due to initialize() being the prev obs writer
        const currentTickCumulative = tick.mul(oracleDelta);

        // formula = lastSecondsPLCX128 + (delta << 128) / (liquidity > 0 ? liquidity : 1)
        // lastSecondsPLCX128 = 0 because of initiliaze initializing it as 0, delta remains as it is, and liquidity is 0 due to our changes so it will always be
        // divided by 1
        // final formula = lastSecondsPLCX128 + (delta << 128) / 1, which in this case is 0 + (delta << 128)
        const currentSecondsPerLiquidityCumulativeX128 = toBN(oracleDelta).shl(128);

        const expectedObservation = [blockTimestamp, currentTickCumulative, currentSecondsPerLiquidityCumulativeX128, true];
        await dataFeed.sendObservation(dataReceiver.address, mainnetOriginDomain, randomDestinationDomain, uniswapV3K3PR.address);
        expect(await oracleSidechain.observations(1)).to.deep.eq(expectedObservation);
      });
    });
  });
});
