import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import {
  OracleSidechain,
  DataReceiver,
  DataFeed,
  ConnextHandlerForTest,
  ExecutorForTest,
  ConnextSenderAdapter,
  ConnextReceiverAdapter,
} from '@typechained';
import { getMainnetSdk } from '@dethcrypto/eth-sdk-client';
import { UniswapV3Pool } from '@eth-sdk-types';
import { UNISWAP_V3_K3PR_ADDRESS } from '@utils/constants';
import { RINKEBY_ORIGIN_DOMAIN_CONNEXT } from 'utils/constants';

export async function setupContracts(): Promise<{
  stranger: SignerWithAddress;
  deployer: SignerWithAddress;
  governance: SignerWithAddress;
  uniswapV3K3PR: UniswapV3Pool;
  oracleSidechain: OracleSidechain;
  dataReceiver: DataReceiver;
  dataFeed: DataFeed;
  connextHandler: ConnextHandlerForTest;
  executor: ExecutorForTest;
  connextSenderAdapter: ConnextSenderAdapter;
  connextReceiverAdapter: ConnextReceiverAdapter;
}> {
  const [, stranger, deployer, governance] = await ethers.getSigners();
  const uniswapV3K3PR = getMainnetSdk(stranger).uniswapV3Pool.attach(UNISWAP_V3_K3PR_ADDRESS);

  const oracleSidechainFactory = await ethers.getContractFactory('OracleSidechain');
  const dataReceiverFactory = await ethers.getContractFactory('DataReceiver');
  const dataFeedFactory = await ethers.getContractFactory('DataFeed');
  const connextHandlerFactory = await ethers.getContractFactory('ConnextHandlerForTest');
  const executorFactory = await ethers.getContractFactory('ExecutorForTest');
  const connextSenderAdapterFactory = await ethers.getContractFactory('ConnextSenderAdapter');
  const connextReceiverAdapterFactory = await ethers.getContractFactory('ConnextReceiverAdapter');

  let currentNonce = await ethers.provider.getTransactionCount(deployer.address);
  const precalculatedDataReceiverAddress = ethers.utils.getContractAddress({ from: deployer.address, nonce: currentNonce + 1 });

  const oracleSidechain = (await oracleSidechainFactory.connect(deployer).deploy(precalculatedDataReceiverAddress)) as OracleSidechain;
  const dataReceiver = (await dataReceiverFactory.connect(deployer).deploy(oracleSidechain.address, governance.address)) as DataReceiver;
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

  return {
    stranger,
    deployer,
    governance,
    uniswapV3K3PR,
    oracleSidechain,
    dataReceiver,
    dataFeed,
    connextHandler,
    executor,
    connextSenderAdapter,
    connextReceiverAdapter,
  };
}
