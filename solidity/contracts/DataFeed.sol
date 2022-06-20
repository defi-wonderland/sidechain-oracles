//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IDataFeed, IConnextSenderAdapter, IUniswapV3Pool} from '../interfaces/IDataFeed.sol';

contract DataFeed is IDataFeed {
  IConnextSenderAdapter public immutable connextSender;

  constructor(IConnextSenderAdapter _connextSender) {
    connextSender = _connextSender;
  }

  function sendObservation(
    address _to,
    uint32 _originDomainId,
    uint32 _destinationDomainId,
    IUniswapV3Pool _pool
  ) external {
    (uint32 _blockTimestamp, int24 _tick) = fetchLatestObservation(_pool);
    connextSender.bridgeObservation(_to, _originDomainId, _destinationDomainId, _blockTimestamp, _tick);
    emit DataSent(_to, _originDomainId, _destinationDomainId, _blockTimestamp, _tick);
  }

  function fetchLatestObservation(IUniswapV3Pool _pool) public view returns (uint32 _blockTimestamp, int24 _tick) {
    (, , uint16 _observationIndex, uint16 _observationCardinality, , , ) = _pool.slot0();
    int56 _tickCumulative;
    (_blockTimestamp, _tickCumulative, , ) = _pool.observations(_observationIndex);
    (uint32 _blockTimestampBefore, int56 _tickCumulativeBefore, , ) = _pool.observations(
      (_observationIndex + _observationCardinality - 1) % _observationCardinality
    );
    uint32 _delta = _blockTimestamp - _blockTimestampBefore;
    _tick = int24((_tickCumulative - _tickCumulativeBefore) / int56(uint56(_delta)));
  }
}
