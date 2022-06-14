//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import '../interfaces/IManualDataFeed.sol';
import '../interfaces/bridges/IConnextSenderAdapter.sol';

contract ManualDataFeed is IManualDataFeed {
  IConnextSenderAdapter public immutable connextSender;

  constructor(IConnextSenderAdapter _connextSender) {
    connextSender = _connextSender;
  }

  function sendObservation(
    address _to,
    uint32 _originDomainId,
    uint32 _destinationDomainId,
    int24 _tick
  ) external {
    uint32 _blockTimestamp = uint32(block.timestamp);
    connextSender.bridgeManualObservation(_to, _originDomainId, _destinationDomainId, _blockTimestamp, _tick);
    emit DataSent(_to, _originDomainId, _destinationDomainId, _blockTimestamp, _tick);
  }
}
