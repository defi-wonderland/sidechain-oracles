import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const txSettings = {
    from: deployer,
    log: true,
  };

  const dataFeedKeeper = await hre.deployments.get('DataFeedKeeper');

  const SET_DATA_FEED_KEEPER = await hre.deployments.read('DataFeed', 'keeper');
  if (dataFeedKeeper.address.toLocaleLowerCase() !== SET_DATA_FEED_KEEPER.toLocaleLowerCase()) {
    await hre.deployments.execute('DataFeed', txSettings, 'setKeeper', dataFeedKeeper.address);
  }
};

deployFunction.dependencies = ['data-feed', 'data-feed-keeper'];
deployFunction.tags = ['setup-data-feed-keeper'];
export default deployFunction;
