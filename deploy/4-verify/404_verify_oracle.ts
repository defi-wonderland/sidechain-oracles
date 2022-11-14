import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { verifyContractByAddress } from 'utils/deploy';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const oracleSidechain = await hre.deployments.get('OracleSidechain');
  await verifyContractByAddress(hre, oracleSidechain.address);
};

deployFunction.dependencies = ['save-oracle'];
deployFunction.tags = ['verify', 'verify-oracle'];

export default deployFunction;
