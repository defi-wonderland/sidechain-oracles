import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { verifyContractIfNeeded } from 'utils/deploy';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const maxUint256 = '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF';

  const tokenA = await hre.deployments.deploy('TokenA', {
    contract: 'solidity/contracts/for-test/ERC20ForTest.sol:ERC20ForTest',
    from: deployer,
    args: ['TokenA', 'TKN-A', deployer, maxUint256],
    log: true,
  });

  await verifyContractIfNeeded(hre, tokenA);

  const tokenB = await hre.deployments.deploy('TokenB', {
    contract: 'solidity/contracts/for-test/ERC20ForTest.sol:ERC20ForTest',
    from: deployer,
    args: ['TokenB', 'TKN-B', deployer, maxUint256],
    log: true,
  });

  await verifyContractIfNeeded(hre, tokenB);
};
deployFunction.dependencies = [];
deployFunction.tags = ['deploy', 'test-tokens', 'mainnet', 'sender-actions', 'pool-actions'];
export default deployFunction;
