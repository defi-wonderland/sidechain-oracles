import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { shouldVerifyContract } from 'utils/deploy';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const maxUint256 = '115792089237316195423570985008687907853269984665640564039457584007913129639935';

  const tokenA = await hre.deployments.deploy('TokenA', {
    contract: 'solidity/contracts/for-test/ERC20ForTest.sol:ERC20ForTest',
    from: deployer,
    args: ['TokenA', 'TKN-A', deployer, maxUint256],
    log: true,
  });

  if (await shouldVerifyContract(tokenA)) {
    await hre.run('verify:verify', {
      address: tokenA.address,
      constructorArguments: tokenA.args,
    });
  }

  const tokenB = await hre.deployments.deploy('TokenB', {
    contract: 'solidity/contracts/for-test/ERC20ForTest.sol:ERC20ForTest',
    from: deployer,
    args: ['TokenB', 'TKN-B', deployer, maxUint256],
    log: true,
  });

  if (await shouldVerifyContract(tokenB)) {
    await hre.run('verify:verify', {
      address: tokenB.address,
      constructorArguments: tokenB.args,
    });
  }
};
deployFunction.dependencies = [];
deployFunction.tags = ['deploy', 'test-tokens'];
export default deployFunction;
