import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { verifyContractIfNeeded } from '../../utils/deploy';
import { domainId } from '../../utils/constants';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, connextHandler } = await hre.getNamedAccounts();

  const dataSender = await hre.deployments.get('ConnextSenderAdapter');
  const dataReceiver = await hre.companionNetworks['receiver'].deployments.get('DataReceiver');

  const ORIGIN_DOMAIN_ID = domainId[Number(await hre.getChainId())];

  const CONSTRUCTOR_ARGS = [dataReceiver.address, dataSender.address, ORIGIN_DOMAIN_ID, connextHandler];

  const deploy = await hre.companionNetworks['receiver'].deployments.deploy('ConnextReceiverAdapter', {
    contract: 'solidity/contracts/bridges/ConnextReceiverAdapter.sol:ConnextReceiverAdapter',
    from: deployer,
    log: true,
    args: CONSTRUCTOR_ARGS,
    gasLimit: 10e6,
  });

  // await verifyContractIfNeeded(hre, deploy);
};

deployFunction.dependencies = ['deploy-data-receiver', 'deploy-connext-sender-adapter'];
deployFunction.tags = ['deploy-connext-receiver-adapter'];

export default deployFunction;
