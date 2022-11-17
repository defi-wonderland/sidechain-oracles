import { TransactionResponse } from '@ethersproject/abstract-provider';
import { ContractInterface, Signer, Contract, ContractFactory } from 'ethers';
import { getStatic } from 'ethers/lib/utils';
import { deployments, ethers } from 'hardhat';

export const deploy = async (contract: ContractFactory, args: any[]): Promise<{ tx: TransactionResponse; contract: Contract }> => {
  const deploymentTransactionRequest = await contract.getDeployTransaction(...args);
  const deploymentTx = await contract.signer.sendTransaction(deploymentTransactionRequest);
  const contractAddress = getStatic<(deploymentTx: TransactionResponse) => string>(contract.constructor, 'getContractAddress')(deploymentTx);
  const deployedContract = getStatic<(contractAddress: string, contractInterface: ContractInterface, signer?: Signer) => Contract>(
    contract.constructor,
    'getContract'
  )(contractAddress, contract.interface, contract.signer);
  return {
    tx: deploymentTx,
    contract: deployedContract,
  };
};

export const getContractFromFixture = async (deploymentName: string, contractName: string = deploymentName): Promise<Contract> => {
  const deployment = await deployments.get(deploymentName);
  const contract = await ethers.getContractAt(contractName, deployment.address);
  return contract;
};
