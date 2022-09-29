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
  uint256 public jobCooldown;

  /// @inheritdoc IDataFeedKeeper
  uint32 public periodLength = 1 days;

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
  function work(
    uint16 _chainId,
    bytes32 _poolSalt,
    uint24 _poolNonce,
    IOracleSidechain.ObservationData[] calldata _observationsData
  ) external upkeep {
    // TODO: change criteria for workable (if there's a new nonce, bridge)
    if (!workable(_chainId, _poolSalt, _poolNonce)) revert NotWorkable();
    dataFeed.sendObservations(defaultBridgeSenderAdapter, _chainId, _poolSalt, _poolNonce, _observationsData);
  }

  /// @inheritdoc IDataFeedKeeper
  function work(bytes32 _poolSalt) external upkeep {
    if (!workable(_poolSalt)) revert NotWorkable();
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
  function workable(
    uint16 _chainId,
    bytes32 _poolSalt,
    uint24 _poolNonce
  ) public view returns (bool _isWorkable) {
    return true;
  }

  /// @inheritdoc IDataFeedKeeper
  function workable(bytes32 _poolSalt) public view returns (bool _isWorkable) {
    // TODO: if (whitelistedPools[_chainId][_poolSalt])?
    (, uint32 _lastBlockTimestampObserved, , ) = dataFeed.lastPoolStateObserved(_poolSalt);
    return block.timestamp >= _lastBlockTimestampObserved + jobCooldown;
  }

  /// @inheritdoc IDataFeedKeeper
  function calculateSecondsAgos(uint32 _periodLength, uint32 _fromTimestamp) public view returns (uint32[] memory _secondsAgos) {
    uint32 _secondsNow = uint32(block.timestamp); // truncation is desired
    // TODO: define initialization of _fromTimestamp
    _fromTimestamp = _fromTimestamp == 0 ? _secondsNow - 5 * periodLength : _fromTimestamp;
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

  function _whitelistPool(
    uint16 _chainId,
    bytes32 _poolSalt,
    bool _isWhitelisted
  ) internal {
    whitelistedPools[_chainId][_poolSalt] = _isWhitelisted;
    emit PoolWhitelisted(_chainId, _poolSalt, _isWhitelisted);
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
