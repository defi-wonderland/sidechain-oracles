import OracleSidechain from '../../artifacts/solidity/contracts/OracleSidechain.sol/OracleSidechain.json';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { verifyContractByAddress } from '../../utils/deploy';
import { TEST_FEE } from '../../utils/constants';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, tokenA, tokenB } = await hre.companionNetworks['sender'].getNamedAccounts();

  const txSettings = {
    from: deployer,
    log: true,
  };

  const ORACLE_ADDRESS = await hre.deployments.read('OracleFactory', 'getPool(address,address,uint24)', tokenA, tokenB, TEST_FEE);
  await hre.deployments.save('OracleSidechain', {
    abi: OracleSidechain.abi,
    address: ORACLE_ADDRESS,
  });
  await verifyContractByAddress(hre, ORACLE_ADDRESS);

  await hre.deployments.execute('OracleSidechain', txSettings, 'initializePoolInfo', tokenA, tokenB, TEST_FEE);
};

deployFunction.tags = ['save-oracle'];

export default deployFunction;
