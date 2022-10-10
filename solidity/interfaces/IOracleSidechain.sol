//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IOracleFactory} from './IOracleFactory.sol';

/// @title The OracleSidechain interface
/// @author 0xJabberwock (from DeFi Wonderland)
/// @notice Contains state variables, events, custom errors and functions used in OracleSidechain
interface IOracleSidechain {
  // STRUCTS

  struct ObservationData {
    uint32 blockTimestamp;
    int24 tick;
  }

  // STATE VARIABLES

  // TODO: complete natspec

  function factory() external view returns (IOracleFactory _oracleFactory);

  function token0() external view returns (address _token0);

  function token1() external view returns (address _token1);

  function fee() external view returns (uint24 _fee);

  function poolSalt() external view returns (bytes32 _poolSalt);

  function poolNonce() external view returns (uint24 _poolNonce);

  /// @notice The 0th storage slot in the pool stores many values, and is exposed as a single method to save gas
  /// when accessed externally.
  /// @return _sqrtPriceX96 Used to maintain compatibility with Uniswap V3
  /// @return _tick Used to maintain compatibility with Uniswap V3
  /// @return _observationIndex The index of the last oracle observation that was written,
  /// @return _observationCardinality The current maximum number of observations stored in the pool,
  /// @return _observationCardinalityNext The next maximum number of observations, to be updated when the observation.
  /// @return _feeProtocol Used to maintain compatibility with Uniswap V3
  /// @return _unlocked Used to maintain compatibility with Uniswap V3
  function slot0()
    external
    view
    returns (
      uint160 _sqrtPriceX96,
      int24 _tick,
      uint16 _observationIndex,
      uint16 _observationCardinality,
      uint16 _observationCardinalityNext,
      uint8 _feeProtocol,
      bool _unlocked
    );

  /// @notice Returns data about a specific observation index
  /// @param _index The element of the observations array to fetch
  /// @dev You most likely want to use #observe() instead of this method to get an observation as of some amount of time
  /// ago, rather than at a specific index in the array.
  /// @return _blockTimestamp The timestamp of the observation,
  /// @return _tickCumulative the tick multiplied by seconds elapsed for the life of the pool as of the observation timestamp,
  /// @return _secondsPerLiquidityCumulativeX128 the seconds per in range liquidity for the life of the pool as of the observation timestamp,
  /// @return _initialized whether the observation has been initialized and the values are safe to use
  function observations(uint256 _index)
    external
    view
    returns (
      uint32 _blockTimestamp,
      int56 _tickCumulative,
      uint160 _secondsPerLiquidityCumulativeX128,
      bool _initialized
    );

  // EVENTS

  event PoolInfoInitialized(bytes32 _poolSalt, address _token0, address _token1, uint24 _fee);
  event ObservationWritten(address _user, ObservationData _observationData);

  // ERRORS

  error AI();
  error InvalidPool();
  error OnlyDataReceiver();

  // FUNCTIONS

  function initializePoolInfo(
    address _tokenA,
    address _tokenB,
    uint24 _fee
  ) external;

  /// @notice Returns the cumulative tick and liquidity as of each timestamp `secondsAgo` from the current block timestamp
  /// @dev To get a time weighted average tick or liquidity-in-range, you must call this with two values, one representing
  /// the beginning of the period and another for the end of the period. E.g., to get the last hour time-weighted average tick,
  /// you must call it with secondsAgos = [3600, 0].
  /// @dev The time weighted average tick represents the geometric time weighted average price of the pool, in
  /// log base sqrt(1.0001) of token1 / token0. The TickMath library can be used to go from a tick value to a ratio.
  /// @param _secondsAgos From how long ago each cumulative tick and liquidity value should be returned
  /// @return _tickCumulatives Cumulative tick values as of each `secondsAgos` from the current block timestamp
  /// @return _secondsPerLiquidityCumulativeX128s Cumulative seconds per liquidity-in-range value as of each `secondsAgos` from the current block
  /// timestamp
  function observe(uint32[] calldata _secondsAgos)
    external
    view
    returns (int56[] memory _tickCumulatives, uint160[] memory _secondsPerLiquidityCumulativeX128s);

  function write(ObservationData[] calldata _observationsData, uint24 _poolNonce) external returns (bool _written);
}
