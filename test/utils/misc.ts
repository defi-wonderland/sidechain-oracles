import { defaultAbiCoder, getCreate2Address, keccak256, solidityKeccak256 } from 'ethers/lib/utils';
import OracleSidechainABI from '../../artifacts/solidity/contracts/OracleSidechain.sol/OracleSidechain.json';

export const getInitCodeHash = (): string => {
  const creationCode = OracleSidechainABI.bytecode;
  return solidityKeccak256(['bytes'], [creationCode]);
};

/*
  Bare in mind I didn't do this generic. If arguments passed into create2's deployment change,
  add and encode the new args accordingly.
  So instead of cardinality, you would add the new arg and change the encode function to include the new arg
*/
export const getCreate2AddressWithArgs = (factory: string, salt: string): string => {
  const creationCode = OracleSidechainABI.bytecode;
  const formattedArgs = solidityKeccak256(['bytes'], [creationCode]);
  return getCreate2Address(factory, salt, formattedArgs);
};

/*
  Same consideration here. This is not generic. It'll only work for address, address, uint24 as inputs.
  Modify it accordingly if inputs change.
*/
export const calculateSalt = (tokenA: string, tokenB: string, fee: number): string => {
  const [token0, token1] = sortTokens([tokenA, tokenB]);
  return keccak256(defaultAbiCoder.encode(['address', 'address', 'uint24'], [token0, token1, fee]));
};

export const sortTokens = (tokens: string[]): string[] => {
  return tokens.sort();
};
