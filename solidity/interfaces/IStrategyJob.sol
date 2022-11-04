//SPDX-License-Identifier: MIT
pragma solidity >=0.8.8 <0.9.0;

import {IKeep3rJob} from './peripherals/IKeep3rJob.sol';
import {IDataFeedStrategy} from './IDataFeedStrategy.sol';
import {IDataFeed} from './IDataFeed.sol';
import {IBridgeSenderAdapter} from './bridges/IBridgeSenderAdapter.sol';
import {IOracleSidechain} from './IOracleSidechain.sol';

interface IStrategyJob is IKeep3rJob {
  // STATE VARIABLES

  function dataFeedStrategy() external view returns (IDataFeedStrategy _dataFeedStrategy);

  function dataFeed() external view returns (IDataFeed _dataFeed);

  function defaultBridgeSenderAdapter() external view returns (IBridgeSenderAdapter _defaultBridgeSenderAdapter);

  function lastPoolNonceBridged(uint32 _chainId, bytes32 _poolSalt) external view returns (uint24 _lastPoolNonceBridged);

  // EVENTS

  event DefaultBridgeSenderAdapterUpdated(IBridgeSenderAdapter _defaultBridgeSenderAdapter);

  // ERRORS

  error NotWorkable();

  // FUNCTIONS

  /// @notice Calls to send observations in the DataFeed contract
  /// @param _chainId The Ethereum chain identification
  /// @param _poolSalt The pool salt defined by token0 token1 and fee
  /// @param _poolNonce The nonce of the observations fetched by pool
  function work(
    uint32 _chainId,
    bytes32 _poolSalt,
    uint24 _poolNonce,
    IOracleSidechain.ObservationData[] memory _observationsData
  ) external;

  function work(bytes32 _poolSalt, IDataFeedStrategy.TriggerReason _reason) external;

  function setDefaultBridgeSenderAdapter(IBridgeSenderAdapter _defaultBridgeSenderAdapter) external;

  /// @notice Returns if the job can be worked
  /// @param _chainId The destination chain ID
  /// @param _poolSalt The pool salt defined by token0 token1 and fee
  /// @param _poolNonce The nonce of the observations fetched by pool
  /// @return _isWorkable Whether the job is workable or not
  function workable(
    uint32 _chainId,
    bytes32 _poolSalt,
    uint24 _poolNonce
  ) external view returns (bool _isWorkable);

  /// @notice Returns if the job can be worked
  /// @param _poolSalt The pool salt defined by token0 token1 and fee
  /// @return _reason The reason why the job can be worked
  function workable(bytes32 _poolSalt) external view returns (IDataFeedStrategy.TriggerReason _reason);

  /// @notice Returns if the job can be worked
  /// @param _poolSalt The pool salt defined by token0 token1 and fee
  /// @param _reason The reason why the job can be worked
  /// @return _isWorkable Whether the job is workable or not
  function workable(bytes32 _poolSalt, IDataFeedStrategy.TriggerReason _reason) external view returns (bool _isWorkable);
}
