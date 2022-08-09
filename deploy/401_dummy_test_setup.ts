import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const txSettings = {
    from: deployer,
    gasLimit: 10e6,
    log: true,
  };

  const RANDOM_CHAIN_ID = 42; // doesn't matter for dummy adapter

  const DUMMY_ADAPTER = (await hre.deployments.get('DummyAdapterForTest')).address;
  const DATA_RECEIVER = (await hre.deployments.get('DataReceiver')).address;

  const WHITELISTED_ADAPTER = await hre.deployments.read('DataReceiver', txSettings, 'whitelistedAdapters', DUMMY_ADAPTER);

  const WHITELIST_ADAPTER_ARGS = [DUMMY_ADAPTER, true];

  if (!WHITELISTED_ADAPTER) await hre.deployments.execute('DataReceiver', txSettings, 'whitelistAdapter', ...WHITELIST_ADAPTER_ARGS);

  const SET_RECEIVER_ARGS = [DUMMY_ADAPTER, RANDOM_CHAIN_ID, DATA_RECEIVER];
  const SET_DESTINATION_DOMAIN_ID_ARGS = [DUMMY_ADAPTER, RANDOM_CHAIN_ID, RANDOM_CHAIN_ID];

  const isAdapterWhitelisted = await hre.deployments.read('DataFeed', txSettings, 'whitelistedAdapters', DUMMY_ADAPTER);
  const receiverAdapterSet = await hre.deployments.read('DataFeed', txSettings, 'receivers', DUMMY_ADAPTER, RANDOM_CHAIN_ID);
  const destinationDomainSet = await hre.deployments.read('DataFeed', txSettings, 'destinationDomainIds', DUMMY_ADAPTER, RANDOM_CHAIN_ID);

  if (!isAdapterWhitelisted) await hre.deployments.execute('DataFeed', txSettings, 'whitelistAdapter', ...WHITELIST_ADAPTER_ARGS);
  if (receiverAdapterSet !== DATA_RECEIVER) await hre.deployments.execute('DataFeed', txSettings, 'setReceiver', ...SET_RECEIVER_ARGS);
  if (destinationDomainSet !== RANDOM_CHAIN_ID)
    await hre.deployments.execute('DataFeed', txSettings, 'setDestinationDomainId', ...SET_DESTINATION_DOMAIN_ID_ARGS);
};

deployFunction.dependencies = ['deploy-data-receiver', 'deploy-data-feed', 'deploy-dummy-adapter'];
deployFunction.tags = ['dummy-test-setup', 'test'];
export default deployFunction;
