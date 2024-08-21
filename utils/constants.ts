import { IDomainIDRecord, IDataFeedSettingsRecord, IStrategySettingsRecord } from './types';

export const TEST_FEE = 10_000;

export const addressRegistry = {
  // KEEP3R DEPLOYMENTS
  keep3r: {
    1: '0xeb02addCfD8B773A5FFA6B9d1FE99c566f8c44CC',
    11155111: '0xbC855B9Ad7398360999Bd176edBC98EB53F9E26F',
  },
  keep3rGovernance: {
    1: '0x0D5Dc686d0a2ABBfDaFDFb4D0533E886517d4E83',
    11155111: '0x169Cf949aB1B25453b70F2Fe874e2c65c10AE0f8',
  },
  kp3rV1: {
    1: '0x1ceb5cb57c4d4e2b2433641b95dd330a33185a44',
    11155111: '0x80B4327021946fF962d570c808B6aaC47224AeF1',
  },
  // UNISWAP DEPLOYMENTS
  uniV3Factory: {
    1: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    11155111: '0x0227628f3F023bb0B980b67D528571c95c6DaC1c',
  },
  // CONNEXT DEPLOYMENTS
  // source: https://docs.connext.network/resources/deployments
  connextHandler: {
    1: '0x8898B472C54c31894e3B9bb83cEA802a5d0e63C6',
    10: '0x8f7492DE823025b4CfaAB1D34c58963F2af5DEDA',
    137: '0x11984dc4465481512eb5b777E44061C158CF2259',
    11155111: '0x445fbf9cCbaf7d557fd771d56937E94397f43965',
    11155420: '0x8247ed6d0a344eeae4edBC7e44572F1B70ECA82A',
  },
  // TOKENS
  tokenA: {
    1: '0x1ceb5cb57c4d4e2b2433641b95dd330a33185a44',
    11155111: '0x80B4327021946fF962d570c808B6aaC47224AeF1',
  },
  tokenB: {
    1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    11155111: '0x7b79995e5f793a07bc00c21412e50ecae098e7f9',
  },
};

export const domainId: IDomainIDRecord = {
  1: 6648936,
  10: 1869640809,
  137: 1886350457,
  11155111: 1936027759,
  11155420: 1869640549,
  42069: 42069,
};

export const dataFeedSettings: IDataFeedSettingsRecord = {
  1: 1800, // 30min
  11155111: 180, // 3min
};

export const strategySettings: IStrategySettingsRecord = {
  1: {
    periodDuration: 14400, // 4hs
    strategyCooldown: 172800, // 2d
    defaultTwapThreshold: 500, // ~5%
    twapLength: 28800, // 8hs
  },
  11155111: {
    periodDuration: 3600, // 1hr
    strategyCooldown: 43200, // half-day
    defaultTwapThreshold: 500, // ~5%
    twapLength: 7200, // 2hs
  },
};
