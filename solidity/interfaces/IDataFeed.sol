//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IConnextSenderAdapter} from './bridges/IConnextSenderAdapter.sol';
import {IUniswapV3Pool} from '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';

interface IDataFeed {
  // STATE VARIABLES

  function connextSender() external view returns (IConnextSenderAdapter _connextSender);

  // EVENTS

  event DataSent(address to, uint32 destinationDomainId, uint32 originDomainId, uint32 blockTimestamp, int24 tick);

  // FUNCTIONS

  function sendObservation(
    address _to,
    uint32 _originDomainId,
    uint32 _destinationDomainId,
    IUniswapV3Pool _pool
  ) external;

  function fetchLatestObservation(IUniswapV3Pool _pool) external view returns (uint32 _blockTimestamp, int24 _tick);
}
