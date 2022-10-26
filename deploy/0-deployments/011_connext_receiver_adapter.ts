import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { domainId } from '../../utils/constants';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { connextHandler } = await hre.companionNetworks['receiver'].getNamedAccounts();

  const dataSender = await hre.deployments.get('ConnextSenderAdapter');
  const dataReceiver = await hre.companionNetworks['receiver'].deployments.get('DataReceiver');

  const ORIGIN_DOMAIN_ID = domainId[Number(await hre.getChainId())];

  const CONSTRUCTOR_ARGS = [dataReceiver.address, dataSender.address, ORIGIN_DOMAIN_ID, connextHandler];

  await hre.companionNetworks['receiver'].deployments.deploy('ConnextReceiverAdapter', {
    contract: 'solidity/contracts/bridges/ConnextReceiverAdapter.sol:ConnextReceiverAdapter',
    from: deployer,
    log: true,
    args: CONSTRUCTOR_ARGS,
  });
};

deployFunction.dependencies = ['data-receiver', 'connext-sender-adapter'];
deployFunction.tags = ['connext-receiver-adapter', 'connext-adapters'];

export default deployFunction;
