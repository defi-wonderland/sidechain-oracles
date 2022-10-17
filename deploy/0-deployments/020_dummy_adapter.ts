import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { verifyContractIfNeeded } from 'utils/deploy';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const deploy = await hre.deployments.deploy('DummyAdapterForTest', {
    contract: 'solidity/for-test/DummyAdapterForTest.sol:DummyAdapterForTest',
    from: deployer,
    log: true,
  });

  await verifyContractIfNeeded(hre, deploy);
};

deployFunction.dependencies = ['base-contracts'];
deployFunction.tags = ['deploy-dummy-adapter'];

export default deployFunction;
