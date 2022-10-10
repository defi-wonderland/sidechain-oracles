import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { verifyContractIfNeeded } from '../utils/deploy';
import { domainId } from '../utils/constants';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, connext } = await hre.getNamedAccounts();

  const dataSender = await hre.companionNetworks['sender'].deployments.get('ConnextSenderAdapter');
  const dataReceiver = await hre.deployments.get('DataReceiver');

  const ORIGIN_DOMAIN_ID = domainId[Number(await hre.companionNetworks['sender'].getChainId())];

  const CONSTRUCTOR_ARGS = [dataReceiver.address, dataSender.address, ORIGIN_DOMAIN_ID, connext];

  const deploy = await hre.deployments.deploy('ConnextReceiverAdapter', {
    contract: 'solidity/contracts/bridges/ConnextReceiverAdapter.sol:ConnextReceiverAdapter',
    from: deployer,
    log: true,
    args: CONSTRUCTOR_ARGS,
    gasLimit: 10e6,
  });

  await verifyContractIfNeeded(hre, deploy);
};

deployFunction.dependencies = ['deploy-data-receiver'];
deployFunction.tags = ['deploy-connext-receiver-adapter', 'receiver-stage-2'];

export default deployFunction;
