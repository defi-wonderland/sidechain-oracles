import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { getAddressFromAbi } from 'utils/deploy';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const txSettings = {
    from: deployer,
    gasLimit: 10e6,
    log: true,
  };

  const CONNEXT_SENDER = await getAddressFromAbi('deployments', 'sender', 'ConnextSenderAdapter.json');
  const CONNEXT_RECEIVER = await getAddressFromAbi('deployments', 'receiver', 'ConnextReceiverAdapter.json');

  // check to make sure we skip this deployment script if the chain is wrong, or if the contracts have not been yet deploy in both chains
  if (!CONNEXT_SENDER.exists || !CONNEXT_RECEIVER.exists) return;

  const WHITELISTED_ADAPTER = await hre.deployments.read('DataReceiver', txSettings, 'whitelistedAdapters', CONNEXT_RECEIVER.address);

  const WHITELIST_ADAPTER_ARGS = [CONNEXT_RECEIVER.address, true];

  if (!WHITELISTED_ADAPTER) await hre.deployments.execute('DataReceiver', txSettings, 'whitelistAdapter', ...WHITELIST_ADAPTER_ARGS);
};

deployFunction.dependencies = [];
deployFunction.tags = ['execute', 'whitelist-receiver-adapter', 'sidechain', 'receiver-actions'];
export default deployFunction;
