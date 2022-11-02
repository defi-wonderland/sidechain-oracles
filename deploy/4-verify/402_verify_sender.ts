import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { verifyContract } from 'utils/deploy';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const dataFeed = await hre.deployments.get('DataFeed');
  await verifyContract(hre, dataFeed);

  const dataFeedStrategy = await hre.deployments.get('DataFeedStrategy');
  await verifyContract(hre, dataFeedStrategy);
};

deployFunction.tags = ['verify', 'verify-sender'];

export default deployFunction;
