import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const txSettings = {
    from: deployer,
    gasLimit: 10e6,
    log: true,
  };

  const RANDOM_CHAIN_ID = await hre.companionNetworks['receiver'].getChainId();

  const dummyAdapter = (await hre.deployments.get('DummyAdapterForTest')).address;
  const dataReceiver = (await hre.deployments.get('DataReceiver')).address;

  const SET_RECEIVER = await hre.deployments.read('DataFeed', txSettings, 'receivers', dummyAdapter, RANDOM_CHAIN_ID);
  if (dataReceiver !== SET_RECEIVER) {
    const SET_RECEIVER_ARGS = [dummyAdapter, RANDOM_CHAIN_ID, dataReceiver];
    await hre.deployments.execute('DataFeed', txSettings, 'setReceiver', ...SET_RECEIVER_ARGS);
  }

  const IS_WHITELISTED_RECEIVER_ADAPTER = await hre.companionNetworks['receiver'].deployments.read(
    'DataReceiver',
    txSettings,
    'whitelistedAdapters',
    dummyAdapter
  );
  const WHITELIST_ADAPTER_ARGS = [dummyAdapter, true];
  if (!IS_WHITELISTED_RECEIVER_ADAPTER) {
    await hre.deployments.execute('DataReceiver', txSettings, 'whitelistAdapter', ...WHITELIST_ADAPTER_ARGS);
  }

  const IS_WHITELISTED_SENDER_ADAPTER = await hre.deployments.read('DataFeed', txSettings, 'whitelistedAdapters', dummyAdapter);
  if (!IS_WHITELISTED_SENDER_ADAPTER) {
    await hre.deployments.execute('DataFeed', txSettings, 'whitelistAdapter', ...WHITELIST_ADAPTER_ARGS);
  }

  const SET_DEFAULT_ADAPTER = await hre.deployments.read('DataFeedKeeper', 'defaultBridgeSenderAdapter');
  if (dummyAdapter != SET_DEFAULT_ADAPTER) {
    await hre.deployments.execute('DataFeedKeeper', txSettings, 'setDefaultBridgeSenderAdapter', dummyAdapter);
  }

  const DESTINATION_DOMAIN_ID = await hre.deployments.read('DataFeed', txSettings, 'destinationDomainIds', dummyAdapter, RANDOM_CHAIN_ID);
  if (DESTINATION_DOMAIN_ID !== RANDOM_CHAIN_ID) {
    const SET_DESTINATION_DOMAIN_ID_ARGS = [dummyAdapter, RANDOM_CHAIN_ID, RANDOM_CHAIN_ID];
    await hre.deployments.execute('DataFeed', txSettings, 'setDestinationDomainId', ...SET_DESTINATION_DOMAIN_ID_ARGS);
  }
};

deployFunction.dependencies = ['deploy-dummy-adapter', 'setup-data-feed-keeper', 'setup-test-keeper', 'pool-whitelisting'];
deployFunction.tags = ['dummy-test-setup', 'test'];
export default deployFunction;
