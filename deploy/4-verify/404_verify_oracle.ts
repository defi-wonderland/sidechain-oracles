import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { verifyContract } from 'utils/deploy';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const oracleSidechain = await hre.deployments.get('OracleSidechain');
  await verifyContract(hre, oracleSidechain);
};

deployFunction.dependencies = ['save-oracle'];
deployFunction.tags = ['verify', 'verify-oracle'];

export default deployFunction;
