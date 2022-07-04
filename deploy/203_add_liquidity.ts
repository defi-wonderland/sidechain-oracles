// TODO: import from uniswap
import INFTPositionManager from '../artifacts/solidity/contracts/for-test/UniswapV3Importer.sol/INFTPositionManager.json';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { bn } from '@utils';
import { BigNumber } from 'ethers';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const uniswapV3PositionManagerAddress = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';
  const maxUint256 = BigNumber.from('115792089237316195423570985008687907853269984665640564039457584007913129639935');
  const fee = 10_000;

  const txSettings = {
    from: deployer,
    gasLimit: 10e6,
    log: true,
  };

  await hre.deployments.save('PositionManager', {
    abi: INFTPositionManager.abi,
    address: uniswapV3PositionManagerAddress,
  });
  const positionManager = await hre.deployments.get('PositionManager');

  const tokenA = await hre.deployments.get('TokenA');
  const tokenB = await hre.deployments.get('TokenB');

  const allowanceA: BigNumber = await hre.deployments.read('TokenA', 'allowance', deployer, positionManager.address);
  const allowanceB: BigNumber = await hre.deployments.read('TokenA', 'allowance', deployer, positionManager.address);

  if (allowanceA.lt(maxUint256.shr(1))) {
    await hre.deployments.execute('TokenA', txSettings, 'approve', positionManager.address, maxUint256);
  }
  if (allowanceB.lt(maxUint256.shr(1))) {
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

  const mintSettings = [token0, token1, fee, lowerTick, upperTick, bn.toUnit(10), bn.toUnit(10), 0, 0, deployer, Date.now() + 3600];

  await hre.deployments.execute('PositionManager', txSettings, 'mint', mintSettings);
};
deployFunction.dependencies = [];
deployFunction.tags = ['execute', 'add-liquidity', 'mainnet', 'sender-actions', 'pool-actions'];
export default deployFunction;
