import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { domainId } from '../../utils/constants';
import { getReceiverChainId } from '../../utils/deploy';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const txSettings = {
    from: deployer,
    log: true,
  };

  const senderAdapter = await hre.deployments.get('ConnextSenderAdapter');
  const receiverAdapter = await hre.companionNetworks['receiver'].deployments.get('ConnextReceiverAdapter');

  const IS_WHITELISTED_ADAPTER = await hre.companionNetworks['receiver'].deployments.read(
    'DataReceiver',
    txSettings,
    'whitelistedAdapters',
    receiverAdapter.address
  );
  if (!IS_WHITELISTED_ADAPTER) {
    const WHITELIST_ADAPTER_ARGS = [receiverAdapter.address, true];
    await hre.companionNetworks['receiver'].deployments.execute('DataReceiver', txSettings, 'whitelistAdapter', ...WHITELIST_ADAPTER_ARGS);
  }

  const DESTINATION_CHAIN_ID = await getReceiverChainId(hre);
  const DESTINATION_DOMAIN_ID = domainId[Number(DESTINATION_CHAIN_ID)];

  const IS_WHITELISTED_SENDER_ADAPTER = await hre.deployments.read('DataFeed', txSettings, 'whitelistedAdapters', senderAdapter.address);
  if (!IS_WHITELISTED_SENDER_ADAPTER) {
    const WHITELIST_ADAPTER_ARGS = [senderAdapter.address, true];
    await hre.deployments.execute('DataFeed', txSettings, 'whitelistAdapter', ...WHITELIST_ADAPTER_ARGS);
  }

  const RECEIVER_ADAPTER = await hre.deployments.read('DataFeed', txSettings, 'receivers', senderAdapter.address, DESTINATION_DOMAIN_ID);
  if (RECEIVER_ADAPTER !== receiverAdapter.address) {
    const SET_RECEIVER_ARGS = [senderAdapter.address, DESTINATION_DOMAIN_ID, receiverAdapter.address];
    await hre.deployments.execute('DataFeed', txSettings, 'setReceiver', ...SET_RECEIVER_ARGS);
  }

  const SET_DESTINATION_DOMAIN_ID = await hre.deployments.read(
    'DataFeed',
    txSettings,
    'destinationDomainIds',
    senderAdapter.address,
    DESTINATION_CHAIN_ID
  );
  if (SET_DESTINATION_DOMAIN_ID !== DESTINATION_DOMAIN_ID) {
    const SET_DESTINATION_DOMAIN_ID_ARGS = [senderAdapter.address, DESTINATION_CHAIN_ID, DESTINATION_DOMAIN_ID];
    await hre.deployments.execute('DataFeed', txSettings, 'setDestinationDomainId', ...SET_DESTINATION_DOMAIN_ID_ARGS);
  }
};

deployFunction.dependencies = ['connext-receiver-adapter'];
deployFunction.tags = ['connext-setup'];
export default deployFunction;
