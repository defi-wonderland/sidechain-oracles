import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { verifyContractIfNeeded } from 'utils/deploy';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const oracleFactory = await hre.deployments.get('OracleFactory');

  const CONSTRUCTOR_ARGS = [deployer, oracleFactory.address];

  const deploy = await hre.deployments.deploy('DataReceiver', {
    contract: 'solidity/contracts/DataReceiver.sol:DataReceiver',
    from: deployer,
    log: true,
    args: CONSTRUCTOR_ARGS,
  });

  // if redeploys, should set the correct dataReceiver in the factory
  const dataReceiverAddress = (await hre.deployments.get('DataReceiver')).address;
  if (dataReceiverAddress != (await hre.deployments.read('OracleFactory', 'dataReceiver'))) {
    await hre.deployments.execute('OracleFactory', { from: deployer, log: true }, 'setDataReceiver', dataReceiverAddress);
  }

  await verifyContractIfNeeded(hre, deploy);
};

deployFunction.dependencies = ['deploy-oracle-factory'];
deployFunction.tags = ['deploy-data-receiver', 'data-receiver', 'receiver-stage-1'];

export default deployFunction;
