export interface IDomainIDRecord {
  [key: number]: number;
}

export interface IDataFeedSettingsRecord {
  [key: number]: number;
}

export interface IStrategySettingsRecord {
  [key: number]: DataFeedStrategySettings;
}

export interface DataFeedStrategySettings {
  periodDuration: number;
  strategyCooldown: number;
  defaultTwapThreshold: number;
  twapLength: number;
}
