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

  const SECONDS_AGOS = [10, 5, 0];
  const FETCH_OBSERVATION_ARGS = [salt, SECONDS_AGOS];

  await hre.deployments.execute('DataFeed', txSettings, 'fetchObservations(bytes32,uint32[])', ...FETCH_OBSERVATION_ARGS);
};

deployFunction.dependencies = ['setup-manual-strategy'];
deployFunction.tags = ['manual-fetch-observation'];
export default deployFunction;
