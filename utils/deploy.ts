import { ethers } from 'hardhat';
import { DeployResult, Deployment } from 'hardhat-deploy/dist/types';
import { HardhatNetworkUserConfig, HardhatRuntimeEnvironment } from 'hardhat/types';

let testChainId: number;

export const setTestChainId = (chainId: number): void => {
  testChainId = chainId;
};

export const getChainId = async (hre: HardhatRuntimeEnvironment): Promise<number> => {
  if (!!process.env.LOCAL_TEST) {
    if (!testChainId) throw new Error('Should specify chain id of test');
    return testChainId;
  }
  if (!!process.env.FORK) return getRealChainIdOfFork(hre);
  return parseInt(await hre.getChainId());
};

export const getRealChainIdOfFork = (hre: HardhatRuntimeEnvironment): number => {
  const config = hre.network.config as HardhatNetworkUserConfig;
  if (config.forking?.url.includes('eth')) return 1;
  if (config.forking?.url.includes('ftm') || config.forking?.url.includes('fantom')) return 250;
  if (config.forking?.url.includes('polygon')) return 137;
  if (config.forking?.url.includes('sepolia')) return 11155111;
  if (config.forking?.url.includes('optimisticSepolia')) return 11155420;
  throw new Error('Should specify chain id of fork');
};

export const shouldVerifyContract = async (deploy: DeployResult): Promise<boolean> => {
  if (process.env.FORK || process.env.TEST) return false;
  if (!deploy.newlyDeployed) return false;
  const txReceipt = await ethers.provider.getTransaction(deploy.receipt!.transactionHash);
  await txReceipt.wait(10);
  return true;
};

export const verifyContractIfNeeded = async (hre: HardhatRuntimeEnvironment, deploy: DeployResult): Promise<boolean> => {
  if (await shouldVerifyContract(deploy)) {
    await verifyContract(hre, deploy);
    return true;
  }
  return false;
};

export const verifyContract = async (hre: HardhatRuntimeEnvironment, deploy: DeployResult | Deployment, contract?: string): Promise<void> => {
  if (hre.network.config.chainId === 31337 || !hre.config.etherscan.apiKey) {
    return; // contract is deployed on local network or no apiKey is configured
  }
  try {
    await hre.run('verify:verify', {
      address: deploy.address,
      contract,
      constructorArguments: deploy.args,
    });
  } catch (err: any) {
    if (err.message.includes('Reason: Already Verified')) {
      console.log('Contract is already verified!');
    } else {
      console.log(err);
    }
  }
};

export const verifyContractByAddress = async (hre: HardhatRuntimeEnvironment, address: string, args?: [any]): Promise<void> => {
  const deploy = {
    address,
    args,
  } as DeployResult;
  await verifyContract(hre, deploy);
};

export const waitDeployment = async (deploy: DeployResult, blocks: number) => {
  const txReceipt = await ethers.provider.getTransaction(deploy.receipt!.transactionHash);
  await txReceipt.wait(blocks);
};

export const getReceiverChainId = async (hre: HardhatRuntimeEnvironment): Promise<string | void> => {
  const senderChainId = await hre.getChainId();
  const receiverChainId = await hre.companionNetworks['receiver'].getChainId();

  if (senderChainId != receiverChainId) return receiverChainId;
  // avoids `BridgeFacet__mustHaveRemote_destinationNotSupported` in local testing (chain id 11155111)
  return '11155420';
};
