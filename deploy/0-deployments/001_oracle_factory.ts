import { ethers } from 'hardhat';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { verifyContractIfNeeded } from 'utils/deploy';
import { ZERO_ADDRESS } from 'test/utils/constants';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const dataReceiver = await hre.companionNetworks['receiver'].deployments.getOrNull('DataReceiver');
  let dataReceiverAddress: string;

  if (dataReceiver) {
    dataReceiverAddress = dataReceiver.address!;
  } else {
    dataReceiverAddress = ZERO_ADDRESS;
    // TODO: avoid pre-calculating addresses by companionNetwork nonce
    // const currentNonce = await ethers.provider.getTransactionCount(deployer);
    // ethers.utils.getContractAddress({
    //   from: deployer,
    //   nonce: currentNonce + 1,
    // });
  }

  const deploy = await hre.companionNetworks['receiver'].deployments.deploy('OracleFactory', {
    contract: 'solidity/contracts/OracleFactory.sol:OracleFactory',
    from: deployer,
    log: true,
    args: [deployer, ZERO_ADDRESS],
  });

  // TODO: fix contract verifications for hre.companionNetworks
  // await verifyContractIfNeeded(hre, deploy);
};

deployFunction.tags = ['deploy-oracle-factory', 'oracle-sidechain', 'base-contracts'];

export default deployFunction;
