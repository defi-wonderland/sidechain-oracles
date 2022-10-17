import { IDomainIDRecord } from './types';

export const TEST_FEE = 10_000;

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
  connextHandler: {
    5: '0x6F9F801CeE214Cf6dCf216Cc0FFEC3D908f15A12',
    420: '0xac43de57EbD38f19b30ED443B6e8F1190Ff85809',
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
  5: 1735353714,
  420: 1735356532,
};
