//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IGovernable} from './peripherals/IGovernable.sol';
import {IUniswapV3Pool} from '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import {IDataFeed} from './IDataFeed.sol';
import {IBridgeSenderAdapter} from './bridges/IBridgeSenderAdapter.sol';
import {IOracleSidechain} from '../interfaces/IOracleSidechain.sol';

/// @title The DataFeedStrategy interface
/// @author 0xJabberwock (from DeFi Wonderland)
/// @notice Contains state variables, events, custom errors and functions used in DataFeedStrategy
interface IDataFeedStrategy is IGovernable {
  // ENUMS

  enum TriggerReason {
    NONE,
    TIME,
    TWAP
  }

  // STRUCTS

  struct StrategySettings {
    uint32 cooldown;
    uint32 periodLength;
    uint32 twapLength;
    int24 upperTwapThreshold;
    int24 lowerTwapThreshold;
  }

  // STATE VARIABLES

  /// @notice Gets the address of the DataFeed contract
  /// @return _dataFeed The address of the DataFeed contract
  function dataFeed() external view returns (IDataFeed _dataFeed);

  /// @notice Gets the job cooldown
  /// @return _strategyCooldown The cooldown of the job, in seconds
  function strategyCooldown() external view returns (uint32 _strategyCooldown);

  /// @notice Gets the length of the bridged periods
  /// @return _periodLength The resolution of the bridged datapoints
  function periodLength() external view returns (uint32 _periodLength);

  function twapLength() external view returns (uint32 _twapLength);

  function upperTwapThreshold() external view returns (int24 _upperTwapThreshold);

  function lowerTwapThreshold() external view returns (int24 _lowerTwapThreshold);

  // EVENTS

  /// @notice Emitted when a data fetch is triggered
  /// @param _poolSalt Identifier of the pool to fetch
  /// @param _reason Identifier number of the reason that triggered the fetch request
  event StrategicFetch(bytes32 indexed _poolSalt, TriggerReason _reason);

  /// @notice Emitted when the owner updates the job cooldown
  /// @param _strategyCooldown The new job cooldown
  event StrategyCooldownUpdated(uint32 _strategyCooldown);

  /// @notice Emitted when the owner updates the job period length
  /// @param _periodLength The new length of reading resolution periods
  event PeriodLengthUpdated(uint32 _periodLength);

  /// @notice Emitted when the owner updates the job twap length
  /// @param _twapLength The new length of the twap used to trigger an update of the oracle
  event TwapLengthUpdated(uint32 _twapLength);

  /// @notice Emitted when the owner updates the job twap threshold percentage
  /// @param _upperTwapThreshold The upper twap difference threshold used to trigger an update of the oracle
  /// @param _lowerTwapThreshold The lower twap difference threshold used to trigger an update of the oracle
  event TwapThresholdsUpdated(int24 _upperTwapThreshold, int24 _lowerTwapThreshold);

  // ERRORS

  /// @notice Thrown if the tx is not strategic
  error NotStrategic();

  /// @notice Thrown if governor tries to set a periodLength >= strategyCooldown
  error WrongSetting();

  // FUNCTIONS

  function strategicFetchObservations(bytes32 _poolSalt, TriggerReason _reason) external;

  function forceFetchObservations(bytes32 _poolSalt, uint32 _fromTimestamp) external;

  /// @notice Sets the job cooldown
  /// @param _strategyCooldown The job cooldown to be set
  function setStrategyCooldown(uint32 _strategyCooldown) external;

  /// @notice Sets the job period length
  /// @param _periodLength The new length of reading resolution periods
  function setPeriodLength(uint32 _periodLength) external;

  /// @notice Sets the job twap length
  /// @param _twapLength The new length of the twap used to trigger an update of the oracle
  function setTwapLength(uint32 _twapLength) external;

  /// @notice Sets the job twap threshold percentage
  /// @param _upperTwapThreshold The upper twap difference threshold used to trigger an update of the oracle
  /// @param _lowerTwapThreshold The lower twap difference threshold used to trigger an update of the oracle
  function setTwapThresholds(int24 _upperTwapThreshold, int24 _lowerTwapThreshold) external;

  /// @notice Returns if the strategy can be executed
  /// @param _poolSalt The pool salt defined by token0 token1 and fee
  /// @return _reason The reason why the strategy can be executed
  function isStrategic(bytes32 _poolSalt) external view returns (TriggerReason _reason);

  /// @notice Returns if the strategy can be executed
  /// @param _poolSalt The pool salt defined by token0 token1 and fee
  /// @param _reason The reason why the strategy can be executed
  /// @return _isStrategic Whether the tx is strategic or not
  function isStrategic(bytes32 _poolSalt, TriggerReason _reason) external view returns (bool _isStrategic);

  /// @notice Builds the secondsAgos array with periodLength between each datapoint
  /// @param _fromTimestamp Last observed timestamp
  function calculateSecondsAgos(uint32 _fromTimestamp) external view returns (uint32[] memory _secondsAgos);
}
