export interface IDomainIDRecord {
  [key: number]: number;
}

export interface IStrategySettingsRecord {
  [key: number]: DataFeedStrategySettings;
}

export interface DataFeedStrategySettings {
  cooldown: number;
  periodLength: number;
  twapLength: number;
  upperTwapThreshold: number;
  lowerTwapThreshold: number;
}
