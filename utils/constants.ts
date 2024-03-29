import { IDomainIDRecord, IDataFeedSettingsRecord, IStrategySettingsRecord } from './types';

export const UNI_V3_FACTORY = '0x1F98431c8aD98523631AE4a59f267346ea31F984';

export const TEST_FEE = 10_000;

export const addressRegistry = {
  // KEEP3R DEPLOYMENTS
  keep3r: {
    1: '0xeb02addCfD8B773A5FFA6B9d1FE99c566f8c44CC',
    5: '0x85063437C02Ba7F4f82F898859e4992380DEd3bb',
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
    1: '0x8898B472C54c31894e3B9bb83cEA802a5d0e63C6',
    10: '0x8f7492DE823025b4CfaAB1D34c58963F2af5DEDA',
    137: '0x11984dc4465481512eb5b777E44061C158CF2259',
    5: '0xFCa08024A6D4bCc87275b1E4A1E22B71fAD7f649',
    420: '0x5Ea1bb242326044699C3d81341c5f535d5Af1504',
    80001: '0x2334937846Ab2A3FCE747b32587e1A1A2f6EEC5a',
  },
  // TOKENS
  tokenA: {
    1: '0x1ceb5cb57c4d4e2b2433641b95dd330a33185a44',
    5: '0x16F63C5036d3F48A239358656a8f123eCE85789C',
    80001: '0xFBBb8272BdCb2Dd042D064aaCbb63Ad808B34544',
  },
  tokenB: {
    1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    5: '0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6',
    80001: '0x3DD5A052de61858708eE2F0467C3C5765caB6362',
  },
};

export const domainId: IDomainIDRecord = {
  1: 6648936,
  10: 1869640809,
  137: 1886350457,
  5: 1735353714,
  420: 1735356532,
  80001: 9991,
  42069: 42069,
};

export const dataFeedSettings: IDataFeedSettingsRecord = {
  1: 1800, // 30min
  5: 180, // 3min
  80001: 180,
};

export const strategySettings: IStrategySettingsRecord = {
  1: {
    periodDuration: 14400, // 4hs
    strategyCooldown: 172800, // 2d
    defaultTwapThreshold: 500, // ~5%
    twapLength: 28800, // 8hs
  },
  5: {
    periodDuration: 3600, // 1hr
    strategyCooldown: 43200, // half-day
    defaultTwapThreshold: 500, // ~5%
    twapLength: 7200, // 2hs
  },
  80001: {
    periodDuration: 300, // 5min
    strategyCooldown: 3600, // 1hr
    defaultTwapThreshold: 500, // ~5%
    twapLength: 300, // 5min
  },
};
