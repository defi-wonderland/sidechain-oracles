//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IConnextSenderAdapter} from './bridges/IConnextSenderAdapter.sol';

interface IManualDataFeed {
  // STATE VARIABLES

  function connextSender() external view returns (IConnextSenderAdapter _connextSender);

  // EVENTS

  event DataSent(address _to, uint32 _destinationDomainId, uint32 _originDomainId, uint32 _blockTimestamp, int24 _tick);

  // FUNCTIONS

  function sendObservation(
    address _to,
    uint32 _originDomainId,
    uint32 _destinationDomainId,
    int24 _tick
  ) external;
}
