import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const oracleFactory = await hre.companionNetworks['receiver'].deployments.get('OracleFactory');

  const CONSTRUCTOR_ARGS = [deployer, oracleFactory.address];

  const deploy = await hre.companionNetworks['receiver'].deployments.deploy('DataReceiver', {
    contract: 'solidity/contracts/DataReceiver.sol:DataReceiver',
    from: deployer,
    log: true,
    args: CONSTRUCTOR_ARGS,
  });

  // if redeploys, should set the correct dataReceiver in the factory
  const SET_DATA_RECEIVER = await hre.companionNetworks['receiver'].deployments.read('OracleFactory', 'dataReceiver');
  if (SET_DATA_RECEIVER != deploy.address) {
    await hre.companionNetworks['receiver'].deployments.execute(
      'OracleFactory',
      { from: deployer, log: true },
      'setDataReceiver',
      deploy.address
    );
  }
};

deployFunction.dependencies = ['oracle-factory'];
deployFunction.tags = ['data-receiver', 'base-contracts'];

export default deployFunction;
