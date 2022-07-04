import { ethers } from 'hardhat';
import { DeployResult } from 'hardhat-deploy/dist/types';
import { HardhatNetworkUserConfig, HardhatRuntimeEnvironment } from 'hardhat/types';
import { chainIdData } from './constants';
import { IChainIdData } from './types';
import path from 'path';
import fs from 'fs';

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
    await hre.run('verify:verify', {
      address: deploy.address,
      constructorArguments: deploy.args,
    });
    return true;
  }
  return false;
};

export const verifyContract = async (hre: HardhatRuntimeEnvironment, deploy: DeployResult): Promise<void> => {
  await hre.run('verify:verify', {
    address: deploy.address,
    constructorArguments: deploy.args,
  });
};

export const waitDeployment = async (deploy: DeployResult, blocks: number) => {
  const txReceipt = await ethers.provider.getTransaction(deploy.receipt!.transactionHash);
  await txReceipt.wait(blocks);
};

export const getAddressFromAbi = async (...pathsFromRoot: string[]): Promise<{ exists: boolean; address: string | undefined }> => {
  const filePath = path.join(__dirname, '..', ...pathsFromRoot);
  if (fs.existsSync(filePath)) {
    const abi = fs.readFileSync(filePath, 'utf-8');
    const parsedAbi = JSON.parse(abi);
    return {
      exists: true,
      address: parsedAbi.address,
    };
  }
  return {
    exists: false,
    address: undefined,
  };
};

export const getReceiverChainId = async (...pathsFromRoot: string[]): Promise<{ exists: boolean; chainId: number | undefined }> => {
  const filePath = path.join(__dirname, '..', ...pathsFromRoot);
  if (fs.existsSync(filePath)) {
    const chainId = Number(fs.readFileSync(filePath, 'utf-8'));
    return {
      exists: true,
      chainId,
    };
  }
  return {
    exists: false,
    chainId: undefined,
  };
};

export const getDataFromChainId = async (chainId: number): Promise<IChainIdData> => {
  const data = chainIdData[chainId];
  if (data !== undefined) return data;
  throw new Error('Unexistent data, please complete information on utils/constants.ts');
};
