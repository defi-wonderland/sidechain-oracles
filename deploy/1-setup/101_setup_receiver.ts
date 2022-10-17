import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.companionNetworks['receiver'].getNamedAccounts();

  const txSettings = {
    from: deployer,
    gasLimit: 10e6,
    log: true,
  };

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
};

deployFunction.dependencies = ['deploy-connext-receiver-adapter', 'data-receiver'];
deployFunction.tags = ['whitelist-receiver-adapter', 'connext-setup'];
export default deployFunction;
