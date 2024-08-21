import IUniswapV3Factory from '../../artifacts/@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol/IUniswapV3Factory.json';
import IUniswapV3Pool from '../../artifacts/@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { TEST_FEE } from '../../utils/constants';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, uniV3Factory } = await hre.getNamedAccounts();
  const addressZero = '0x0000000000000000000000000000000000000000';

  const txSettings = {
    from: deployer,
    log: true,
  };

  await hre.deployments.save('UniswapV3Factory', {
    abi: IUniswapV3Factory.abi,
    address: uniV3Factory,
  });

  /* DEPLOY POOL */

  const tokenA = await hre.deployments.get('TokenA');
  const tokenB = await hre.deployments.get('TokenB');

  let UNI_V3_POOL_ADDRESS = await hre.deployments.read('UniswapV3Factory', 'getPool', tokenA.address, tokenB.address, TEST_FEE);
  const poolExists = UNI_V3_POOL_ADDRESS != addressZero;

  if (!poolExists) {
    await hre.deployments.execute('UniswapV3Factory', txSettings, 'createPool', tokenA.address, tokenB.address, TEST_FEE);
    UNI_V3_POOL_ADDRESS = await hre.deployments.read('UniswapV3Factory', 'getPool', tokenA.address, tokenB.address, TEST_FEE);
  }

  await hre.deployments.save('UniswapV3Pool', {
    abi: IUniswapV3Pool.abi,
    address: UNI_V3_POOL_ADDRESS,
  });

  /* INITIALIZE POOL */

  let poolSlot0 = await hre.deployments.read('UniswapV3Pool', 'slot0');

  if (!poolSlot0.unlocked) {
    const sqrtPriceX96 = '79230197817658830592443'; // ~ 1=1
    await hre.deployments.execute('UniswapV3Pool', txSettings, 'initialize', sqrtPriceX96);
    await hre.deployments.execute('UniswapV3Pool', txSettings, 'increaseObservationCardinalityNext', 64);
  }
};

deployFunction.dependencies = ['save-tokens'];
deployFunction.tags = ['create-pool'];
export default deployFunction;
