import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { verifyContract } from 'utils/deploy';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const dataFeed = await hre.deployments.get('DataFeed');
  await verifyContract(hre, dataFeed, 'solidity/contracts/DataFeed.sol:DataFeed');
};

deployFunction.tags = ['verify', 'verify-sender'];

export default deployFunction;
