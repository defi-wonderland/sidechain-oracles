import IUniswapV3Factory from '../artifacts/@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol/IUniswapV3Factory.json';
import IUniswapV3Pool from '../artifacts/@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { TEST_FEE } from '../utils/constants';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const uniswapV3FactoryAddress = '0x1F98431c8aD98523631AE4a59f267346ea31F984';
  const addressZero = '0x0000000000000000000000000000000000000000';

  const txSettings = {
    from: deployer,
    gasLimit: 10e6,
    log: true,
  };

  await hre.deployments.save('UniV3Factory', {
    abi: IUniswapV3Factory.abi,
    address: uniswapV3FactoryAddress,
  });

  /* DEPLOY POOL */

  const tokenA = await hre.deployments.get('TokenA');
  const tokenB = await hre.deployments.get('TokenB');

  let UNI_V3_POOL_ADDRESS = await hre.deployments.read('UniV3Factory', 'getPool', tokenA.address, tokenB.address, TEST_FEE);
  const poolExists = UNI_V3_POOL_ADDRESS != addressZero;

  if (!poolExists) {
    await hre.deployments.execute('UniV3Factory', txSettings, 'createPool', tokenA.address, tokenB.address, TEST_FEE);
    UNI_V3_POOL_ADDRESS = await hre.deployments.read('UniV3Factory', 'getPool', tokenA.address, tokenB.address, TEST_FEE);
  }

  await hre.deployments.save('UniV3Pool', {
    abi: IUniswapV3Pool.abi,
    address: UNI_V3_POOL_ADDRESS,
  });

  /* INITIALIZE POOL */

  let poolSlot0 = await hre.deployments.read('UniV3Pool', 'slot0');

  if (!poolSlot0.unlocked) {
    const sqrtPriceX96 = '79230197817658830592443'; // ~ 1=1
    await hre.deployments.execute('UniV3Pool', txSettings, 'initialize', sqrtPriceX96);
    await hre.deployments.execute('UniV3Pool', txSettings, 'increaseObservationCardinalityNext', 64);
  }
};
deployFunction.dependencies = ['test-tokens'];
deployFunction.tags = ['create-pool', 'token-actions'];
export default deployFunction;
