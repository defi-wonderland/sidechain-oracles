//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IKeep3rJob} from './peripherals/IKeep3rJob.sol';
import {IDataFeed} from './IDataFeed.sol';
import {IBridgeSenderAdapter} from './bridges/IConnextSenderAdapter.sol';

/// @title The DataFeedKeeper interface
/// @author 0xJabberwock (from DeFi Wonderland)
/// @notice Contains state variables, events, custom errors and functions used in DataFeedKeeper
interface IDataFeedKeeper is IKeep3rJob {
  // STATE VARIABLES

  /// @notice Gets the address of the DataFeed contract
  /// @return _dataFeed The address of the DataFeed contract
  function dataFeed() external view returns (IDataFeed _dataFeed);

  /// @notice Gets the job cooldown
  /// @return _jobCooldown The cooldown of the job, in seconds
  function jobCooldown() external view returns (uint256 _jobCooldown);

  /// @notice Gets the length of the bridged periods
  /// @return _periodLength The resolution of the bridged datapoints
  function periodLength() external view returns (uint32 _periodLength);

  /// @notice Gets the last work time given the chain ID and pool salt
  /// @param _chainId The destination chain ID
  /// @param _poolSalt The pool salt defined by token0 token1
  /// @return _lastWorkTimestamp The timestamp of the block in which the last work was done
  function lastWorkedAt(uint16 _chainId, bytes32 _poolSalt) external view returns (uint32 _lastWorkTimestamp);

  // EVENTS

  /// @notice Emitted when the keeper does the job
  /// @param _keeper The address of the keeper
  /// @param _bridgeSenderAdapter The contract address of the bridge sender adapter
  /// @param _chainId The Ethereum chain identification
  /// @param _poolSalt The pool salt defined by token0 token1 and fee
  /// @param _secondsAgos Each amount of time to look back, in seconds, at which point an observation was sent
  event Bridged(address indexed _keeper, IBridgeSenderAdapter _bridgeSenderAdapter, uint16 _chainId, bytes32 _poolSalt, uint32[] _secondsAgos);

  /// @notice Emitted when the governor does the job
  /// @param _bridgeSenderAdapter The contract address of the bridge sender adapter
  /// @param _chainId The Ethereum chain identification
  /// @param _poolSalt The pool salt defined by token0 token1 and fee
  /// @param _secondsAgos Each amount of time to look back, in seconds, at which point an observation was sent
  event ForceBridged(IBridgeSenderAdapter _bridgeSenderAdapter, uint16 _chainId, bytes32 _poolSalt, uint32[] _secondsAgos);

  /// @notice Emitted when the owner updates the job cooldown
  /// @param _jobCooldown The new job cooldown
  event JobCooldownUpdated(uint256 _jobCooldown);

  // ERRORS

  /// @notice Thrown if the job is not workable
  error NotWorkable();

  // FUNCTIONS

  /// @notice Calls to send observations in the DataFeed contract
  /// @param _bridgeSenderAdapter The contract address of the bridge sender adapter
  /// @param _chainId The Ethereum chain identification
  /// @param _poolSalt The pool salt defined by token0 token1 and fee
  function work(
    IBridgeSenderAdapter _bridgeSenderAdapter,
    uint16 _chainId,
    bytes32 _poolSalt
  ) external;

  /// @notice Calls to send observations in the DataFeed contract, bypassing the job cooldown
  /// @param _bridgeSenderAdapter The contract address of the bridge sender adapter
  /// @param _chainId The Ethereum chain identification
  /// @param _poolSalt The pool salt defined by token0 token1 and fee
  /// @param _secondsAgos Each amount of time to look back, in seconds, at which point to send an observation
  function forceWork(
    IBridgeSenderAdapter _bridgeSenderAdapter,
    uint16 _chainId,
    bytes32 _poolSalt,
    uint32[] memory _secondsAgos
  ) external;

  /// @notice Builds the secondsAgos array with periodLength between each datapoint
  /// @param _periodLength The resolution of the bridged datapoints
  /// @param _lastKnownTimestamp Last bridged timestamp
  function calculateSecondsAgos(uint32 _periodLength, uint32 _lastKnownTimestamp) external view returns (uint32[] memory _secondsAgos);

  /// @notice Sets the job cooldown
  /// @param _jobCooldown The job cooldown to be set
  function setJobCooldown(uint256 _jobCooldown) external;

  /// @notice Returns if the job can be worked
  /// @param _chainId The destination chain ID
  /// @param _poolSalt The pool salt defined by token0 token1 and fee
  /// @return _isWorkable Whether the job is workable or not
  function workable(uint16 _chainId, bytes32 _poolSalt) external view returns (bool _isWorkable);
}
