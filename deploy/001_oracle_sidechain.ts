import { ethers } from 'hardhat';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { verifyContractIfNeeded } from 'utils/deploy';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const currentNonce = await ethers.provider.getTransactionCount(deployer);
  const precalculatedDataReceiverAddress = await ethers.utils.getContractAddress({
    from: deployer,
    nonce: currentNonce + 1,
  });

  const deploy = await hre.deployments.deploy('OracleSidechain', {
    contract: 'solidity/contracts/OracleSidechain.sol:OracleSidechain',
    from: deployer,
    log: true,
    args: [precalculatedDataReceiverAddress],
  });

  console.log('The precalculated address of the data receiver is: ', precalculatedDataReceiverAddress);
  await verifyContractIfNeeded(hre, deploy);
};

deployFunction.tags = ['deploy-oracle-sidechain', 'oracle-sidechain', 'sidechain', 'receiver'];

export default deployFunction;
