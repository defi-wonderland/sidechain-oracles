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

  const RECEIVER_CHAIN_ID = await getReceiverChainId(hre);

  const dataFeed = await hre.deployments.get('DataFeed');
  const senderAdapter = await hre.deployments.get('ConnextSenderAdapter');

  const SECONDS_AGOS = [10000, 5000, 0];
  const FETCH_OBSERVATION_ARGS = [salt, SECONDS_AGOS];
  const fetchTx = await hre.deployments.execute('DataFeed', txSettings, 'fetchObservations(bytes32,uint32[])', ...FETCH_OBSERVATION_ARGS);

  const dataFeedContract = await hre.ethers.getContractAt('DataFeed', dataFeed.address);
  const fetchData = dataFeedContract.interface.decodeEventLog('PoolObserved', fetchTx.logs![0].data);
  const SEND_OBSERVATION_ARGS = [senderAdapter.address, RECEIVER_CHAIN_ID, salt, fetchData._poolNonce, fetchData._observationsData];
  await hre.deployments.execute('DataFeed', txSettings, 'sendObservations', ...SEND_OBSERVATION_ARGS);

  // TODO: read event and log bridge txID for tracking
  // XCalled topic = 0x9ff13ab44d4ea07af1c3b3ffb93494b9e0e32bb1564d8ba56e62e7ee9b7489d3
  // console.log(event.data.transferId)
};

deployFunction.dependencies = ['connext-setup', 'setup-manual-strategy'];
deployFunction.tags = ['manual-send-test-observation'];
export default deployFunction;
