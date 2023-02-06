import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { verifyContract } from 'utils/deploy';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const connextSenderAdapter = await hre.deployments.get('ConnextSenderAdapter');
  await verifyContract(hre, connextSenderAdapter, 'solidity/contracts/bridges/ConnextSenderAdapter.sol:ConnextSenderAdapter');
};

deployFunction.tags = ['verify-connext-sender'];

export default deployFunction;
