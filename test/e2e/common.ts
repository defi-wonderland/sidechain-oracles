import { ethers } from 'hardhat';
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
import { ORACLE_INIT_CODE_HASH, UNISWAP_V3_K3PR_ADDRESS, KP3R, WETH, FEE } from '@utils/constants';
import { RINKEBY_ORIGIN_DOMAIN_CONNEXT } from 'utils/constants';
import { getCreate2Address } from 'ethers/lib/utils';
import { calculateSalt } from '@utils/misc';

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
