import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const txSettings = {
    from: deployer,
    log: true,
  };

  // dummy adapter uses sender chainId
  const DUMMY_CHAIN_ID = await hre.getChainId();

  const dummyAdapter = (await hre.deployments.get('DummyAdapterForTest')).address;
  const dataReceiver = (await hre.deployments.get('DataReceiver')).address;

  const SET_RECEIVER = await hre.deployments.read('DataFeed', txSettings, 'receivers', dummyAdapter, DUMMY_CHAIN_ID);
  if (dataReceiver !== SET_RECEIVER) {
    const SET_RECEIVER_ARGS = [dummyAdapter, DUMMY_CHAIN_ID, dataReceiver];
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

  const DESTINATION_DOMAIN_ID = await hre.deployments.read('DataFeed', txSettings, 'destinationDomainIds', dummyAdapter, DUMMY_CHAIN_ID);
  if (DESTINATION_DOMAIN_ID != DUMMY_CHAIN_ID) {
    const SET_DESTINATION_DOMAIN_ID_ARGS = [dummyAdapter, DUMMY_CHAIN_ID, DUMMY_CHAIN_ID];
    await hre.deployments.execute('DataFeed', txSettings, 'setDestinationDomainId', ...SET_DESTINATION_DOMAIN_ID_ARGS);
  }
};

deployFunction.dependencies = ['dummy-adapter', 'test-pool-whitelisting'];
deployFunction.tags = ['dummy-test-setup'];
export default deployFunction;
