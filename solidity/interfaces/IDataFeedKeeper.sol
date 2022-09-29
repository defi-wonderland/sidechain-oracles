//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IKeep3rJob} from './peripherals/IKeep3rJob.sol';
import {IDataFeed} from './IDataFeed.sol';
import {IBridgeSenderAdapter} from './bridges/IConnextSenderAdapter.sol';
import {IOracleSidechain} from '../interfaces/IOracleSidechain.sol';

/// @title The DataFeedKeeper interface
/// @author 0xJabberwock (from DeFi Wonderland)
/// @notice Contains state variables, events, custom errors and functions used in DataFeedKeeper
interface IDataFeedKeeper is IKeep3rJob {
  // STATE VARIABLES

  /// @notice Gets the address of the DataFeed contract
  /// @return _dataFeed The address of the DataFeed contract
  function dataFeed() external view returns (IDataFeed _dataFeed);

  function defaultBridgeSenderAdapter() external view returns (IBridgeSenderAdapter _defaultBridgeSenderAdapter);

  /// @notice Gets the job cooldown
  /// @return _jobCooldown The cooldown of the job, in seconds
  function jobCooldown() external view returns (uint256 _jobCooldown);

  /// @notice Gets the length of the bridged periods
  /// @return _periodLength The resolution of the bridged datapoints
  function periodLength() external view returns (uint32 _periodLength);

  function whitelistedPools(uint16 _chainId, bytes32 _poolSalt) external view returns (bool _isWhitelisted);

  // EVENTS

  event DefaultBridgeSenderAdapterUpdated(IBridgeSenderAdapter _defaultBridgeSenderAdapter);

  /// @notice Emitted when the owner updates the job cooldown
  /// @param _jobCooldown The new job cooldown
  event JobCooldownUpdated(uint256 _jobCooldown);

  event PoolWhitelisted(uint16 _chainId, bytes32 _poolSalt, bool _isWhitelisted);

  // ERRORS

  /// @notice Thrown if the job is not workable
  error NotWorkable();

  error LengthMismatch();

  // FUNCTIONS

  /// @notice Calls to send observations in the DataFeed contract
  /// @param _chainId The Ethereum chain identification
  /// @param _poolSalt The pool salt defined by token0 token1 and fee
  /// @param _poolNonce The nonce of the observations fetched by pool
  function work(
    uint16 _chainId,
    bytes32 _poolSalt,
    uint24 _poolNonce,
    IOracleSidechain.ObservationData[] calldata _observationsData
  ) external;

  function work(bytes32 _poolSalt) external;

  function forceWork(bytes32 _poolSalt, uint32 _fromTimestamp) external;

  function setDefaultBridgeSenderAdapter(IBridgeSenderAdapter _defaultBridgeSenderAdapter) external;

  /// @notice Sets the job cooldown
  /// @param _jobCooldown The job cooldown to be set
  function setJobCooldown(uint256 _jobCooldown) external;

  function whitelistPool(
    uint16 _chainId,
    bytes32 _poolSalt,
    bool _isWhitelisted
  ) external;

  function whitelistPools(
    uint16[] calldata _chainIds,
    bytes32[] calldata _poolSalts,
    bool[] calldata _isWhitelisted
  ) external;

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
  /// @return _isWorkable Whether the job is workable or not
  function workable(bytes32 _poolSalt) external view returns (bool _isWorkable);

  /// @notice Builds the secondsAgos array with periodLength between each datapoint
  /// @param _periodLength The resolution of the bridged datapoints
  /// @param _fromTimestamp Last observed timestamp
  function calculateSecondsAgos(uint32 _periodLength, uint32 _fromTimestamp) external view returns (uint32[] memory _secondsAgos);
}
