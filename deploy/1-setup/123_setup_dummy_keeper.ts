import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const txSettings = {
    from: deployer,
    log: true,
  };
  const dummyAdapter = (await hre.deployments.get('DummyAdapterForTest')).address;

  const SET_DEFAULT_ADAPTER = await hre.deployments.read('DataFeedStrategy', 'defaultBridgeSenderAdapter');
  if (dummyAdapter != SET_DEFAULT_ADAPTER) {
    await hre.deployments.execute('DataFeedStrategy', txSettings, 'setDefaultBridgeSenderAdapter', dummyAdapter);
  }
};

deployFunction.dependencies = ['dummy-test-setup', 'test-pool-whitelisting'];
deployFunction.tags = ['dummy-keeper-setup'];
export default deployFunction;
