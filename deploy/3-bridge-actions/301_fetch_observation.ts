import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { TEST_FEE } from '../../utils/constants';
import { calculateSalt } from '../../test/utils/misc';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, tokenA, tokenB } = await hre.getNamedAccounts();
  const salt = calculateSalt(tokenA, tokenB, TEST_FEE);

  const txSettings = {
    from: deployer,
    log: true,
  };

  const TIME_TRIGGER = 1;
  const FETCH_OBSERVATION_ARGS = [salt, TIME_TRIGGER];
  await hre.deployments.execute('DataFeedStrategy', txSettings, 'strategicFetchObservations(bytes32,uint8)', ...FETCH_OBSERVATION_ARGS);
};

deployFunction.dependencies = ['setup-strategy', 'pool-whitelisting'];
deployFunction.tags = ['fetch-observation'];
export default deployFunction;
