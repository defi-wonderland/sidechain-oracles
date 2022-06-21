import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { shouldVerifyContract } from '../utils/deploy';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const deploy = await hre.deployments.deploy('DataFeed', {
    contract: 'solidity/contracts/DataFeed.sol:DataFeed',
    from: deployer,
    log: true,
    args: [deployer],
  });

  if (await shouldVerifyContract(deploy)) {
    await hre.run('verify:verify', {
      address: deploy.address,
      constructorArguments: deploy.args,
    });
  }
};

deployFunction.tags = ['deploy-data-feed', 'data-feed'];

export default deployFunction;
