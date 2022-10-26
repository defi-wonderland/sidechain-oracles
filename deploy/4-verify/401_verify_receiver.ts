import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { verifyContract } from 'utils/deploy';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const oracleFactory = await hre.deployments.get('OracleFactory');
  await verifyContract(hre, oracleFactory);

  const dataReceiver = await hre.deployments.get('DataReceiver');
  await verifyContract(hre, dataReceiver);
};

deployFunction.tags = ['verify', 'verify-receiver'];

export default deployFunction;
