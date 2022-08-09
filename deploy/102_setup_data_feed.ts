import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { getAddressFromAbi, getChainId, getDataFromChainId, getReceiverChainId } from 'utils/deploy';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const txSettings = {
    from: deployer,
    gasLimit: 10e6,
    log: true,
  };
  const CHAIN_ID = await getChainId(hre);
  const RECEIVER_CHAIN_ID = await getReceiverChainId('deployments', 'receiver', '.chainId');
  const CONNEXT_SENDER = await getAddressFromAbi('deployments', 'sender', 'ConnextSenderAdapter.json');
  const CONNEXT_RECEIVER = await getAddressFromAbi('deployments', 'receiver', 'ConnextReceiverAdapter.json');
  const { domainIdDestination } = await getDataFromChainId(CHAIN_ID);

  // check to make sure we skip this deployment script if the chain is wrong, or if the contracts have not been yet deploy in both chains
  if (!CONNEXT_SENDER.exists || !CONNEXT_RECEIVER.exists || !RECEIVER_CHAIN_ID.exists) {
    throw new Error(
      'Make sure you have run the deployments in the correct order and that all of them have been deployed correctly. Instructions in the README'
    );
  }

  const CONNEXT_SENDER_ADDRESS = CONNEXT_SENDER.address;
  const WHITELIST_ADAPTER_ARGS = [CONNEXT_SENDER_ADDRESS, true];
  const SET_RECEIVER_ARGS = [CONNEXT_SENDER_ADDRESS, domainIdDestination, CONNEXT_RECEIVER.address];
  const SET_DESTINATION_DOMAIN_ID_ARGS = [CONNEXT_SENDER_ADDRESS, RECEIVER_CHAIN_ID.chainId, domainIdDestination];

  const isAdapterWhitelisted = await hre.deployments.read('DataFeed', txSettings, 'whitelistedAdapters', CONNEXT_SENDER_ADDRESS);
  const receiverAdapterSet = await hre.deployments.read('DataFeed', txSettings, 'receivers', CONNEXT_SENDER_ADDRESS, domainIdDestination);
  const destinationDomainSet = await hre.deployments.read(
    'DataFeed',
    txSettings,
    'destinationDomainIds',
    CONNEXT_SENDER_ADDRESS,
    RECEIVER_CHAIN_ID.chainId
  );

  if (!isAdapterWhitelisted) await hre.deployments.execute('DataFeed', txSettings, 'whitelistAdapter', ...WHITELIST_ADAPTER_ARGS);
  if (receiverAdapterSet !== CONNEXT_RECEIVER.address)
    await hre.deployments.execute('DataFeed', txSettings, 'setReceiver', ...SET_RECEIVER_ARGS);
  if (destinationDomainSet !== domainIdDestination)
    await hre.deployments.execute('DataFeed', txSettings, 'setDestinationDomainId', ...SET_DESTINATION_DOMAIN_ID_ARGS);
};

deployFunction.dependencies = ['connext-sender-adapter'];
deployFunction.tags = ['execute', 'setup-data-feed', 'mainnet', 'actions', 'sender-stage-2'];
export default deployFunction;
