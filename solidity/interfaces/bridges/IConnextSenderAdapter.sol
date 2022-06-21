//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IDataFeed} from '../IDataFeed.sol';
import {IBridgeAdapter} from './IBridgeAdapter.sol';
import {IConnextHandler} from '@connext/nxtp-contracts/contracts/core/connext/interfaces/IConnextHandler.sol';

interface IConnextSenderAdapter is IBridgeAdapter {
  // EVENTS
  event DataSent(address to, uint32 originDomainId, uint32 destinationDomainId, uint32 blockTimestamp, int24 tick);

  // ERRORS
  error OnlyDataFeed();

  // STATE VARIABLES

  function connext() external view returns (IConnextHandler _connext);

  function dataFeed() external view returns (IDataFeed _dataFeed);
}
