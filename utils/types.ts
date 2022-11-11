export interface IDomainIDRecord {
  [key: number]: number;
}

export interface IStrategySettingsRecord {
  [key: number]: DataFeedStrategySettings;
}

export interface DataFeedStrategySettings {
  cooldown: number;
  twapLength: number;
  twapThreshold: number;
  periodLength: number;
}
