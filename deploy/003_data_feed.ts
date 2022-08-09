import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { verifyContractIfNeeded } from 'utils/deploy';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const deploy = await hre.deployments.deploy('DataFeed', {
    contract: 'solidity/contracts/DataFeed.sol:DataFeed',
    from: deployer,
    log: true,
    args: [deployer],
  });

  await verifyContractIfNeeded(hre, deploy);
};

deployFunction.tags = ['deploy-data-feed', 'data-feed', 'sender-stage-1'];

export default deployFunction;
