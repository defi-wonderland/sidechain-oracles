//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {Keep3rJob, Governable} from './peripherals/Keep3rJob.sol';
import {IDataFeedKeeper, IDataFeed, IBridgeSenderAdapter, IOracleSidechain} from '../interfaces/IDataFeedKeeper.sol';

contract DataFeedKeeper is IDataFeedKeeper, Keep3rJob {
  /// @inheritdoc IDataFeedKeeper
  IDataFeed public immutable dataFeed;

  /// @inheritdoc IDataFeedKeeper
  IBridgeSenderAdapter public defaultBridgeSenderAdapter;

  /// @inheritdoc IDataFeedKeeper
  mapping(uint16 => mapping(bytes32 => uint24)) public lastPoolNonceBridged;

  /// @inheritdoc IDataFeedKeeper
  uint256 public jobCooldown;

  /// @inheritdoc IDataFeedKeeper
  uint32 public periodLength = 1 days;

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
  function work(
    uint16 _chainId,
    bytes32 _poolSalt,
    uint24 _poolNonce,
    IOracleSidechain.ObservationData[] calldata _observationsData
  ) external upkeep {
    // TODO: change criteria for workable (if there's a new nonce, bridge)
    if (!_workable(_chainId, _poolSalt, _poolNonce)) revert NotWorkable();
    lastPoolNonceBridged[_chainId][_poolSalt] = _poolNonce;
    dataFeed.sendObservations(defaultBridgeSenderAdapter, _chainId, _poolSalt, _poolNonce, _observationsData);
  }

  /// @inheritdoc IDataFeedKeeper
  function work(bytes32 _poolSalt) external upkeep {
    if (!_workable(_poolSalt)) revert NotWorkable();
    // TODO: review if the external call can be avoided
    (, uint32 _lastBlockTimestampObserved, , ) = dataFeed.lastPoolStateObserved(_poolSalt);
    uint32[] memory _secondsAgos = calculateSecondsAgos(periodLength, _lastBlockTimestampObserved);
    dataFeed.fetchObservations(_poolSalt, _secondsAgos);
  }

  /// @inheritdoc IDataFeedKeeper
  /// @dev Allows governor to choose a timestamp from which to send data (overcome !OLD error)
  function forceWork(bytes32 _poolSalt, uint32 _fromTimestamp) external onlyGovernor {
    uint32[] memory _secondsAgos = calculateSecondsAgos(periodLength, _fromTimestamp);
    dataFeed.fetchObservations(_poolSalt, _secondsAgos);
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
  function workable(
    uint16 _chainId,
    bytes32 _poolSalt,
    uint24 _poolNonce
  ) public view returns (bool _isWorkable) {
    uint24 _whitelistedNonce = dataFeed.whitelistedNonces(_chainId, _poolSalt);
    if (_whitelistedNonce != 0 && _whitelistedNonce <= _poolNonce) return _workable(_chainId, _poolSalt, _poolNonce);
  }

  /// @inheritdoc IDataFeedKeeper
  function workable(bytes32 _poolSalt) public view returns (bool _isWorkable) {
    if (dataFeed.isWhitelistedPool(_poolSalt)) return _workable(_poolSalt);
  }

  /// @inheritdoc IDataFeedKeeper
  function calculateSecondsAgos(uint32 _periodLength, uint32 _fromTimestamp) public view returns (uint32[] memory _secondsAgos) {
    uint32 _secondsNow = uint32(block.timestamp); // truncation is desired
    // TODO: define initialization of _fromTimestamp
    _fromTimestamp = _fromTimestamp == 0 ? _secondsNow - 5 * _periodLength : _fromTimestamp;
    uint32 _unknownTime = _secondsNow - _fromTimestamp;
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

  function _workable(
    uint16 _chainId,
    bytes32 _poolSalt,
    uint24 _poolNonce
  ) internal view returns (bool _isWorkable) {
    uint24 _lastPoolNonceBridged = lastPoolNonceBridged[_chainId][_poolSalt];
    if (_lastPoolNonceBridged == 0) {
      (uint24 _lastPoolNonceObserved, , , ) = dataFeed.lastPoolStateObserved(_poolSalt);
      return _poolNonce == _lastPoolNonceObserved;
    } else {
      return _poolNonce == ++_lastPoolNonceBridged;
    }
  }

  function _workable(bytes32 _poolSalt) internal view returns (bool _isWorkable) {
    (, uint32 _lastBlockTimestampObserved, , ) = dataFeed.lastPoolStateObserved(_poolSalt);
    return block.timestamp >= _lastBlockTimestampObserved + jobCooldown;
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
