export interface IChainIdData {
  domainIdOrigin?: number;
  domainIdDestination?: number;
  chainName: string;
  connextHandler: string;
}

export interface IChainIdDataRecord {
  [key: number]: IChainIdData;
}
