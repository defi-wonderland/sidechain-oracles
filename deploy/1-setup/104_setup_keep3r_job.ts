import IKeep3r from '../../artifacts/@defi-wonderland/keep3r-v2/solidity/interfaces/IKeep3r.sol/IKeep3r.json';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ZERO_ADDRESS } from '@utils/constants';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, keep3r } = await hre.getNamedAccounts();
  const strategyJob = await hre.deployments.get('StrategyJob');

  const txSettings = {
    from: deployer,
    log: true,
  };

  // NOTE: wrong ABI, need to update
  IKeep3r.abi.push({
    inputs: [],
    name: 'governor',
    outputs: [
      {
        internalType: 'address',
        name: '_governor',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  });

  await hre.deployments.save('Keep3r', {
    address: keep3r,
    abi: IKeep3r.abi,
  });

  const JOB_OWNER = await hre.deployments.read('Keep3r', 'jobOwner', strategyJob.address);
  if (ZERO_ADDRESS == JOB_OWNER) {
    await hre.deployments.execute('Keep3r', txSettings, 'addJob', strategyJob.address);
  }
};

deployFunction.dependencies = ['setup-strategy', 'strategy-job'];
deployFunction.tags = ['setup-keep3r-job'];
export default deployFunction;
