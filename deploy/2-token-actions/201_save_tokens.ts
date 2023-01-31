import IERC20 from '../../artifacts/@openzeppelin/contracts/token/ERC20/IERC20.sol/IERC20.json';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { tokenA, tokenB } = await hre.getNamedAccounts();

  await hre.deployments.save('TokenA', {
    address: tokenA,
    abi: IERC20.abi,
  });

  await hre.deployments.save('TokenB', {
    address: tokenB,
    abi: IERC20.abi,
  });
};

deployFunction.tags = ['save-tokens'];
export default deployFunction;
