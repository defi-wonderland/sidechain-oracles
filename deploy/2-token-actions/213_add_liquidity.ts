import INFTPositionManager from '../../artifacts/solidity/for-test/UniswapV3Importer.sol/INFTPositionManager.json';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, BigNumber } from 'ethers';
import { bn } from '@utils';
import { TEST_FEE } from '../../utils/constants';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const uniswapV3PositionManagerAddress = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';
  const maxUint256 = ethers.constants.MaxUint256;

  const txSettings = {
    from: deployer,
    log: true,
  };

  const LIQUIDITY_IN_POOL = await hre.deployments.read('UniswapV3Pool', 'liquidity');
  if (LIQUIDITY_IN_POOL > 0) {
    return;
  }

  await hre.deployments.save('PositionManager', {
    abi: INFTPositionManager.abi,
    address: uniswapV3PositionManagerAddress,
  });

  const tokenA = await hre.deployments.get('TokenA');
  const tokenB = await hre.deployments.get('TokenB');
  const positionManager = await hre.deployments.get('PositionManager');

  const TOKEN_A_ALLOWANCE: BigNumber = await hre.deployments.read('TokenA', 'allowance', deployer, positionManager.address);
  const TOKEN_B_ALLOWANCE: BigNumber = await hre.deployments.read('TokenB', 'allowance', deployer, positionManager.address);

  // TODO: move to utils.approveIfNeeded('TokenA', spender)
  if (TOKEN_A_ALLOWANCE.lt(maxUint256.shr(1))) {
    await hre.deployments.execute('TokenA', txSettings, 'approve', positionManager.address, maxUint256);
  }
  if (TOKEN_B_ALLOWANCE.lt(maxUint256.shr(1))) {
    await hre.deployments.execute('TokenB', txSettings, 'approve', positionManager.address, maxUint256);
  }

  const lowerTick = -887000;
  const upperTick = 887000;

  // TODO: make fn to sort tokens
  let token0, token1: string;
  if (tokenA.address < tokenB.address) {
    token0 = tokenA.address;
    token1 = tokenB.address;
  } else {
    token0 = tokenB.address;
    token1 = tokenA.address;
  }

  const MINT_ARGS = [token0, token1, TEST_FEE, lowerTick, upperTick, bn.toUnit(10), bn.toUnit(10), 0, 0, deployer, Date.now() + 3600];

  await hre.deployments.execute('PositionManager', txSettings, 'mint', MINT_ARGS);
};

deployFunction.dependencies = ['create-pool'];
deployFunction.tags = ['add-liquidity', 'token-actions'];
export default deployFunction;
