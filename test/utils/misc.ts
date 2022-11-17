import { keccak256, defaultAbiCoder, solidityKeccak256, getCreate2Address, randomBytes, hexlify } from 'ethers/lib/utils';

export const sortTokens = (tokens: string[]): string[] => {
  return tokens.sort();
};

/*
  Same consideration here. This is not generic. It'll only work for address, address, uint24 as inputs.
  Modify it accordingly if inputs change.
*/
export const calculateSalt = (tokenA: string, tokenB: string, fee: number): string => {
  const [token0, token1] = sortTokens([tokenA, tokenB]);
  return keccak256(defaultAbiCoder.encode(['address', 'address', 'uint24'], [token0, token1, fee]));
};

export const getInitCodeHash = (creationCode: string): string => {
  return solidityKeccak256(['bytes'], [creationCode]);
};

export { getCreate2Address };

export const getObservedHash = (salt: string, nonce: number, observationsData: number[][]): string => {
  return keccak256(defaultAbiCoder.encode(['bytes32', 'uint24', '(uint32,int24)[]'], [salt, nonce, observationsData]));
};

export const getRandomBytes32 = (): string => {
  return hexlify(randomBytes(32));
};
