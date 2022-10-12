import { ethers } from 'hardhat';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { verifyContractIfNeeded } from 'utils/deploy';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const dataReceiver = await hre.deployments.getOrNull('DataReceiver');
  let dataReceiverAddress: string;

  if (dataReceiver) {
    dataReceiverAddress = dataReceiver.address!;
  } else {
    const currentNonce = await ethers.provider.getTransactionCount(deployer);
    dataReceiverAddress = ethers.utils.getContractAddress({
      from: deployer,
      nonce: currentNonce + 1,
    });
  }

  const deploy = await hre.deployments.deploy('OracleFactory', {
    contract: 'solidity/contracts/OracleFactory.sol:OracleFactory',
    from: deployer,
    log: true,
    args: [deployer, dataReceiverAddress],
  });

  await verifyContractIfNeeded(hre, deploy);
};

deployFunction.tags = ['deploy-oracle-factory', 'oracle-sidechain', 'receiver-stage-1'];

export default deployFunction;
