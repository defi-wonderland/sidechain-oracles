import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { verifyContractIfNeeded } from 'utils/deploy';
import { ZERO_ADDRESS } from '@utils/constants';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, keep3r } = await hre.getNamedAccounts();

  const dataFeed = await hre.deployments.get('DataFeed');
  const CONSTRUCTOR_ARGS = [
    deployer,
    dataFeed.address,
    ZERO_ADDRESS, // defaultBridgeSenderAdapter
    300,
  ];

  const deploy = await hre.deployments.deploy('DataFeedKeeper', {
    contract: 'solidity/contracts/DataFeedKeeper.sol:DataFeedKeeper',
    from: deployer,
    log: true,
    args: CONSTRUCTOR_ARGS,
  });

  // NOTE: Mainnet Keep3r is hardcoded in Keep3rJob contract
  const SET_KEEP3R = await hre.deployments.read('DataFeedKeeper', 'keep3r');
  if (keep3r != SET_KEEP3R) {
    await hre.deployments.execute('DataFeedKeeper', { from: deployer, log: true }, 'setKeep3r', keep3r);
  }

  await verifyContractIfNeeded(hre, deploy);
};

deployFunction.tags = ['deploy-data-feed-keeper', 'data-feed-keeper', 'sender-stage-1'];

export default deployFunction;
