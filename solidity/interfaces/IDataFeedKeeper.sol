//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IUniswapV3Pool} from '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import {IKeep3rJob} from './peripherals/IKeep3rJob.sol';
import {IDataFeed} from './IDataFeed.sol';
import {IBridgeSenderAdapter} from './bridges/IBridgeSenderAdapter.sol';
import {IOracleSidechain} from '../interfaces/IOracleSidechain.sol';

/// @title The DataFeedKeeper interface
/// @author 0xJabberwock (from DeFi Wonderland)
/// @notice Contains state variables, events, custom errors and functions used in DataFeedKeeper
interface IDataFeedKeeper is IKeep3rJob {
  // ENUMS

  enum TriggerReason {
    NONE,
    TIME,
    TWAP
  }

  // STATE VARIABLES

  /// @notice Gets the address of the DataFeed contract
  /// @return _dataFeed The address of the DataFeed contract
  function dataFeed() external view returns (IDataFeed _dataFeed);

  function defaultBridgeSenderAdapter() external view returns (IBridgeSenderAdapter _defaultBridgeSenderAdapter);

  function lastPoolNonceBridged(uint16 _chainId, bytes32 _poolSalt) external view returns (uint24 _lastPoolNonceBridged);

  /// @notice Gets the job cooldown
  /// @return _jobCooldown The cooldown of the job, in seconds
  function jobCooldown() external view returns (uint32 _jobCooldown);

  /// @notice Gets the length of the bridged periods
  /// @return _periodLength The resolution of the bridged datapoints
  function periodLength() external view returns (uint32 _periodLength);

  function twapLength() external view returns (uint32 _twapLength);

  function upperTwapThreshold() external view returns (int24 _upperTwapThreshold);

  function lowerTwapThreshold() external view returns (int24 _lowerTwapThreshold);

  // EVENTS

  event DefaultBridgeSenderAdapterUpdated(IBridgeSenderAdapter _defaultBridgeSenderAdapter);

  /// @notice Emitted when the owner updates the job cooldown
  /// @param _jobCooldown The new job cooldown
  event JobCooldownUpdated(uint32 _jobCooldown);

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

  /// @notice Thrown if the job is not workable
  error NotWorkable();

  /// @notice Thrown if governor tries to set a periodLength >= jobCooldown
  error WrongSetting();

  // FUNCTIONS

  /// @notice Calls to send observations in the DataFeed contract
  /// @param _chainId The Ethereum chain identification
  /// @param _poolSalt The pool salt defined by token0 token1 and fee
  /// @param _poolNonce The nonce of the observations fetched by pool
  function work(
    uint16 _chainId,
    bytes32 _poolSalt,
    uint24 _poolNonce,
    IOracleSidechain.ObservationData[] memory _observationsData
  ) external;

  function work(bytes32 _poolSalt, TriggerReason _reason) external;

  function forceWork(bytes32 _poolSalt, uint32 _fromTimestamp) external;

  function setDefaultBridgeSenderAdapter(IBridgeSenderAdapter _defaultBridgeSenderAdapter) external;

  /// @notice Sets the job cooldown
  /// @param _jobCooldown The job cooldown to be set
  function setJobCooldown(uint32 _jobCooldown) external;

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

  /// @notice Returns if the job can be worked
  /// @param _chainId The destination chain ID
  /// @param _poolSalt The pool salt defined by token0 token1 and fee
  /// @param _poolNonce The nonce of the observations fetched by pool
  /// @return _isWorkable Whether the job is workable or not
  function workable(
    uint16 _chainId,
    bytes32 _poolSalt,
    uint24 _poolNonce
  ) external view returns (bool _isWorkable);

  /// @notice Returns if the job can be worked
  /// @param _poolSalt The pool salt defined by token0 token1 and fee
  /// @return _reason The reason why the job can be worked
  function workable(bytes32 _poolSalt) external view returns (TriggerReason _reason);

  /// @notice Returns if the job can be worked
  /// @param _poolSalt The pool salt defined by token0 token1 and fee
  /// @param _reason The reason why the job can be worked
  /// @return _isWorkable Whether the job is workable or not
  function workable(bytes32 _poolSalt, TriggerReason _reason) external view returns (bool _isWorkable);

  /// @notice Builds the secondsAgos array with periodLength between each datapoint
  /// @param _periodLength The resolution of the bridged datapoints
  /// @param _fromTimestamp Last observed timestamp
  function calculateSecondsAgos(uint32 _periodLength, uint32 _fromTimestamp) external view returns (uint32[] memory _secondsAgos);
}
