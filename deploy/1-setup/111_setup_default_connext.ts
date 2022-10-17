import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const txSettings = {
    from: deployer,
    gasLimit: 10e6,
    log: true,
  };

  const connextSenderAdapter = await hre.deployments.get('ConnextSenderAdapter');

  const SET_DEFAULT_ADAPTER = await hre.deployments.read('DataFeedKeeper', 'defaultBridgeSenderAdapter');
  if (connextSenderAdapter.address != SET_DEFAULT_ADAPTER) {
    await hre.deployments.execute('DataFeedKeeper', txSettings, 'setDefaultBridgeSenderAdapter', connextSenderAdapter.address);
  }
};

deployFunction.dependencies = ['setup-base-contracts', 'deploy-connext-receiver-adapter', 'pool-whitelisting'];
deployFunction.tags = ['connext-setup'];
export default deployFunction;
