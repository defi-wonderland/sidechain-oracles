import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { verifyContractIfNeeded } from 'utils/deploy';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const ORACLE_SIDECHAIN = (await hre.deployments.get('OracleSidechain')).address;

  const CONSTRUCTOR_ARGS = [ORACLE_SIDECHAIN, deployer];
  const deploy = await hre.deployments.deploy('DataReceiver', {
    contract: 'solidity/contracts/DataReceiver.sol:DataReceiver',
    from: deployer,
    log: true,
    args: CONSTRUCTOR_ARGS,
  });

  await verifyContractIfNeeded(hre, deploy);
};

deployFunction.tags = ['deploy-data-receiver', 'data-receiver', 'sidechain', 'receiver'];

export default deployFunction;
