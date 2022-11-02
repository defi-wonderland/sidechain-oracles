import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const txSettings = {
    from: deployer,
    log: true,
  };

  const dataFeedStrategy = await hre.deployments.get('DataFeedStrategy');

  const SET_DATA_FEED_KEEPER = await hre.deployments.read('DataFeed', 'keeper');
  if (dataFeedStrategy.address.toLocaleLowerCase() !== SET_DATA_FEED_KEEPER.toLocaleLowerCase()) {
    await hre.deployments.execute('DataFeed', txSettings, 'setKeeper', dataFeedStrategy.address);
  }
};

deployFunction.dependencies = ['data-feed', 'data-feed-strategy'];
deployFunction.tags = ['setup-data-feed-strategy'];
export default deployFunction;
