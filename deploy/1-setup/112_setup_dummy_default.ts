import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const txSettings = {
    from: deployer,
    log: true,
  };

  const senderAdapter = await hre.deployments.get('DummyAdapterForTest');

  const SET_DEFAULT_SENDER_ADAPTER = await hre.deployments.read('StrategyJob', 'defaultBridgeSenderAdapter');
  if (senderAdapter.address != SET_DEFAULT_SENDER_ADAPTER) {
    await hre.deployments.execute('StrategyJob', txSettings, 'setDefaultBridgeSenderAdapter', senderAdapter.address);
  }
};

deployFunction.dependencies = ['dummy-test-setup', 'setup-keep3r-job'];
deployFunction.tags = ['setup-dummy-default'];
export default deployFunction;
