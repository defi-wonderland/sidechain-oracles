import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { shouldVerifyContract } from '../utils/deploy';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const deploy = await hre.deployments.deploy('OracleSidechain', {
    contract: 'solidity/contracts/OracleSidechain.sol:OracleSidechain',
    from: deployer,
    log: true,
    args: [],
  });

  if (await shouldVerifyContract(deploy)) {
    await hre.run('verify:verify', {
      address: deploy.address,
      constructorArguments: [],
    });
  }
};

deployFunction.tags = ['deploy-oracle-sidechain', 'oracle-sidechain'];

export default deployFunction;
