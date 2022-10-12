import ERC20 from '../../artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { tokenA, tokenB } = await hre.getNamedAccounts();

  await hre.deployments.save('TokenA', {
    address: tokenA,
    abi: ERC20.abi,
  });

  await hre.deployments.save('TokenB', {
    address: tokenB,
    abi: ERC20.abi,
  });
};

deployFunction.tags = ['save-tokens'];
export default deployFunction;
