import { toBN } from '@utils/bn';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const MIN_SQRT_RATIO = toBN(4295128739);
  const TEMP_TICK = 10000;
  const TEMP_TIMESTAMP = 1600000000;

  const txSettings = {
    from: deployer,
    gasLimit: 10e6,
    log: true,
  };

  let poolState = await hre.deployments.read('OracleSidechain', 'slot0');

  //TODO: erase when initialize is handled inside OracleLibrary
  if (poolState.observationCardinality == 0) {
    await hre.deployments.execute('OracleSidechain', txSettings, 'initialize', TEMP_TIMESTAMP, TEMP_TICK);
    await hre.deployments.execute('OracleSidechain', txSettings, 'increaseObservationCardinalityNext', 5);
  }
};

deployFunction.tags = ['deploy-oracle-sidechain', 'oracle-sidechain', 'sidechain'];

export default deployFunction;
