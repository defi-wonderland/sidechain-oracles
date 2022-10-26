import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const txSettings = {
    from: deployer,
    log: true,
  };

  const SET_KEEPER = await hre.deployments.read('DataFeed', 'keeper');
  if (deployer != SET_KEEPER) {
    await hre.deployments.execute('DataFeed', txSettings, 'setKeeper', deployer);
  }
};

deployFunction.tags = ['setup-manual-keeper', 'test'];
export default deployFunction;
