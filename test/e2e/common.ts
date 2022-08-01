import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import { getCreate2Address } from 'ethers/lib/utils';
import { JsonRpcSigner } from '@ethersproject/providers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import {
  DataReceiver,
  DataFeed,
  ConnextHandlerForTest,
  ExecutorForTest,
  ConnextSenderAdapter,
  ConnextReceiverAdapter,
  OracleFactory,
  OracleSidechain,
} from '@typechained';
import { getMainnetSdk } from '@dethcrypto/eth-sdk-client';
import { UniswapV3Pool } from '@eth-sdk-types';
import { wallet, evm } from '@utils';
import { UNISWAP_V3_K3PR_ADDRESS, KP3R, WETH, FEE, KP3R_WHALE_ADDRESS, WETH_WHALE_ADDRESS } from '@utils/constants';
import { toBN } from '@utils/bn';
import { calculateSalt } from '@utils/misc';
import { RINKEBY_ORIGIN_DOMAIN_CONNEXT } from 'utils/constants';

export async function setupContracts(): Promise<{
  stranger: SignerWithAddress;
  deployer: SignerWithAddress;
  governance: SignerWithAddress;
  uniswapV3K3PR: UniswapV3Pool;
  dataReceiver: DataReceiver;
  oracleFactory: OracleFactory;
  oracleSidechain: OracleSidechain;
  dataFeed: DataFeed;
  connextHandler: ConnextHandlerForTest;
  executor: ExecutorForTest;
  connextSenderAdapter: ConnextSenderAdapter;
  connextReceiverAdapter: ConnextReceiverAdapter;
}> {
  let currentNonce;
  const [, stranger, deployer, governance] = await ethers.getSigners();
  const uniswapV3K3PR = getMainnetSdk(stranger).uniswapV3Pool.attach(UNISWAP_V3_K3PR_ADDRESS);
  const dataReceiverFactory = await ethers.getContractFactory('DataReceiver');
  const dataFeedFactory = await ethers.getContractFactory('DataFeed');
  const connextHandlerFactory = await ethers.getContractFactory('ConnextHandlerForTest');
  const executorFactory = await ethers.getContractFactory('ExecutorForTest');
  const connextSenderAdapterFactory = await ethers.getContractFactory('ConnextSenderAdapter');
  const connextReceiverAdapterFactory = await ethers.getContractFactory('ConnextReceiverAdapter');
  const oracleFactoryFactory = await ethers.getContractFactory('OracleFactory');

  currentNonce = await ethers.provider.getTransactionCount(deployer.address);
  const precalculatedDataReceiverAddress = ethers.utils.getContractAddress({ from: deployer.address, nonce: currentNonce + 1 });

  const oracleFactory = (await oracleFactoryFactory
    .connect(deployer)
    .deploy(governance.address, precalculatedDataReceiverAddress)) as OracleFactory;
  const dataReceiver = (await dataReceiverFactory.connect(deployer).deploy(governance.address, oracleFactory.address)) as DataReceiver;
  const dataFeed = (await dataFeedFactory.connect(deployer).deploy(governance.address)) as DataFeed;

  currentNonce = await ethers.provider.getTransactionCount(deployer.address);
  const precalculatedExecutorAddress = ethers.utils.getContractAddress({ from: deployer.address, nonce: currentNonce + 1 });

  const connextHandler = (await connextHandlerFactory.connect(deployer).deploy(precalculatedExecutorAddress)) as ConnextHandlerForTest;
  const executor = (await executorFactory.connect(deployer).deploy(connextHandler.address)) as ExecutorForTest;
  const connextSenderAdapter = (await connextSenderAdapterFactory
    .connect(deployer)
    .deploy(connextHandler.address, dataFeed.address)) as ConnextSenderAdapter;
  const connextReceiverAdapter = (await connextReceiverAdapterFactory
    .connect(deployer)
    .deploy(
      dataReceiver.address,
      connextSenderAdapter.address,
      RINKEBY_ORIGIN_DOMAIN_CONNEXT,
      connextHandler.address
    )) as ConnextReceiverAdapter;

  const salt = calculateSalt(KP3R, WETH, FEE);
  const ORACLE_INIT_CODE_HASH = await dataReceiver.ORACLE_INIT_CODE_HASH();
  const oracleSidechainAddress = getCreate2Address(oracleFactory.address, salt, ORACLE_INIT_CODE_HASH);
  const oracleSidechain = (await ethers.getContractAt('OracleSidechain', oracleSidechainAddress)) as OracleSidechain;

  return {
    stranger,
    deployer,
    governance,
    uniswapV3K3PR,
    dataReceiver,
    oracleFactory,
    oracleSidechain,
    dataFeed,
    connextHandler,
    executor,
    connextSenderAdapter,
    connextReceiverAdapter,
  };
}

export async function getSecondsAgos(blockTimestamps: number[]): Promise<{ secondsAgos: number[] }> {
  let secondsNow = (await ethers.provider.getBlock('latest')).timestamp;
  secondsNow++;

  let secondsAgos: number[] = [];
  let secondsAgo: number;
  for (let i = 0; i < blockTimestamps.length; ++i) {
    secondsAgo = secondsNow - blockTimestamps[i];
    secondsAgos.push(secondsAgo);
  }

  // forces next block to use block.timestamp++
  await evm.advanceToTime(secondsNow);

  return { secondsAgos };
}

export async function observePool(
  pool: UniswapV3Pool,
  blockTimestamps: number[],
  lastBlockTimestampBridged: number,
  lastTickCumulativeBridged: BigNumber
): Promise<{
  secondsAgosDeltas: number[];
  tickCumulatives: BigNumber[];
  tickCumulativesDeltas: BigNumber[];
  arithmeticMeanTicks: BigNumber[];
}> {
  let { secondsAgos } = await getSecondsAgos(blockTimestamps);

  let isDiscontinuous = lastBlockTimestampBridged < blockTimestamps[0] && lastBlockTimestampBridged != 0;

  let secondsAgosDeltas: number[] = [];
  let secondsAgosDelta = 0;
  if (isDiscontinuous) {
    secondsAgosDelta = blockTimestamps[0] - lastBlockTimestampBridged;
  }
  secondsAgosDeltas.push(secondsAgosDelta);
  for (let i = 0; i < secondsAgos.length - 1; ++i) {
    secondsAgosDelta = secondsAgos[i] - secondsAgos[i + 1];
    secondsAgosDeltas.push(secondsAgosDelta);
  }

  let [tickCumulatives] = await pool.observe(secondsAgos);

  let tickCumulativesDeltas: BigNumber[] = [];
  let tickCumulativesDelta = toBN(0);
  if (isDiscontinuous) {
    tickCumulativesDelta = tickCumulatives[0].sub(lastTickCumulativeBridged);
  }
  tickCumulativesDeltas.push(tickCumulativesDelta);
  for (let i = 0; i < tickCumulatives.length - 1; ++i) {
    tickCumulativesDelta = tickCumulatives[i + 1].sub(tickCumulatives[i]);
    tickCumulativesDeltas.push(tickCumulativesDelta);
  }

  let arithmeticMeanTicks: BigNumber[] = [];
  let arithmeticMeanTick = toBN(0);
  if (isDiscontinuous) {
    arithmeticMeanTick = tickCumulativesDeltas[0].div(secondsAgosDeltas[0]);
    if (tickCumulativesDeltas[0].isNegative() && !tickCumulativesDeltas[0].mod(secondsAgosDeltas[0]).isZero()) {
      arithmeticMeanTick = arithmeticMeanTick.sub(1);
    }
  }
  arithmeticMeanTicks.push(arithmeticMeanTick);
  for (let i = 1; i < tickCumulatives.length; ++i) {
    arithmeticMeanTick = tickCumulativesDeltas[i].div(secondsAgosDeltas[i]);
    if (tickCumulativesDeltas[i].isNegative() && !tickCumulativesDeltas[i].mod(secondsAgosDeltas[i]).isZero()) {
      arithmeticMeanTick = arithmeticMeanTick.sub(1);
    }
    arithmeticMeanTicks.push(arithmeticMeanTick);
  }

  return {
    secondsAgosDeltas,
    tickCumulatives,
    tickCumulativesDeltas,
    arithmeticMeanTicks,
  };
}

export function calculateOracleObservations(
  blockTimestamps: number[],
  arithmeticMeanTicks: BigNumber[],
  lastBlockTimestampBridged: number,
  lastArithmeticMeanTickBridged: BigNumber,
  lastTickCumulative: BigNumber,
  lastSecondsPerLiquidityCumulativeX128: BigNumber
): { observationsDeltas: number[]; tickCumulatives: BigNumber[]; secondsPerLiquidityCumulativeX128s: BigNumber[] } {
  let isDiscontinuous = lastBlockTimestampBridged < blockTimestamps[0] && lastBlockTimestampBridged != 0;

  let observationsDeltas: number[] = [];
  let observationsDelta = 0;
  if (isDiscontinuous) {
    observationsDelta = blockTimestamps[0] - lastBlockTimestampBridged;
    observationsDeltas.push(observationsDelta);
  } else {
    observationsDeltas.push(observationsDelta);
    observationsDelta = blockTimestamps[1] - lastBlockTimestampBridged;
    observationsDeltas.push(observationsDelta);
  }
  for (let i = observationsDeltas.length; i < blockTimestamps.length; ++i) {
    observationsDelta = blockTimestamps[i] - blockTimestamps[i - 1];
    observationsDeltas.push(observationsDelta);
  }

  // tickCumulative in new observation formula = last tickCumulative + lastTick * delta
  let tickCumulatives: BigNumber[] = [];
  let tickCumulative = toBN(0);
  if (isDiscontinuous) {
    tickCumulative = lastTickCumulative.add(lastArithmeticMeanTickBridged.mul(observationsDeltas[0]));
    tickCumulatives.push(tickCumulative);
  } else {
    tickCumulatives.push(tickCumulative);
    tickCumulative = lastTickCumulative.add(lastArithmeticMeanTickBridged.mul(observationsDeltas[1]));
    tickCumulatives.push(tickCumulative);
  }
  for (let i = tickCumulatives.length; i < blockTimestamps.length; ++i) {
    tickCumulative = tickCumulative.add(arithmeticMeanTicks[i - 1].mul(observationsDeltas[i]));
    tickCumulatives.push(tickCumulative);
  }

  // formula = lastSecondsPLCX128 + (delta << 128) / (liquidity > 0 ? liquidity : 1)
  // liquidity is 0 due to our changes so it will always be divided by 1
  // final formula = lastSecondsPLCX128 + (delta << 128) / 1
  let secondsPerLiquidityCumulativeX128s: BigNumber[] = [];
  let secondsPerLiquidityCumulativeX128 = toBN(0);
  if (isDiscontinuous) {
    secondsPerLiquidityCumulativeX128 = lastSecondsPerLiquidityCumulativeX128.add(toBN(observationsDeltas[0]).shl(128));
    secondsPerLiquidityCumulativeX128s.push(secondsPerLiquidityCumulativeX128);
  } else {
    secondsPerLiquidityCumulativeX128s.push(secondsPerLiquidityCumulativeX128);
    secondsPerLiquidityCumulativeX128 = lastSecondsPerLiquidityCumulativeX128;
  }
  for (let i = 1; i < blockTimestamps.length; ++i) {
    secondsPerLiquidityCumulativeX128 = secondsPerLiquidityCumulativeX128.add(toBN(observationsDeltas[i]).shl(128));
    secondsPerLiquidityCumulativeX128s.push(secondsPerLiquidityCumulativeX128);
  }

  return {
    observationsDeltas,
    tickCumulatives,
    secondsPerLiquidityCumulativeX128s,
  };
}

export async function uniswapV3Swap(tokenIn: string, amountIn: BigNumber, tokenOut: string, fee: number) {
  let [, stranger] = await ethers.getSigners();
  let whale: JsonRpcSigner;
  let uniswapV3SwapRouter = getMainnetSdk(stranger).uniswapV3SwapRouter;
  if (tokenIn == KP3R) {
    whale = await wallet.impersonate(KP3R_WHALE_ADDRESS);
    let kp3r = getMainnetSdk(stranger).kp3r;
    await kp3r.connect(whale).approve(uniswapV3SwapRouter.address, amountIn);
  } else {
    whale = await wallet.impersonate(WETH_WHALE_ADDRESS);
    let weth = getMainnetSdk(stranger).weth;
    await weth.connect(whale).approve(uniswapV3SwapRouter.address, amountIn);
  }
  let secondsNow = (await ethers.provider.getBlock('latest')).timestamp + 3;
  await uniswapV3SwapRouter.connect(whale).exactInputSingle({
    tokenIn: tokenIn,
    tokenOut: tokenOut,
    fee: fee,
    recipient: whale._address,
    deadline: secondsNow,
    amountIn: amountIn,
    amountOutMinimum: 1,
    sqrtPriceLimitX96: 0,
  });
}
