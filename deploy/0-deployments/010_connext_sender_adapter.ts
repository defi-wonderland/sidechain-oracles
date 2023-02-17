import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, connextHandler } = await hre.getNamedAccounts();

  const dataFeed = await hre.deployments.get('DataFeed');

  const CONSTRUCTOR_ARGS = [dataFeed.address, connextHandler];

  await hre.deployments.deploy('ConnextSenderAdapter', {
    contract: 'solidity/contracts/bridges/ConnextSenderAdapter.sol:ConnextSenderAdapter',
    from: deployer,
    log: true,
    args: CONSTRUCTOR_ARGS,
  });
};

deployFunction.dependencies = ['data-feed'];
deployFunction.tags = ['connext-sender-adapter', 'connext-adapters'];

export default deployFunction;
