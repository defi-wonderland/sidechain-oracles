import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const txSettings = {
    from: deployer,
    gasLimit: 10e6,
    log: true,
  };

  const receiverAdapter = await hre.companionNetworks['receiver'].deployments.get('ConnextReceiverAdapter');

  const IS_WHITELISTED_ADAPTER = await hre.deployments.read('DataReceiver', txSettings, 'whitelistedAdapters', receiverAdapter.address);
  if (!IS_WHITELISTED_ADAPTER) {
    const WHITELIST_ADAPTER_ARGS = [receiverAdapter.address, true];
    await hre.deployments.execute('DataReceiver', txSettings, 'whitelistAdapter', ...WHITELIST_ADAPTER_ARGS);
  }
};

deployFunction.dependencies = ['deploy-connext-receiver-adapter'];
deployFunction.tags = ['whitelist-receiver-adapter', 'receiver-stage-2'];
export default deployFunction;
