import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { verifyContract } from 'utils/deploy';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const dummyAdapter = await hre.deployments.get('DummyAdapterForTest');
  await verifyContract(hre, dummyAdapter, 'solidity/for-test/DummyAdapterForTest.sol/DummyAdapterForTest');
};

deployFunction.tags = ['verify-dummy-adapter'];

export default deployFunction;
