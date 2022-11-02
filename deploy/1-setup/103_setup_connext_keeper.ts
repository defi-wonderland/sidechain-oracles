import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const txSettings = {
    from: deployer,
    log: true,
  };

  const connextSenderAdapter = await hre.deployments.get('ConnextSenderAdapter');

  const DATA_FEED_KEEPER = await hre.deployments.getOrNull('DataFeedStrategy');
  if (DATA_FEED_KEEPER) {
    const SET_DEFAULT_ADAPTER = await hre.deployments.read('DataFeedStrategy', 'defaultBridgeSenderAdapter');
    if (connextSenderAdapter.address != SET_DEFAULT_ADAPTER) {
      await hre.deployments.execute('DataFeedStrategy', txSettings, 'setDefaultBridgeSenderAdapter', connextSenderAdapter.address);
    }
  }
};

deployFunction.dependencies = ['setup-base-contracts', 'connext-receiver-adapter', 'pool-whitelisting'];
deployFunction.tags = ['connext-setup'];
export default deployFunction;
