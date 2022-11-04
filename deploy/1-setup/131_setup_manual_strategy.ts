import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const txSettings = {
    from: deployer,
    log: true,
  };

  const SET_STRATEGY = await hre.deployments.read('DataFeed', 'strategy');
  if (deployer != SET_STRATEGY) {
    await hre.deployments.execute('DataFeed', txSettings, 'setStrategy', deployer);
  }
};

deployFunction.tags = ['setup-manual-strategy', 'test'];
export default deployFunction;
