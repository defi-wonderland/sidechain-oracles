// SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IUniswapV3Factory} from '@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol';
import {IUniswapV3Pool} from '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import {IConnextSenderAdapter, IBridgeSenderAdapter, IOracleSidechain} from './bridges/IConnextSenderAdapter.sol';
import {IGovernable} from './peripherals/IGovernable.sol';
import {IAdapterManagement} from './peripherals/IAdapterManagement.sol';

interface IDataFeed is IGovernable, IAdapterManagement {
  // STRUCTS

  struct PoolState {
    uint32 blockTimestamp;
    int56 tickCumulative;
    int24 arithmeticMeanTick;
  }

  // STATE VARIABLES

  /// @notice Tracks the last bridged pool state by salt
  /// @param _poolSalt The id of both the oracle and the pool
  /// @return _lastBlockTimestampBridged Last bridged timestamp
  /// @return _lastTickCumulativeBridged Pool's tickCumulative at last bridged timestamp
  /// @return _lastArithmeticMeanTickBridged Last bridged arithmeticMeanTick
  function lastPoolStateBridged(bytes32 _poolSalt)
    external
    view
    returns (
      uint32 _lastBlockTimestampBridged,
      int56 _lastTickCumulativeBridged,
      int24 _lastArithmeticMeanTickBridged
    );

  // EVENTS

  event DataSent(
    IBridgeSenderAdapter _bridgeSenderAdapter,
    address _dataReceiver,
    uint32 _destinationDomainId,
    IOracleSidechain.ObservationData[] _observationsData,
    bytes32 _poolSalt
  );

  // ERRORS

  error InvalidSecondsAgos();

  // FUNCTIONS

  function sendObservations(
    IBridgeSenderAdapter _bridgeSenderAdapter,
    uint16 _chainId,
    bytes32 _poolSalt,
    uint32[] calldata _secondsAgos
  ) external;

  function fetchObservations(
    bytes32 _poolSalt,
    uint32[] calldata _secondsAgos,
    bool _stitch
  ) external view returns (IOracleSidechain.ObservationData[] memory _observationsData, PoolState memory _lastPoolState);

  function fetchObservationsIndices(IUniswapV3Pool _pool, uint32[] calldata _secondsAgos)
    external
    view
    returns (uint16[] memory _observationsIndices);
}
