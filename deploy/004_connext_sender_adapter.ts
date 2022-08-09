import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getChainId, getDataFromChainId, verifyContractIfNeeded } from '../utils/deploy';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const DATA_FEED = (await hre.deployments.get('DataFeed')).address;
  const CHAIN_ID = await getChainId(hre);
  const { connextHandler } = await getDataFromChainId(CHAIN_ID);
  const CONSTRUCTOR_ARGS = [connextHandler, DATA_FEED];

  const deploy = await hre.deployments.deploy('ConnextSenderAdapter', {
    contract: 'solidity/contracts/bridges/ConnextSenderAdapter.sol:ConnextSenderAdapter',
    from: deployer,
    log: true,
    args: CONSTRUCTOR_ARGS,
  });

  await verifyContractIfNeeded(hre, deploy);
};

deployFunction.dependencies = ['deploy-data-feed'];
deployFunction.tags = ['deploy-connext-sender-adapter', 'connext-sender-adapter', 'sender-stage-1'];

export default deployFunction;
