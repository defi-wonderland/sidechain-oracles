import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, kp3rV1 } = await hre.getNamedAccounts();

  const txSettings = {
    from: deployer,
    log: true,
  };

  const IS_KEEPER = await hre.deployments.read('Keep3r', 'isKeeper', deployer);
  if (!IS_KEEPER) {
    const CAN_ACTIVATE_AFTER = await hre.deployments.read('Keep3r', 'canActivateAfter', deployer, kp3rV1);
    if (CAN_ACTIVATE_AFTER == 0) {
      await hre.deployments.execute('Keep3r', txSettings, 'bond', kp3rV1, 0);
    }
    const BLOCK_TIMESTAMP = (await hre.ethers.provider.getBlock('latest')).timestamp;
    if (BLOCK_TIMESTAMP < CAN_ACTIVATE_AFTER) {
      console.log('Must wait to activate until', CAN_ACTIVATE_AFTER.toString());
      return process.exit(1);
    }
    await hre.deployments.execute('Keep3r', txSettings, 'activate', kp3rV1);
  }
};

deployFunction.dependencies = ['setup-keep3r-job'];
deployFunction.tags = ['setup-keeper'];
export default deployFunction;
