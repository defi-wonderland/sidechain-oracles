import { toBN } from '@utils/bn';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const MIN_SQRT_RATIO = toBN(4295128739);

  const txSettings = {
    from: deployer,
    gasLimit: 10e6,
    log: true,
  };

  let poolState = await hre.deployments.read('OracleSidechain', 'slot0');

  if (poolState.observationCardinality == 0) {
    await hre.deployments.execute('OracleSidechain', txSettings, 'initialize', MIN_SQRT_RATIO);
    await hre.deployments.execute('OracleSidechain', txSettings, 'increaseObservationCardinalityNext', 5);
  }
};

deployFunction.tags = ['deploy-oracle-sidechain', 'oracle-sidechain'];

export default deployFunction;
