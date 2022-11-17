import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  await hre.deployments.deploy('DummyAdapterForTest', {
    contract: 'solidity/for-test/DummyAdapterForTest.sol:DummyAdapterForTest',
    from: deployer,
    log: true,
  });
};

deployFunction.dependencies = ['base-contracts'];
deployFunction.tags = ['dummy-adapter'];

export default deployFunction;
