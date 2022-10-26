import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { verifyContract } from 'utils/deploy';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const connextReceiverAdapter = await hre.deployments.get('ConnextReceiverAdapter');
  await verifyContract(hre, connextReceiverAdapter);
};

deployFunction.tags = ['verify-connext-receiver'];

export default deployFunction;
