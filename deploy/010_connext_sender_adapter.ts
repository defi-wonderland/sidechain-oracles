import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { verifyContractIfNeeded } from '../utils/deploy';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, connextHandler } = await hre.getNamedAccounts();

  const dataFeed = await hre.deployments.get('DataFeed');

  const CONSTRUCTOR_ARGS = [connextHandler, dataFeed.address];

  const deploy = await hre.deployments.deploy('ConnextSenderAdapter', {
    contract: 'solidity/contracts/bridges/ConnextSenderAdapter.sol:ConnextSenderAdapter',
    from: deployer,
    log: true,
    args: CONSTRUCTOR_ARGS,
  });

  await verifyContractIfNeeded(hre, deploy);
};

deployFunction.dependencies = ['deploy-data-feed'];
deployFunction.tags = ['deploy-connext-sender-adapter', 'sender-stage-1'];

export default deployFunction;
