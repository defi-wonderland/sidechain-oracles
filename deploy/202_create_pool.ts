import IUniswapV3Factory from '../artifacts/@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol/IUniswapV3Factory.json';
import IUniswapV3Pool from '../artifacts/@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const uniswapV3FactoryAddress = '0x1F98431c8aD98523631AE4a59f267346ea31F984';
  const addressZero = '0x0000000000000000000000000000000000000000';
  const fee = 10_000;

  const txSettings = {
    from: deployer,
    gasLimit: 10e6,
    log: true,
  };

  await hre.deployments.save('UniV3Factory', {
    abi: IUniswapV3Factory.abi,
    address: uniswapV3FactoryAddress,
  });

  const tokenA = await hre.deployments.get('TokenA');
  const tokenB = await hre.deployments.get('TokenB');

  let uniV3PoolAddress = await hre.deployments.read('UniV3Factory', 'getPool', tokenA.address, tokenB.address, fee);
  const poolExists = uniV3PoolAddress != addressZero;

  if (!poolExists) {
    await hre.deployments.execute('UniV3Factory', txSettings, 'createPool', tokenA.address, tokenB.address, fee);
    uniV3PoolAddress = await hre.deployments.read('UniV3Factory', 'getPool', tokenA.address, tokenB.address, fee);
  }

  await hre.deployments.save('UniV3Pool', {
    abi: IUniswapV3Pool.abi,
    address: uniV3PoolAddress,
  });

  let poolSlot0 = await hre.deployments.read('UniV3Pool', 'slot0');

  if (!poolSlot0.unlocked) {
    const sqrtPriceX96 = '79230197817658830592443'; // ~ 1=1
    await hre.deployments.execute('UniV3Pool', txSettings, 'initialize', sqrtPriceX96);
    await hre.deployments.execute('UniV3Pool', txSettings, 'increaseObservationCardinalityNext', 64);
  }

  console.log('Pool deployed at ', uniV3PoolAddress);
};
deployFunction.dependencies = [];
deployFunction.tags = ['execute', 'create-pool', 'mainnet', 'sender-actions', 'pool-actions'];
export default deployFunction;
