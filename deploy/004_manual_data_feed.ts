import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { shouldVerifyContract } from '../utils/deploy';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const ORACLE_SIDECHAIN = (await hre.deployments.get('ConnextSenderAdapter')).address;

  const deploy = await hre.deployments.deploy('ManualDataFeed', {
    contract: 'solidity/contracts/ManualDataFeed.sol:ManualDataFeed',
    from: deployer,
    log: true,
    args: [ORACLE_SIDECHAIN],
  });

  if (await shouldVerifyContract(deploy)) {
    await hre.run('verify:verify', {
      address: deploy.address,
      constructorArguments: [ORACLE_SIDECHAIN],
    });
  }
};

deployFunction.tags = ['deploy-manual-data-feed', 'manual-data-feed'];

export default deployFunction;
