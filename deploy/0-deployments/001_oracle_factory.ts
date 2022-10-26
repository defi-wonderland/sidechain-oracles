import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { ZERO_ADDRESS } from 'test/utils/constants';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  await hre.companionNetworks['receiver'].deployments.deploy('OracleFactory', {
    contract: 'solidity/contracts/OracleFactory.sol:OracleFactory',
    from: deployer,
    log: true,
    args: [deployer, ZERO_ADDRESS],
  });
};

deployFunction.tags = ['oracle-factory', 'base-contracts'];

export default deployFunction;
