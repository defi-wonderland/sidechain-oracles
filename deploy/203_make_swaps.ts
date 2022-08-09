// TODO: import from uniswap
import ISwapRouter from '../artifacts/@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol/ISwapRouter.json';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { bn } from '@utils';
import { BigNumber } from 'ethers';
import { TEST_FEE } from '../utils/constants';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const uniswapV3RouterAddress = '0xe592427a0aece92de3edee1f18e0157c05861564';
  const maxUint256 = BigNumber.from('115792089237316195423570985008687907853269984665640564039457584007913129639935');

  const txSettings = {
    from: deployer,
    gasLimit: 10e6,
    log: true,
  };

  await hre.deployments.save('SwapRouter', {
    abi: ISwapRouter.abi,
    address: uniswapV3RouterAddress,
  });

  const tokenA = await hre.deployments.get('TokenA');
  const tokenB = await hre.deployments.get('TokenB');
  const swapRouter = await hre.deployments.get('SwapRouter');

  const allowanceA: BigNumber = await hre.deployments.read('TokenA', 'allowance', deployer, swapRouter.address);
  const allowanceB: BigNumber = await hre.deployments.read('TokenA', 'allowance', deployer, swapRouter.address);

  if (allowanceA.lt(maxUint256.shr(1))) {
    await hre.deployments.execute('TokenA', txSettings, 'approve', swapRouter.address, maxUint256);
  }
  if (allowanceB.lt(maxUint256.shr(1))) {
    await hre.deployments.execute('TokenB', txSettings, 'approve', swapRouter.address, maxUint256);
  }

  const balanceA = await hre.deployments.read('TokenA', 'balanceOf', deployer);
  const balanceB = await hre.deployments.read('TokenB', 'balanceOf', deployer);
  let tokenIn: string;
  let tokenOut: string;
  if (balanceA >= balanceB) {
    (tokenIn = tokenA.address), (tokenOut = tokenB.address);
  } else {
    (tokenIn = tokenB.address), (tokenOut = tokenA.address);
  }

  const swapSettings = [tokenIn, tokenOut, TEST_FEE, deployer, Date.now() + 3600, bn.toUnit(1), 0, 0];

  await hre.deployments.execute('SwapRouter', txSettings, 'exactInputSingle', swapSettings);
};
deployFunction.dependencies = ['add-liquidity'];
deployFunction.tags = ['execute', 'make-swaps', 'mainnet', 'sender-actions', 'token-actions'];
export default deployFunction;
