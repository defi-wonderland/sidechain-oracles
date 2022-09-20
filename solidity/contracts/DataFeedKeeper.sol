//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {Keep3rJob, Governable} from './peripherals/Keep3rJob.sol';
import {IDataFeedKeeper, IDataFeed, IBridgeSenderAdapter} from '../interfaces/IDataFeedKeeper.sol';

contract DataFeedKeeper is IDataFeedKeeper, Keep3rJob {
  /// @inheritdoc IDataFeedKeeper
  IDataFeed public immutable dataFeed;

  /// @inheritdoc IDataFeedKeeper
  IBridgeSenderAdapter public defaultBridgeSenderAdapter;

  /// @inheritdoc IDataFeedKeeper
  uint256 public jobCooldown;

  /// @inheritdoc IDataFeedKeeper
  uint32 public periodLength = 1 days;

  /// @inheritdoc IDataFeedKeeper
  mapping(uint16 => mapping(bytes32 => uint32)) public lastWorkedAt;

  /// @inheritdoc IDataFeedKeeper
  mapping(uint16 => mapping(bytes32 => bool)) public whitelistedPools;

  constructor(
    address _governor,
    IDataFeed _dataFeed,
    IBridgeSenderAdapter _defaultBridgeSenderAdapter,
    uint256 _jobCooldown
  ) Governable(_governor) {
    dataFeed = _dataFeed;
    _setDefaultBridgeSenderAdapter(_defaultBridgeSenderAdapter);
    _setJobCooldown(_jobCooldown);
  }

  /// @inheritdoc IDataFeedKeeper
  function work(uint16 _chainId, bytes32 _poolSalt) external upkeep {
    if (!workable(_chainId, _poolSalt)) revert NotWorkable();
    uint32 _lastWorkTimestamp = lastWorkedAt[_chainId][_poolSalt];
    uint32[] memory _secondsAgos = calculateSecondsAgos(periodLength, _lastWorkTimestamp);
    _work(defaultBridgeSenderAdapter, _chainId, _poolSalt, _secondsAgos);
    emit Bridged(msg.sender, _chainId, _poolSalt, _secondsAgos);
  }

  /// @inheritdoc IDataFeedKeeper
  function forceWork(
    IBridgeSenderAdapter _bridgeSenderAdapter,
    uint16 _chainId,
    bytes32 _poolSalt,
    uint32[] memory _secondsAgos
  ) external onlyGovernor {
    _work(_bridgeSenderAdapter, _chainId, _poolSalt, _secondsAgos);
    emit ForceBridged(_bridgeSenderAdapter, _chainId, _poolSalt, _secondsAgos);
  }

  /// @inheritdoc IDataFeedKeeper
  function setDefaultBridgeSenderAdapter(IBridgeSenderAdapter _defaultBridgeSenderAdapter) external onlyGovernor {
    _setDefaultBridgeSenderAdapter(_defaultBridgeSenderAdapter);
  }

  /// @inheritdoc IDataFeedKeeper
  function setJobCooldown(uint256 _jobCooldown) external onlyGovernor {
    _setJobCooldown(_jobCooldown);
  }

  /// @inheritdoc IDataFeedKeeper
  function whitelistPool(
    uint16 _chainId,
    bytes32 _poolSalt,
    bool _isWhitelisted
  ) external onlyGovernor {
    _whitelistPool(_chainId, _poolSalt, _isWhitelisted);
  }

  /// @inheritdoc IDataFeedKeeper
  function whitelistPools(
    uint16[] calldata _chainIds,
    bytes32[] calldata _poolSalts,
    bool[] calldata _isWhitelisted
  ) external onlyGovernor {
    uint256 _chainIdsLength = _chainIds.length;
    if (_chainIdsLength != _poolSalts.length || _chainIdsLength != _isWhitelisted.length) revert LengthMismatch();
    unchecked {
      for (uint256 _i; _i < _chainIdsLength; ++_i) {
        _whitelistPool(_chainIds[_i], _poolSalts[_i], _isWhitelisted[_i]);
      }
    }
  }

  /// @inheritdoc IDataFeedKeeper
  function workable(uint16 _chainId, bytes32 _poolSalt) public view returns (bool _isWorkable) {
    if (whitelistedPools[_chainId][_poolSalt]) return block.timestamp >= lastWorkedAt[_chainId][_poolSalt] + jobCooldown;
  }

  /// @inheritdoc IDataFeedKeeper
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

  function _whitelistPool(
    uint16 _chainId,
    bytes32 _poolSalt,
    bool _isWhitelisted
  ) internal {
    whitelistedPools[_chainId][_poolSalt] = _isWhitelisted;
    emit PoolWhitelisted(_chainId, _poolSalt, _isWhitelisted);
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

  function _setDefaultBridgeSenderAdapter(IBridgeSenderAdapter _defaultBridgeSenderAdapter) private {
    defaultBridgeSenderAdapter = _defaultBridgeSenderAdapter;
    emit DefaultBridgeSenderAdapterUpdated(_defaultBridgeSenderAdapter);
  }

  function _setJobCooldown(uint256 _jobCooldown) private {
    jobCooldown = _jobCooldown;
    emit JobCooldownUpdated(_jobCooldown);
  }
}
