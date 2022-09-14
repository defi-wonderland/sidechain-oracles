// SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {Keep3rJob, Governable} from './peripherals/Keep3rJob.sol';
import {IDataFeedJob, IDataFeed, IBridgeSenderAdapter} from '../interfaces/IDataFeedJob.sol';

contract DataFeedJob is IDataFeedJob, Keep3rJob {
  /// @inheritdoc IDataFeedJob
  IDataFeed public immutable dataFeed;

  /// @inheritdoc IDataFeedJob
  uint256 public jobCooldown;

  /// @inheritdoc IDataFeedJob
  uint32 public periodLength = 1 days;

  /// @inheritdoc IDataFeedJob
  mapping(uint16 => mapping(bytes32 => uint32)) public lastWorkedAt;

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
    bytes32 _poolSalt
  ) external upkeep {
    if (!workable(_chainId, _poolSalt)) revert NotWorkable();
    uint32 _lastWorkTimestamp = lastWorkedAt[_chainId][_poolSalt];
    uint32[] memory _secondsAgos = calculateSecondsAgos(periodLength, _lastWorkTimestamp);
    _work(_bridgeSenderAdapter, _chainId, _poolSalt, _secondsAgos);
    emit Bridged(msg.sender, _bridgeSenderAdapter, _chainId, _poolSalt, _secondsAgos);
  }

  /// @inheritdoc IDataFeedJob
  function forceWork(
    IBridgeSenderAdapter _bridgeSenderAdapter,
    uint16 _chainId,
    bytes32 _poolSalt,
    uint32[] memory _secondsAgos
  ) external onlyGovernor {
    _work(_bridgeSenderAdapter, _chainId, _poolSalt, _secondsAgos);
    emit ForceBridged(_bridgeSenderAdapter, _chainId, _poolSalt, _secondsAgos);
  }

  /// @inheritdoc IDataFeedJob
  function setJobCooldown(uint256 _jobCooldown) external onlyGovernor {
    _setJobCooldown(_jobCooldown);
  }

  /// @inheritdoc IDataFeedJob
  function workable(uint16 _chainId, bytes32 _poolSalt) public view returns (bool _isWorkable) {
    // TODO: require _poolSalt and _chainId to be whitelisted
    return block.timestamp >= lastWorkedAt[_chainId][_poolSalt] + jobCooldown;
  }

  /// @inheritdoc IDataFeedJob
  function calculateSecondsAgos(uint32 _periodLength, uint32 _lastKnownTimestamp) public view returns (uint32[] memory _secondsAgos) {
    uint32 _secondsNow = uint32(block.timestamp); // truncation is desired
    // TODO: define initialization of _lastKnownTimestamp
    _lastKnownTimestamp = _lastKnownTimestamp == 0 ? _secondsNow - 5 * periodLength : _lastKnownTimestamp;
    uint32 _unknownTime = _secondsNow - _lastKnownTimestamp;
    uint32 _periods = _unknownTime / _periodLength;
    uint32 _remainder = _unknownTime % _periodLength;
    uint32 _i;

    if (_remainder != 0) {
      _secondsAgos = new uint32[](++_periods);
      _unknownTime -= _remainder;
      _secondsAgos[_i++] = _unknownTime;
    } else {
      _secondsAgos = new uint32[](_periods);
    }

    for (_i; _i < _periods; ) {
      _unknownTime -= _periodLength;
      _secondsAgos[_i++] = _unknownTime;
    }
  }

  function _work(
    IBridgeSenderAdapter _bridgeSenderAdapter,
    uint16 _chainId,
    bytes32 _poolSalt,
    uint32[] memory _secondsAgos
  ) private {
    lastWorkedAt[_chainId][_poolSalt] = uint32(block.timestamp);
    dataFeed.sendObservations(_bridgeSenderAdapter, _chainId, _poolSalt, _secondsAgos);
  }

  function _setJobCooldown(uint256 _jobCooldown) private {
    jobCooldown = _jobCooldown;
    emit JobCooldownUpdated(_jobCooldown);
  }
}
