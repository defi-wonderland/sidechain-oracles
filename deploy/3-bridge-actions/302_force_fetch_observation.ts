import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { TEST_FEE } from '../../utils/constants';
import { calculateSalt } from '../../test/utils/misc';
import { strategySettings } from '../../utils/constants';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, tokenA, tokenB } = await hre.getNamedAccounts();
  const salt = calculateSalt(tokenA, tokenB, TEST_FEE);

  const chainId = Number(await hre.getChainId());
  const deploymentSettings = strategySettings[chainId];

  const txSettings = {
    from: deployer,
    log: true,
  };

  const BLOCK_TIMESTAMP = (await hre.ethers.provider.getBlock('latest')).timestamp;
  const FETCH_OBSERVATION_ARGS = [salt, BLOCK_TIMESTAMP - 1.01 * deploymentSettings.cooldown];
  await hre.deployments.execute('DataFeedStrategy', txSettings, 'forceFetchObservations(bytes32,uint32)', ...FETCH_OBSERVATION_ARGS);
};

deployFunction.dependencies = ['setup-strategy', 'pool-whitelisting'];
deployFunction.tags = ['force-fetch-observation'];
export default deployFunction;
