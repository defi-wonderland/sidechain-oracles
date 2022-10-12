import { IDomainIDRecord } from './types';

export const TEST_FEE = 10_000;
export const RANDOM_CHAIN_ID = 42;

export const UNI_V3_FACTORY = '0x1F98431c8aD98523631AE4a59f267346ea31F984';

export const addressRegistry = {
  // KEEP3R DEPLOYMENTS
  keep3r: {
    1: '0xeb02addCfD8B773A5FFA6B9d1FE99c566f8c44CC',
    5: '0x145d364e193204f8ff0a87b718938406595678dd',
  },
  keep3rGovernance: {
    1: '0x0D5Dc686d0a2ABBfDaFDFb4D0533E886517d4E83',
    5: '0xbc86642a7678A5e0E4Dd0d0617cbe234CEb048Fb',
  },
  kp3rV1: {
    1: '0x1ceb5cb57c4d4e2b2433641b95dd330a33185a44',
    5: '0x16F63C5036d3F48A239358656a8f123eCE85789C',
  },
  // CONNEXT DEPLOYMENTS
  connext: {
    5: '0xEC3A723DE47a644b901DC269829bf8718F175EBF',
  },
  connextHandler: {
    5: '0x6c9a905Ab3f4495E2b47f5cA131ab71281E0546e',
  },
  // TOKENS
  tokenA: {
    5: '0x16F63C5036d3F48A239358656a8f123eCE85789C',
  },
  tokenB: {
    5: '0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6',
  },
};

export const domainId: IDomainIDRecord = {
  4: 1111,
  5: 3331,
};
