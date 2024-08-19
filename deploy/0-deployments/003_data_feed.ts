import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { dataFeedSettings } from '../../utils/constants';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, uniV3Factory } = await hre.getNamedAccounts();

  const chainId = Number(await hre.getChainId());
  const minLastOracleDelta = dataFeedSettings[chainId];

  const CONSTRUCTOR_ARGS = [deployer, deployer, uniV3Factory, minLastOracleDelta];

  await hre.deployments.deploy('DataFeed', {
    contract: 'solidity/contracts/DataFeed.sol:DataFeed',
    from: deployer,
    log: true,
    args: CONSTRUCTOR_ARGS,
  });
};

deployFunction.tags = ['data-feed', 'base-contracts'];

export default deployFunction;
