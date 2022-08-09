import { IChainIdDataRecord } from './types';

export const TEST_FEE = 10_000;

// CONNEXT DEPLOYMENTS
export const RINKEBY_ORIGIN_DOMAIN_CONNEXT = 1111;
export const GOERLI_DESTINATION_DOMAIN_CONNEXT = 3331;
export const RECEIVER_DESTINATION_DOMAIN_CONNEXT = 3331;
export const SENDER_DESTINATION_DOMAIN_CONNEXT = 1111;

export const CONNEXT_RINKEBY_ADDRESS = '0x2307Ed9f152FA9b3DcDfe2385d279D8C2A9DF2b0';
export const CONNEXT_GOERLI_ADDRESS = '0xEC3A723DE47a644b901DC269829bf8718F175EBF';

export const chainIdData: IChainIdDataRecord = {
  4: {
    domainIdDestination: 3331, // If rinkeby is sender, this field would be the domain Id of the receiver
    chainName: 'rinkeby',
    connextHandler: '0x4cAA6358a3d9d1906B5DABDE60A626AAfD80186F',
  },
  5: {
    domainIdOrigin: 1111, // If goerli is receiver, this field would be the domain Id of the sender
    chainName: 'goerli',
    connextHandler: '0x6c9a905Ab3f4495E2b47f5cA131ab71281E0546e',
  },
};
