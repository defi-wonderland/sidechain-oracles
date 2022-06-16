import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import {
  DataReceiver,
  DataReceiver__factory,
  OracleSidechain,
  OracleSidechain__factory,
  ConnextHandlerForTest,
  ConnextHandlerForTest__factory,
  ManualDataFeed,
  ManualDataFeed__factory,
  ConnextSenderAdapter,
  ConnextSenderAdapter__factory,
} from '@typechained';
import { getMainnetSdk } from '@dethcrypto/eth-sdk-client';
import { UniswapV3Factory } from '@eth-sdk-types';
import { evm } from '@utils';
import { toBN } from '@utils/bn';
import { MIN_SQRT_RATIO } from '@utils/constants';
import { getNodeUrl } from 'utils/env';
import forkBlockNumber from './fork-block-numbers';
import { expect } from 'chai';

const tick = toBN(100);
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
  let manualDataFeed: ManualDataFeed;
  let manualDataFeedFactory: ManualDataFeed__factory;
  let uniswapV3Factory: UniswapV3Factory;
  let snapshotId: string;
  let blockTimestamp: number;

  before(async () => {
    await evm.reset({
      jsonRpcUrl: getNodeUrl('ethereum'),
      blockNumber: forkBlockNumber.oracleSidechain,
    });
    [, stranger, deployer] = await ethers.getSigners();
    uniswapV3Factory = getMainnetSdk(stranger).uniswapV3Factory;
    oracleSidechainFactory = await ethers.getContractFactory('OracleSidechain');
    oracleSidechain = await oracleSidechainFactory.connect(deployer).deploy();
    dataReceiverFactory = await ethers.getContractFactory('DataReceiver');
    dataReceiver = await dataReceiverFactory.connect(deployer).deploy(oracleSidechain.address);
    connextHandlerFactory = await ethers.getContractFactory('ConnextHandlerForTest');
    connextHandler = await connextHandlerFactory.connect(deployer).deploy(dataReceiver.address);
    connextSenderAdapterFactory = await ethers.getContractFactory('ConnextSenderAdapter');
    connextSenderAdapter = await connextSenderAdapterFactory.connect(deployer).deploy(connextHandler.address);
    manualDataFeedFactory = await ethers.getContractFactory('ManualDataFeed');
    manualDataFeed = await manualDataFeedFactory.connect(deployer).deploy(connextSenderAdapter.address);

    snapshotId = await evm.snapshot.take();
    blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('observation bridging flow', () => {
    context('when oracle is initialized', () => {
      let prevObservationTimestamp: number;
      let currentObservationTimestamp: number;
      let delta = 5000;
      beforeEach(async () => {
        oracleSidechain.connect(stranger).initialize(MIN_SQRT_RATIO);
        oracleSidechain.connect(stranger).increaseObservationCardinalityNext(2);
      });

      it('should bridge the data and add an observation correctly', async () => {
        prevObservationTimestamp = (await oracleSidechain.observations(0)).blockTimestamp;
        currentObservationTimestamp = prevObservationTimestamp + delta;
        await evm.advanceToTime(currentObservationTimestamp);

        // tickCumulative in new observation formula = last tickCumulative + tick * delta, in this case we can omit last.tickCumulative as it's 0
        // due to initialize() being the prev obs writer
        const currentTickCumulative = tick.mul(delta);

        // formula = lastSecondsPLCX128 + (delta << 128) / (liquidity > 0 ? liquidity : 1)
        // lastSecondsPLCX128 = 0 because of initiliaze initializing it as 0, delta remains as it is, and liquidity is 0 due to our changes so it will always be
        // divided by 1
        // final formula = lastSecondsPLCX128 + (delta << 128) / 1, which in this case is 0 + (delta << 128)
        const currentSecondsPerLiquidityCumulativeX128 = toBN(delta).shl(128);
        const expectedObservation = [currentObservationTimestamp, currentTickCumulative, currentSecondsPerLiquidityCumulativeX128, true];
        await manualDataFeed.sendObservation(dataReceiver.address, mainnetOriginDomain, randomDestinationDomain, tick);
        expect(await oracleSidechain.observations(1)).to.deep.eq(expectedObservation);
      });
    });
  });
});
