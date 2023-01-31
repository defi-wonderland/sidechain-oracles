import IUniswapV3Factory from '../../artifacts/@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol/IUniswapV3Factory.json';
import IUniswapV3Pool from '../../artifacts/@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { calculateSalt } from '../../test/utils/misc';
import { ZERO_ADDRESS } from '../../test/utils/constants';
import { TEST_FEE, UNI_V3_FACTORY } from '../../utils/constants';
import { getReceiverChainId } from '../../utils/deploy';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, tokenA, tokenB } = await hre.getNamedAccounts();
  const DESTINATION_CHAIN_ID = await getReceiverChainId(hre);

  const txSettings = {
    from: deployer,
    log: true,
  };

  await hre.deployments.save('UniswapV3Factory', {
    abi: IUniswapV3Factory.abi,
    address: UNI_V3_FACTORY,
  });

  const POOL_ADDRESS = await hre.deployments.read('UniswapV3Factory', 'getPool', tokenA, tokenB, TEST_FEE);
  if (ZERO_ADDRESS == POOL_ADDRESS) {
    console.log('Pool does not exist', tokenA, tokenB, TEST_FEE);
    return;
  }

  await hre.deployments.save('UniswapV3Pool', {
    abi: IUniswapV3Pool.abi,
    address: POOL_ADDRESS,
  });

  const salt = calculateSalt(tokenA, tokenB, TEST_FEE);

  const IS_WHITELISTED_PIPELINE = await hre.deployments.read('DataFeed', 'isWhitelistedPipeline', DESTINATION_CHAIN_ID, salt);
  if (!IS_WHITELISTED_PIPELINE) {
    await hre.deployments.execute('DataFeed', txSettings, 'whitelistPipeline', DESTINATION_CHAIN_ID, salt);
  }
};

deployFunction.tags = ['pool-whitelisting'];
export default deployFunction;
