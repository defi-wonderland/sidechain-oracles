export interface IDomainIDRecord {
  [key: number]: number;
}

export interface IStrategySettingsRecord {
  [key: number]: DataFeedStrategySettings;
}

export interface DataFeedStrategySettings {
  periodDuration: number;
  cooldown: number;
  twapThreshold: number;
  twapLength: number;
}
