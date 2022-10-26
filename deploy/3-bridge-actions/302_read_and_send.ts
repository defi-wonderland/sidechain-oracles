import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { TEST_FEE } from '../../utils/constants';
import { calculateSalt } from '../../test/utils/misc';
import { getReceiverChainId } from '../../utils/deploy';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, tokenA, tokenB } = await hre.getNamedAccounts();
  const salt = calculateSalt(tokenA, tokenB, TEST_FEE);

  const txSettings = {
    from: deployer,
    log: true,
  };

  const FETCH_TX_HASH = '0x3af13c372b185d3492164f3b3b5a7aabe4537a72a14fbf8cbc1ce0fefcf19e3d';

  const RECEIVER_CHAIN_ID = await getReceiverChainId(hre);
  const senderAdapter = await hre.deployments.get('ConnextSenderAdapter');
  const dataFeed = await hre.deployments.get('DataFeed');

  const fetchTx = await (await hre.ethers.provider.getTransaction(FETCH_TX_HASH)).wait();

  // if is not manual tx (dataFeedKeeper) read logIndex 1
  const SET_KEEPER = await hre.deployments.read('DataFeed', 'keeper');
  let logIndex = 0;
  if (SET_KEEPER != deployer) logIndex++;

  const fetchData = (await hre.ethers.getContractAt('DataFeed', dataFeed.address)).interface.decodeEventLog(
    'PoolObserved',
    fetchTx.logs![logIndex].data
  );

  console.log('Fetch tx hash:', FETCH_TX_HASH);
  console.log('Fetched data:', fetchData);

  const SEND_OBSERVATION_ARGS = [senderAdapter.address, RECEIVER_CHAIN_ID, salt, fetchData._poolNonce, fetchData._observationsData];
  await hre.deployments.execute('DataFeed', txSettings, 'sendObservations', ...SEND_OBSERVATION_ARGS);

  // TODO: read event and log bridge txID for tracking
  // XCalled topic = 0x9ff13ab44d4ea07af1c3b3ffb93494b9e0e32bb1564d8ba56e62e7ee9b7489d3
  // console.log(event.data.transferId)
};

deployFunction.dependencies = ['connext-setup'];
deployFunction.tags = ['read-and-send-observation'];
export default deployFunction;
