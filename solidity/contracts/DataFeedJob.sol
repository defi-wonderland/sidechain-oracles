// SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {Keep3rJob, Governable} from './peripherals/Keep3rJob.sol';
import {IDataFeedJob, IDataFeed, IBridgeSenderAdapter} from '../interfaces/IDataFeedJob.sol';

contract DataFeedJob is IDataFeedJob, Keep3rJob {
  /// @inheritdoc IDataFeedJob
  IDataFeed public immutable dataFeed;

  /// @inheritdoc IDataFeedJob
  uint256 public jobCooldown;

  mapping(address => mapping(address => uint256)) private _lastWorkTime;

  constructor(
    IDataFeed _dataFeed,
    address _governor,
    uint256 _jobCooldown
  ) Governable(_governor) {
    dataFeed = _dataFeed;
    _setJobCooldown(_jobCooldown);
  }

  /// @inheritdoc IDataFeedJob
  function work(
    IBridgeSenderAdapter _bridgeSenderAdapter,
    uint16 _chainId,
    address _tokenA,
    address _tokenB,
    uint24 _fee,
    uint32[] calldata _secondsAgos
  ) external upkeep {
    if (!workable(_tokenA, _tokenB)) revert NotWorkable();
    _work(_bridgeSenderAdapter, _chainId, _tokenA, _tokenB, _fee, _secondsAgos);
    emit Bridged(msg.sender, _bridgeSenderAdapter, _chainId, _tokenA, _tokenB, _fee, _secondsAgos);
  }

  /// @inheritdoc IDataFeedJob
  function forceWork(
    IBridgeSenderAdapter _bridgeSenderAdapter,
    uint16 _chainId,
    address _tokenA,
    address _tokenB,
    uint24 _fee,
    uint32[] calldata _secondsAgos
  ) external onlyGovernor {
    _work(_bridgeSenderAdapter, _chainId, _tokenA, _tokenB, _fee, _secondsAgos);
    emit ForceBridged(_bridgeSenderAdapter, _chainId, _tokenA, _tokenB, _fee, _secondsAgos);
  }

  /// @inheritdoc IDataFeedJob
  function setJobCooldown(uint256 _jobCooldown) external onlyGovernor {
    _setJobCooldown(_jobCooldown);
  }

  /// @inheritdoc IDataFeedJob
  function workable(address _tokenA, address _tokenB) public view returns (bool _isWorkable) {
    return block.timestamp >= getLastWorkTimestamp(_tokenA, _tokenB) + jobCooldown;
  }

  /// @inheritdoc IDataFeedJob
  function getLastWorkTimestamp(address _tokenA, address _tokenB) public view returns (uint256 _lastWorkTimestamp) {
    (address _token0, address _token1) = _sortTokens(_tokenA, _tokenB);
    _lastWorkTimestamp = _lastWorkTime[_token0][_token1];
  }

  function _sortTokens(address _tokenA, address _tokenB) internal pure returns (address _token0, address _token1) {
    (_token0, _token1) = _tokenA < _tokenB ? (_tokenA, _tokenB) : (_tokenB, _tokenA);
  }

  function _getPoolSalt(
    address _tokenA,
    address _tokenB,
    uint24 _fee
  ) internal pure returns (bytes32 _poolSalt) {
    (address _token0, address _token1) = _sortTokens(_tokenA, _tokenB);
    _poolSalt = keccak256(abi.encode(_token0, _token1, _fee));
  }

  function _work(
    IBridgeSenderAdapter _bridgeSenderAdapter,
    uint16 _chainId,
    address _tokenA,
    address _tokenB,
    uint24 _fee,
    uint32[] calldata _secondsAgos
  ) private {
    // TODO: add as method param
    bytes32 _poolSalt = _getPoolSalt(_tokenA, _tokenB, _fee);
    // TODO: add _chainId to _lastWorkTime tracking
    _updateLastWorkTimestamp(_tokenA, _tokenB);
    dataFeed.sendObservations(_bridgeSenderAdapter, _chainId, _poolSalt, _secondsAgos);
  }

  function _updateLastWorkTimestamp(address _tokenA, address _tokenB) private {
    (address _token0, address _token1) = _sortTokens(_tokenA, _tokenB);
    _lastWorkTime[_token0][_token1] = block.timestamp;
  }

  function _setJobCooldown(uint256 _jobCooldown) private {
    jobCooldown = _jobCooldown;
    emit JobCooldownUpdated(_jobCooldown);
  }
}
