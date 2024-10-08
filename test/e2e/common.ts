import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import { JsonRpcSigner } from '@ethersproject/providers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import {
  OracleFactory,
  OracleSidechain,
  DataReceiver,
  DataFeed,
  DataFeedStrategy,
  StrategyJob,
  ConnextHandlerForTest,
  ConnextSenderAdapter,
  ConnextReceiverAdapter,
  IERC20,
} from '@typechained';
import { getMainnetSdk } from '@dethcrypto/eth-sdk-client';
import { UniswapV3Factory, UniswapV3Pool, Keep3rV2 } from '@eth-sdk-types';
import { wallet, evm } from '@utils';
import { getCreate2Address } from '@utils/misc';
import {
  KP3R_WHALE_ADDRESS,
  USDC_WHALE_ADDRESS,
  WETH_WHALE_ADDRESS,
  KP3R_V1_PROXY_GOVERNANCE_ADDRESS,
  UNI_FACTORY,
  UNISWAP_V3_K3PR_ADDRESS,
  UNISWAP_V3_USDC_ADDRESS,
  KP3R,
  USDC,
  WETH,
  FEE,
  ORACLE_SIDECHAIN_CREATION_CODE,
} from '@utils/constants';
import { toBN, toUnit } from '@utils/bn';
import { calculateSalt, getInitCodeHash } from '@utils/misc';

const destinationDomain = 1111;

const minLastOracleDelta = 900;

const periodDuration = 1200;
const strategyCooldown = 3600;
const defaultTwapThreshold = 500;
const twapLength = 2400;

export async function setupContracts(): Promise<{
  stranger: SignerWithAddress;
  deployer: SignerWithAddress;
  governor: SignerWithAddress;
  oracleFactory: OracleFactory;
  dataReceiver: DataReceiver;
  dataFeed: DataFeed;
  dataFeedStrategy: DataFeedStrategy;
  strategyJob: StrategyJob;
  connextHandler: ConnextHandlerForTest;
  connextReceiverAdapter: ConnextReceiverAdapter;
  connextSenderAdapter: ConnextSenderAdapter;
}> {
  let currentNonce;
  const [, stranger, deployer, governor] = await ethers.getSigners();
  const oracleFactoryFactory = await ethers.getContractFactory('OracleFactory');
  const dataReceiverFactory = await ethers.getContractFactory('DataReceiver');
  const dataFeedFactory = await ethers.getContractFactory('DataFeed');
  const dataFeedStrategyFactory = await ethers.getContractFactory('DataFeedStrategy');
  const strategyJobFactory = await ethers.getContractFactory('StrategyJob');
  const connextHandlerFactory = await ethers.getContractFactory('ConnextHandlerForTest');
  const connextReceiverAdapterFactory = await ethers.getContractFactory('ConnextReceiverAdapter');
  const connextSenderAdapterFactory = await ethers.getContractFactory('ConnextSenderAdapter');

  currentNonce = await ethers.provider.getTransactionCount(deployer.address);
  const precalculatedDataReceiverAddress = ethers.utils.getContractAddress({ from: deployer.address, nonce: currentNonce + 1 });
  const oracleFactory = (await oracleFactoryFactory
    .connect(deployer)
    .deploy(governor.address, precalculatedDataReceiverAddress)) as OracleFactory;

  const dataReceiver = (await dataReceiverFactory.connect(deployer).deploy(governor.address, oracleFactory.address)) as DataReceiver;

  currentNonce = await ethers.provider.getTransactionCount(deployer.address);
  const precalculatedDataFeedStrategyAddress = ethers.utils.getContractAddress({ from: deployer.address, nonce: currentNonce + 1 });
  const dataFeed = (await dataFeedFactory
    .connect(deployer)
    .deploy(governor.address, precalculatedDataFeedStrategyAddress, UNI_FACTORY, minLastOracleDelta)) as DataFeed;

  const dataFeedStrategy = (await dataFeedStrategyFactory.connect(deployer).deploy(governor.address, dataFeed.address, UNI_FACTORY, {
    periodDuration,
    strategyCooldown,
    defaultTwapThreshold,
    twapLength,
  })) as DataFeedStrategy;

  currentNonce = await ethers.provider.getTransactionCount(deployer.address);
  const precalculatedConnextSenderAdapterAddress = ethers.utils.getContractAddress({ from: deployer.address, nonce: currentNonce + 2 });
  const strategyJob = (await strategyJobFactory
    .connect(deployer)
    .deploy(governor.address, dataFeedStrategy.address, dataFeed.address, precalculatedConnextSenderAdapterAddress)) as StrategyJob;

  const connextHandler = (await connextHandlerFactory.connect(deployer).deploy()) as ConnextHandlerForTest;

  const connextSenderAdapter = (await connextSenderAdapterFactory
    .connect(deployer)
    .deploy(dataFeed.address, connextHandler.address)) as ConnextSenderAdapter;

  const connextReceiverAdapter = (await connextReceiverAdapterFactory
    .connect(deployer)
    .deploy(
      dataReceiver.address,
      connextHandler.address,
      precalculatedConnextSenderAdapterAddress,
      destinationDomain
    )) as ConnextReceiverAdapter;

  return {
    stranger,
    deployer,
    governor,
    oracleFactory,
    dataReceiver,
    dataFeed,
    dataFeedStrategy,
    strategyJob,
    connextHandler,
    connextReceiverAdapter,
    connextSenderAdapter,
  };
}

export async function getEnvironment(): Promise<{
  uniswapV3Factory: UniswapV3Factory;
  uniswapV3Pool: UniswapV3Pool;
  tokenA: IERC20;
  tokenB: IERC20;
  fee: number;
  keep3rV2: Keep3rV2;
  keeper: JsonRpcSigner;
  kp3rProxyGovernor: JsonRpcSigner;
}> {
  const [signer] = await ethers.getSigners();
  const uniswapV3Factory = getMainnetSdk(signer).uniswapV3Factory;
  const uniswapV3Pool = getMainnetSdk(signer).uniswapV3Pool.attach(UNISWAP_V3_K3PR_ADDRESS);
  const tokenA = (await ethers.getContractAt('IERC20', WETH)) as IERC20;
  const tokenB = (await ethers.getContractAt('IERC20', KP3R)) as IERC20;
  const keep3rV2 = getMainnetSdk(signer).keep3rV2;
  const keeper = await wallet.impersonate(KP3R_WHALE_ADDRESS);
  const kp3rProxyGovernor = await wallet.impersonate(KP3R_V1_PROXY_GOVERNANCE_ADDRESS);
  await wallet.setBalance(KP3R_WHALE_ADDRESS, toUnit(10));
  await wallet.setBalance(kp3rProxyGovernor._address, toUnit(10));

  return { uniswapV3Factory, uniswapV3Pool, tokenA, tokenB, fee: FEE, keep3rV2, keeper, kp3rProxyGovernor };
}

export async function getOLDEnvironment(): Promise<{
  uniswapV3Factory: UniswapV3Factory;
  uniswapV3Pool: UniswapV3Pool;
  tokenA: IERC20;
  tokenB: IERC20;
  fee: number;
}> {
  const [signer] = await ethers.getSigners();
  const uniswapV3Factory = getMainnetSdk(signer).uniswapV3Factory;
  const uniswapV3Pool = getMainnetSdk(signer).uniswapV3Pool.attach(UNISWAP_V3_USDC_ADDRESS);
  const tokenA = (await ethers.getContractAt('IERC20', WETH)) as IERC20;
  const tokenB = (await ethers.getContractAt('IERC20', USDC)) as IERC20;

  return { uniswapV3Factory, uniswapV3Pool, tokenA, tokenB, fee: FEE };
}

export async function getOracle(
  factory: string,
  tokenA: string,
  tokenB: string,
  fee: number
): Promise<{
  oracleSidechain: OracleSidechain;
}> {
  const salt = calculateSalt(tokenA, tokenB, fee);
  const oracleSidechainAddress = getCreate2Address(factory, salt, getInitCodeHash(ORACLE_SIDECHAIN_CREATION_CODE));
  const oracleSidechain = (await ethers.getContractAt('OracleSidechain', oracleSidechainAddress)) as OracleSidechain;

  return {
    oracleSidechain,
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

// TODO: refactor to be able to use fn w/o lastObserved functionality
export async function observePool(
  pool: UniswapV3Pool | OracleSidechain,
  blockTimestamps: number[],
  lastBlockTimestampObserved: number,
  lastTickCumulativeObserved: BigNumber
): Promise<{
  secondsAgosDeltas: number[];
  tickCumulatives: BigNumber[];
  tickCumulativesDeltas: BigNumber[];
  arithmeticMeanTicks: BigNumber[];
}> {
  let { secondsAgos } = await getSecondsAgos(blockTimestamps);

  let isDiscontinuous = lastBlockTimestampObserved != 0;

  let secondsAgosDeltas: number[] = [];
  let secondsAgosDelta = 0;
  if (isDiscontinuous) {
    secondsAgosDelta = blockTimestamps[0] - lastBlockTimestampObserved;
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
    tickCumulativesDelta = tickCumulatives[0].sub(lastTickCumulativeObserved);
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
  lastBlockTimestampObserved: number,
  lastArithmeticMeanTickObserved: BigNumber,
  lastBlockTimestamp: number,
  lastTickCumulative: BigNumber,
  lastSecondsPerLiquidityCumulativeX128: BigNumber
): { observationsDeltas: number[]; tickCumulatives: BigNumber[]; secondsPerLiquidityCumulativeX128s: BigNumber[] } {
  let isDiscontinuous = lastBlockTimestampObserved != 0;

  let observationsDeltas: number[] = [];
  let observationsDelta = 0;
  if (isDiscontinuous) {
    observationsDelta = lastBlockTimestampObserved - lastBlockTimestamp;
    observationsDeltas.push(observationsDelta);
    observationsDelta = blockTimestamps[0] - lastBlockTimestampObserved;
    observationsDeltas.push(observationsDelta);
  } else {
    observationsDeltas.push(observationsDelta);
    observationsDelta = blockTimestamps[0] - lastBlockTimestamp;
    observationsDeltas.push(observationsDelta);
  }
  for (let i = observationsDeltas.length; i < blockTimestamps.length; ++i) {
    observationsDelta = blockTimestamps[i - 1] - blockTimestamps[i - 2];
    observationsDeltas.push(observationsDelta);
  }

  // tickCumulative in new observation formula = last tickCumulative + lastTick * delta
  let tickCumulatives: BigNumber[] = [];
  let tickCumulative = toBN(0);
  if (isDiscontinuous) {
    tickCumulative = lastTickCumulative.add(lastArithmeticMeanTickObserved.mul(observationsDeltas[0]));
    tickCumulatives.push(tickCumulative);
  } else {
    tickCumulatives.push(tickCumulative);
    tickCumulative = lastTickCumulative.add(lastArithmeticMeanTickObserved.mul(observationsDeltas[1]));
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
  } else if (tokenIn == USDC) {
    whale = await wallet.impersonate(USDC_WHALE_ADDRESS);
    let usdc = getMainnetSdk(stranger).usdc;
    await usdc.connect(whale).approve(uniswapV3SwapRouter.address, amountIn);
  } else {
    whale = await wallet.impersonate(WETH_WHALE_ADDRESS);
    let weth = getMainnetSdk(stranger).weth;
    await weth.connect(whale).approve(uniswapV3SwapRouter.address, amountIn);
  }
  await uniswapV3SwapRouter.connect(whale).exactInputSingle({
    tokenIn: tokenIn,
    tokenOut: tokenOut,
    fee: fee,
    recipient: whale._address,
    deadline: ethers.constants.MaxUint256,
    amountIn: amountIn,
    amountOutMinimum: 1,
    sqrtPriceLimitX96: 0,
  });
}
