// SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IKeep3rJob} from './peripherals/IKeep3rJob.sol';
import {IDataFeed, IBridgeSenderAdapter} from './IDataFeed.sol';

/// @title The DataFeedJob interface
/// @author 0xJabberwock (from DeFi Wonderland)
/// @notice Contains state variables, events, custom errors and functions used in DataFeedJob
interface IDataFeedJob is IKeep3rJob {
  // STATE VARIABLES

  /// @notice Gets the address of the DataFeed contract
  /// @return _dataFeed The address of the DataFeed contract
  function dataFeed() external view returns (IDataFeed _dataFeed);

  /// @notice Gets the job cooldown
  /// @return _jobCooldown The cooldown of the job, in seconds
  function jobCooldown() external view returns (uint256 _jobCooldown);

  // EVENTS

  /// @notice Emitted when the keeper does the job
  /// @param _keeper The address of the keeper
  /// @param _bridgeSenderAdapter The contract address of the bridge sender adapter
  /// @param _chainId The Ethereum chain identification
  /// @param _tokenA The contract address of either token0 or token1
  /// @param _tokenB The contract address of the other token
  /// @param _fee The fee collected upon every swap in the pool, denominated in hundredths of a bip
  /// @param _secondsAgos Each amount of time to look back, in seconds, at which point an observation was sent
  event Bridged(
    address indexed _keeper,
    IBridgeSenderAdapter _bridgeSenderAdapter,
    uint16 _chainId,
    address _tokenA,
    address _tokenB,
    uint24 _fee,
    uint32[] _secondsAgos
  );

  /// @notice Emitted when the governor does the job
  /// @param _bridgeSenderAdapter The contract address of the bridge sender adapter
  /// @param _chainId The Ethereum chain identification
  /// @param _tokenA The contract address of either token0 or token1
  /// @param _tokenB The contract address of the other token
  /// @param _fee The fee collected upon every swap in the pool, denominated in hundredths of a bip
  /// @param _secondsAgos Each amount of time to look back, in seconds, at which point an observation was sent
  event ForceBridged(
    IBridgeSenderAdapter _bridgeSenderAdapter,
    uint16 _chainId,
    address _tokenA,
    address _tokenB,
    uint24 _fee,
    uint32[] _secondsAgos
  );

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
  /// @param _tokenA The contract address of either token0 or token1
  /// @param _tokenB The contract address of the other token
  /// @param _fee The fee collected upon every swap in the pool, denominated in hundredths of a bip
  /// @param _secondsAgos Each amount of time to look back, in seconds, at which point to send an observation
  function work(
    IBridgeSenderAdapter _bridgeSenderAdapter,
    uint16 _chainId,
    address _tokenA,
    address _tokenB,
    uint24 _fee,
    uint32[] calldata _secondsAgos
  ) external;

  /// @notice Calls to send observations in the DataFeed contract, bypassing the job cooldown
  /// @param _bridgeSenderAdapter The contract address of the bridge sender adapter
  /// @param _chainId The Ethereum chain identification
  /// @param _tokenA The contract address of either token0 or token1
  /// @param _tokenB The contract address of the other token
  /// @param _fee The fee collected upon every swap in the pool, denominated in hundredths of a bip
  /// @param _secondsAgos Each amount of time to look back, in seconds, at which point to send an observation
  function forceWork(
    IBridgeSenderAdapter _bridgeSenderAdapter,
    uint16 _chainId,
    address _tokenA,
    address _tokenB,
    uint24 _fee,
    uint32[] calldata _secondsAgos
  ) external;

  /// @notice Sets the job cooldown
  /// @param _jobCooldown The job cooldown to be set
  function setJobCooldown(uint256 _jobCooldown) external;

  /// @notice Returns if the job can be worked
  /// @param _tokenA The contract address of either token0 or token1
  /// @param _tokenB The contract address of the other token
  /// @return _isWorkable Whether the job is workable or not
  function workable(address _tokenA, address _tokenB) external view returns (bool _isWorkable);

  /// @notice Gets the last work time given the pool tokens
  /// @param _tokenA The contract address of either token0 or token1
  /// @param _tokenB The contract address of the other token
  /// @return _lastWorkTimestamp The timestamp of the block in which the last work was done
  function getLastWorkTimestamp(address _tokenA, address _tokenB) external view returns (uint256 _lastWorkTimestamp);
}
