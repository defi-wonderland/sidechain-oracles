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
  const dataFeedContract = await hre.ethers.getContractAt('DataFeed', dataFeed.address);

  const TIME_TRIGGER = 1;
  const FETCH_OBSERVATION_ARGS = [salt, TIME_TRIGGER];
  await hre.deployments.execute('StrategyJob', txSettings, 'work(bytes32,uint8)', ...FETCH_OBSERVATION_ARGS);

  const lastPoolNonce = (await hre.deployments.read('DataFeed', 'lastPoolStateObserved', salt)).poolNonce;
  const evtFilter = dataFeedContract.filters.PoolObserved(salt, lastPoolNonce);
  const queryResults = await dataFeedContract.queryFilter(evtFilter);

  const fetchData = dataFeedContract.interface.decodeEventLog('PoolObserved', queryResults[0].data);

  const SEND_OBSERVATION_ARGS = [RECEIVER_CHAIN_ID, salt, lastPoolNonce, fetchData._observationsData];
  await hre.deployments.execute('StrategyJob', txSettings, 'work(uint32,bytes32,uint24,(uint32,int24)[])', ...SEND_OBSERVATION_ARGS);
};

deployFunction.dependencies = ['setup-connext-default', 'setup-keeper'];
deployFunction.tags = ['work-job'];
export default deployFunction;
