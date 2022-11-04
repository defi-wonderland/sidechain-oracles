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
  const senderAdapter = await hre.deployments.get('ConnextSenderAdapter');
  const dataFeed = await hre.deployments.get('DataFeed');

  const dataFeedContract = await hre.ethers.getContractAt('DataFeed', dataFeed.address);
  const filter = dataFeedContract.filters.PoolObserved();

  const blockNumber = (await hre.ethers.provider.getBlock('latest')).number;
  const events: any[] = await dataFeedContract.queryFilter(filter, blockNumber - 1000);
  const fetchData = events[events.length - 1].args;

  const SEND_OBSERVATION_ARGS = [senderAdapter.address, RECEIVER_CHAIN_ID, salt, fetchData._poolNonce, fetchData._observationsData];
  await hre.deployments.execute('DataFeed', txSettings, 'sendObservations', ...SEND_OBSERVATION_ARGS);
};

deployFunction.dependencies = ['connext-setup'];
deployFunction.tags = ['bridge-observation'];
export default deployFunction;
