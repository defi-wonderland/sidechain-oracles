import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const txSettings = {
    from: deployer,
    log: true,
  };

  const dataFeedStrategy = await hre.deployments.get('DataFeedStrategy');

  const SET_DATA_FEED_STRATEGY = await hre.deployments.read('DataFeed', 'strategy');
  if (dataFeedStrategy.address.toLocaleLowerCase() !== SET_DATA_FEED_STRATEGY.toLocaleLowerCase()) {
    await hre.deployments.execute('DataFeed', txSettings, 'setStrategy', dataFeedStrategy.address);
  }
};

deployFunction.dependencies = ['data-feed-strategy'];
deployFunction.tags = ['setup-strategy'];
export default deployFunction;
