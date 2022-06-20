//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IDataFeed} from '../IDataFeed.sol';
import {IConnextHandler} from '@connext/nxtp-contracts/contracts/core/connext/interfaces/IConnextHandler.sol';

interface IConnextSenderAdapter {
  // EVENTS
  event DataSent(address _to, uint32 _originDomainId, uint32 _destinationDomainId, uint32 _blockTimestamp, int24 _tick);

  // STATE VARIABLES

  function connext() external view returns (IConnextHandler _connext);

  // FUNCTIONS

  function bridgeObservation(
    address _to,
    uint32 _originDomainId,
    uint32 _destinationDomainId,
    uint32 _blockTimestamp,
    int24 _tick
  ) external;
}
