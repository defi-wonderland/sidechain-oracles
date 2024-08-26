import IUniswapV3Factory from '../../artifacts/@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol/IUniswapV3Factory.json';
import IUniswapV3Pool from '../../artifacts/@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ZERO_ADDRESS } from '../../test/utils/constants';
import { TEST_FEE } from '../../utils/constants';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { tokenA, tokenB, uniV3Factory } = await hre.getNamedAccounts();

  await hre.deployments.save('UniswapV3Factory', {
    abi: IUniswapV3Factory.abi,
    address: uniV3Factory,
  });

  const POOL_ADDRESS = await hre.deployments.read('UniswapV3Factory', 'getPool', tokenA, tokenB, TEST_FEE);
  if (ZERO_ADDRESS == POOL_ADDRESS) {
    console.log('Pool does not exist', tokenA, tokenB, TEST_FEE);
    console.log('Run "deploy-pool" tag to create one');
    return process.exit(1);
  }

  await hre.deployments.save('UniswapV3Pool', {
    abi: IUniswapV3Pool.abi,
    address: POOL_ADDRESS,
  });
};

deployFunction.tags = ['save-pool'];
export default deployFunction;
