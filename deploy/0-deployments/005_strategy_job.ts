import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { ZERO_ADDRESS } from '@utils/constants';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, keep3r } = await hre.getNamedAccounts();

  const dataFeed = await hre.deployments.get('DataFeed');
  const dataFeedStrategy = await hre.deployments.get('DataFeedStrategy');
  const CONSTRUCTOR_ARGS = [
    deployer,
    dataFeedStrategy.address,
    dataFeed.address,
    ZERO_ADDRESS, // defaultBridgeSenderAdapter
  ];

  await hre.deployments.deploy('StrategyJob', {
    contract: 'solidity/contracts/StrategyJob.sol:StrategyJob',
    from: deployer,
    log: true,
    args: CONSTRUCTOR_ARGS,
  });

  // NOTE: Mainnet Keep3r is hardcoded in Keep3rJob contract
  const SET_KEEP3R = await hre.deployments.read('StrategyJob', 'keep3r');
  if (keep3r != SET_KEEP3R) {
    await hre.deployments.execute('StrategyJob', { from: deployer, log: true }, 'setKeep3r', keep3r);
  }
};

deployFunction.dependencies = ['data-feed', 'data-feed-strategy'];
deployFunction.tags = ['strategy-job'];

export default deployFunction;
