import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  await hre.deployments.deploy('DataFeed', {
    contract: 'solidity/contracts/DataFeed.sol:DataFeed',
    from: deployer,
    log: true,
    args: [deployer, deployer],
  });
};

deployFunction.tags = ['data-feed', 'base-contracts'];

export default deployFunction;
