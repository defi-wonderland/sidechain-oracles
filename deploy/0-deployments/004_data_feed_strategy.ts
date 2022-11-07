import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { strategySettings } from '../../utils/constants';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const chainId = Number(await hre.getChainId());
  const deploymentSettings = strategySettings[chainId];

  const dataFeed = await hre.deployments.get('DataFeed');
  // TODO: read strategy params from constants
  const CONSTRUCTOR_ARGS = [deployer, dataFeed.address, deploymentSettings];

  await hre.deployments.deploy('DataFeedStrategy', {
    contract: 'solidity/contracts/DataFeedStrategy.sol:DataFeedStrategy',
    from: deployer,
    log: true,
    args: CONSTRUCTOR_ARGS,
  });
};

deployFunction.dependencies = ['data-feed'];
deployFunction.tags = ['data-feed-strategy'];

export default deployFunction;
