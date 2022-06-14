import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getChainId, shouldVerifyContract } from '../utils/deploy';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const CHAIN_ID = await getChainId(hre);
  const RINKEBY_CHAIN_ID = 4;
  const GOERLI_CHAIN_ID = 5;
  const CONNEXT_RINKEBY_ADDRESS = '0x2307Ed9f152FA9b3DcDfe2385d279D8C2A9DF2b0';
  const CONNEXT_GOERLI_ADDRESS = '0xEC3A723DE47a644b901DC269829bf8718F175EBF';
  const CONSTRUCTOR_RINKEBY_ARGS = [CONNEXT_RINKEBY_ADDRESS];
  const CONSTRUCTOR_GOERLI_ARGS = [CONNEXT_GOERLI_ADDRESS];

  if (CHAIN_ID !== RINKEBY_CHAIN_ID && CHAIN_ID !== GOERLI_CHAIN_ID) {
    console.log('🛑Wrong Network. Skipping ConnextSenderAdapter deployment');
    return;
  }

  const CONSTRUCTOR_ARGS = CHAIN_ID === RINKEBY_CHAIN_ID ? CONSTRUCTOR_RINKEBY_ARGS : CONSTRUCTOR_GOERLI_ARGS;

  const deploy = await hre.deployments.deploy('ConnextSenderAdapter', {
    contract: 'solidity/contracts/bridges/ConnextSenderAdapter.sol:ConnextSenderAdapter',
    from: deployer,
    log: true,
    args: CONSTRUCTOR_ARGS,
  });

  if (await shouldVerifyContract(deploy)) {
    await hre.run('verify:verify', {
      address: deploy.address,
      constructorArguments: CONSTRUCTOR_ARGS,
    });
  }
};

deployFunction.tags = ['deploy-connext-sender-adapter', 'connext-sender-adapter'];

export default deployFunction;
