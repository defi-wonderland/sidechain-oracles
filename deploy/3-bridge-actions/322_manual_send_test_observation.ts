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

  const dataFeedContract = await hre.ethers.getContractAt('DataFeed', dataFeed.address);

  const SECONDS_AGOS = [3600, 1800, 0];
  const FETCH_OBSERVATION_ARGS = [salt, SECONDS_AGOS];
  await hre.deployments.execute('DataFeed', txSettings, 'fetchObservations(bytes32,uint32[])', ...FETCH_OBSERVATION_ARGS);

  const lastPoolNonce = (await hre.deployments.read('DataFeed', 'lastPoolStateObserved', salt)).poolNonce;
  const evtFilter = dataFeedContract.filters.PoolObserved(salt, lastPoolNonce);
  const queryResults = await dataFeedContract.queryFilter(evtFilter);

  const fetchData = dataFeedContract.interface.decodeEventLog('PoolObserved', queryResults[0].data);

  const SEND_OBSERVATION_ARGS = [senderAdapter.address, RECEIVER_CHAIN_ID, salt, lastPoolNonce, fetchData._observationsData];
  await hre.deployments.execute('DataFeed', txSettings, 'sendObservations', ...SEND_OBSERVATION_ARGS);
};

deployFunction.dependencies = ['connext-setup', 'setup-manual-strategy'];
deployFunction.tags = ['manual-send-test-observation'];
export default deployFunction;
