import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { shouldVerifyContract } from '../utils/deploy';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const ORACLE_SIDECHAIN = (await hre.deployments.get('OracleSidechain')).address;

  const CONSTRUCTOR_ARGS = [ORACLE_SIDECHAIN];
  const deploy = await hre.deployments.deploy('DataReceiver', {
    contract: 'solidity/contracts/DataReceiver.sol:DataReceiver',
    from: deployer,
    log: true,
    args: CONSTRUCTOR_ARGS,
  });

  if (await shouldVerifyContract(deploy)) {
    await hre.run('verify:verify', {
      address: deploy.address,
      constructorArguments: CONSTRUCTOR_ARGS,
    });
  }
};

deployFunction.tags = ['deploy-data-receiver', 'data-receiver'];

export default deployFunction;
