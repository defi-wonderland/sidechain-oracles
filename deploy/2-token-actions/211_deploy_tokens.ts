import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { verifyContractIfNeeded } from 'utils/deploy';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const bigUint256 = '0x0FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF';

  const tokenA = await hre.deployments.deploy('TokenA', {
    contract: 'solidity/for-test/ERC20ForTest.sol:ERC20ForTest',
    from: deployer,
    args: ['TokenA', 'TKN-A', deployer, bigUint256],
    log: true,
  });

  const tokenB = await hre.deployments.deploy('TokenB', {
    contract: 'solidity/for-test/ERC20ForTest.sol:ERC20ForTest',
    from: deployer,
    args: ['TokenB', 'TKN-B', deployer, bigUint256],
    log: true,
  });

  // Only one needs to be verified
  await verifyContractIfNeeded(hre, tokenA);

  console.log('Please register tokens in Hardhat named accounts: ', tokenA.address, tokenB.address);
};

deployFunction.tags = ['deploy-tokens'];
export default deployFunction;
