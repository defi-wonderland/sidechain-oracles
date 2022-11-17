import IKeep3r from '../../artifacts/@defi-wonderland/keep3r-v2/solidity/interfaces/IKeep3r.sol/IKeep3r.json';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ZERO_ADDRESS } from '@utils/constants';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, keep3r, kp3rV1 } = await hre.getNamedAccounts();
  const strategyJob = await hre.deployments.get('StrategyJob');

  const txSettings = {
    from: deployer,
    log: true,
  };

  await hre.deployments.save('Keep3r', {
    address: keep3r,
    abi: IKeep3r.abi,
  });

  const IS_KEEPER = await hre.deployments.read('Keep3r', 'isKeeper', deployer);
  if (!IS_KEEPER) {
    await hre.deployments.execute('Keep3r', txSettings, 'bond', kp3rV1, 0);
    const BLOCK_TIMESTAMP = (await hre.ethers.provider.getBlock('latest')).timestamp;
    const CAN_ACTIVATE_AFTER = await hre.deployments.read('Keep3r', 'canActivateAfter', deployer, kp3rV1);
    if (BLOCK_TIMESTAMP < CAN_ACTIVATE_AFTER) {
      console.log('Must wait to activate until', CAN_ACTIVATE_AFTER);
      return process.exit(1);
    }
    await hre.deployments.execute('Keep3r', txSettings, 'activate', kp3rV1);
  }

  const JOB_OWNER = await hre.deployments.read('Keep3r', 'jobOwner', strategyJob.address);
  if (ZERO_ADDRESS == JOB_OWNER) {
    await hre.deployments.execute('Keep3r', txSettings, 'addJob', strategyJob.address);
  }
};

deployFunction.dependencies = ['setup-strategy', 'strategy-job'];
deployFunction.tags = ['setup-keep3r-job'];
export default deployFunction;
