import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { verifyContractIfNeeded } from 'utils/deploy';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const maxUint256 = '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF';

  const tokenA = await hre.deployments.deploy('TokenA', {
    contract: 'solidity/for-test/ERC20ForTest.sol:ERC20ForTest',
    from: deployer,
    args: ['TokenA', 'TKN-A', deployer, maxUint256],
    log: true,
  });

  await hre.deployments.deploy('TokenB', {
    contract: 'solidity/for-test/ERC20ForTest.sol:ERC20ForTest',
    from: deployer,
    args: ['TokenB', 'TKN-B', deployer, maxUint256],
    log: true,
  });

  // Only one needs to be verified
  await verifyContractIfNeeded(hre, tokenA);
};
deployFunction.dependencies = [];
deployFunction.tags = ['test-tokens', 'token-actions'];
export default deployFunction;
