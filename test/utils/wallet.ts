import { ethers, network } from 'hardhat';
import { BigNumber, Wallet, constants } from 'ethers';
import { JsonRpcSigner } from '@ethersproject/providers';
import { getAddress } from 'ethers/lib/utils';
import { randomHex } from 'web3-utils';

export const impersonate = async (address: string): Promise<JsonRpcSigner> => {
  await network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [address],
  });
  return ethers.provider.getSigner(address);
};

export const generateRandom = async () => {
  const wallet = (await Wallet.createRandom()).connect(ethers.provider);
  await setBalance(wallet.address, constants.MaxUint256);
  return wallet;
};

export const setBalance = async (account: string, balance: BigNumber): Promise<void> => {
  await ethers.provider.send('hardhat_setBalance', [account, balance.toHexString().replace('0x0', '0x')]);
};

export const generateRandomAddress = () => {
  return getAddress(randomHex(20));
};
