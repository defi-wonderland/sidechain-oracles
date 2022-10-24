//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {Keep3rJob, Governable} from './peripherals/Keep3rJob.sol';
import {IDataFeedKeeper, IDataFeed, IUniswapV3Pool, IBridgeSenderAdapter, IOracleSidechain} from '../interfaces/IDataFeedKeeper.sol';
import {Create2Address} from '../libraries/Create2Address.sol';

contract DataFeedKeeper is IDataFeedKeeper, Keep3rJob {
  address internal constant _UNISWAP_FACTORY = 0x1F98431c8aD98523631AE4a59f267346ea31F984;
  bytes32 internal constant _POOL_INIT_CODE_HASH = 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54;

  /// @inheritdoc IDataFeedKeeper
  IDataFeed public immutable dataFeed;

  /// @inheritdoc IDataFeedKeeper
  IBridgeSenderAdapter public defaultBridgeSenderAdapter;

  /// @inheritdoc IDataFeedKeeper
  mapping(uint16 => mapping(bytes32 => uint24)) public lastPoolNonceBridged;

  /// @inheritdoc IDataFeedKeeper
  uint32 public jobCooldown;

  /// @inheritdoc IDataFeedKeeper
  uint32 public periodLength;

  /// @inheritdoc IDataFeedKeeper
  uint32 public twapLength;

  /// @inheritdoc IDataFeedKeeper
  int24 public upperTwapThreshold;

  /// @inheritdoc IDataFeedKeeper
  int24 public lowerTwapThreshold;

  constructor(
    address _governor,
    IDataFeed _dataFeed,
    IBridgeSenderAdapter _defaultBridgeSenderAdapter,
    uint32 _jobCooldown,
    uint32 _periodLength
  ) Governable(_governor) {
    dataFeed = _dataFeed;
    _setDefaultBridgeSenderAdapter(_defaultBridgeSenderAdapter);
    _setJobCooldown(_jobCooldown);
    _setPeriodLength(_periodLength);
    // TODO: _setTwapLength(), _setTwapTriggers();
  }

  /// @inheritdoc IDataFeedKeeper
  function work(
    uint16 _chainId,
    bytes32 _poolSalt,
    uint24 _poolNonce,
    IOracleSidechain.ObservationData[] memory _observationsData
  ) external upkeep {
    // TODO: change criteria for workable (if there's a new nonce, bridge)
    if (!_workable(_chainId, _poolSalt, _poolNonce)) revert NotWorkable();
    lastPoolNonceBridged[_chainId][_poolSalt] = _poolNonce;
    dataFeed.sendObservations(defaultBridgeSenderAdapter, _chainId, _poolSalt, _poolNonce, _observationsData);
  }

  /// @inheritdoc IDataFeedKeeper
  function work(bytes32 _poolSalt, TriggerReason _reason) external upkeep {
    if (!_workable(_poolSalt, _reason)) revert NotWorkable();
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
  function setJobCooldown(uint32 _jobCooldown) external onlyGovernor {
    _setJobCooldown(_jobCooldown);
  }

  /// @inheritdoc IDataFeedKeeper
  function setPeriodLength(uint32 _periodLength) external onlyGovernor {
    _setPeriodLength(_periodLength);
  }

  /// @inheritdoc IDataFeedKeeper
  function setTwapLength(uint32 _twapLength) external onlyGovernor {
    _setTwapLength(_twapLength);
  }

  /// @inheritdoc IDataFeedKeeper
  function setTwapThresholds(int24 _upperTwapThreshold, int24 _lowerTwapThreshold) external onlyGovernor {
    _setTwapThresholds(_upperTwapThreshold, _lowerTwapThreshold);
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
  function workable(bytes32 _poolSalt, TriggerReason _reason) public view returns (bool _isWorkable) {
    if (dataFeed.isWhitelistedPool(_poolSalt)) return _workable(_poolSalt, _reason);
  }

  /// @inheritdoc IDataFeedKeeper
  function calculateSecondsAgos(uint32 _periodLength, uint32 _fromTimestamp) public view returns (uint32[] memory _secondsAgos) {
    uint32 _secondsNow = uint32(block.timestamp); // truncation is desired
    // TODO: define initialization of _fromTimestamp
    _fromTimestamp = _fromTimestamp == 0 ? _secondsNow - (_periodLength + 1) : _fromTimestamp;
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

  function _workable(bytes32 _poolSalt, TriggerReason _reason) internal view returns (bool _isWorkable) {
    if (_reason == TriggerReason.TIME) {
      (, uint32 _lastBlockTimestampObserved, , ) = dataFeed.lastPoolStateObserved(_poolSalt);
      return block.timestamp >= _lastBlockTimestampObserved + jobCooldown; // TODO: should we truncate block.timestamp?
    } else if (_reason == TriggerReason.TWAP) {
      uint32 _twapLength = twapLength;

      uint32[] memory _secondsAgos = new uint32[](2);
      _secondsAgos[0] = _twapLength;
      _secondsAgos[1] = 0;

      IUniswapV3Pool _pool = IUniswapV3Pool(Create2Address.computeAddress(_UNISWAP_FACTORY, _poolSalt, _POOL_INIT_CODE_HASH));
      (int56[] memory _poolTickCumulatives, ) = _pool.observe(_secondsAgos);

      int24 _poolArithmeticMeanTick = _computeTwap(_poolTickCumulatives[0], _poolTickCumulatives[1], _twapLength);

      (, uint32 _lastBlockTimestampObserved, int56 _lastTickCumulativeObserved, int24 _lastArithmeticMeanTickObserved) = dataFeed
        .lastPoolStateObserved(_poolSalt);

      uint32 _secondsNow = uint32(block.timestamp); // truncation is desired
      uint32 _oracleDelta = _secondsNow - _lastBlockTimestampObserved;
      int56 _oracleTickCumulative = _lastTickCumulativeObserved + _lastArithmeticMeanTickObserved * int32(_oracleDelta);

      int24 _oracleArithmeticMeanTick = _computeTwap(_poolTickCumulatives[0], _oracleTickCumulative, _twapLength);

      return
        _poolArithmeticMeanTick > _oracleArithmeticMeanTick + upperTwapThreshold ||
        _poolArithmeticMeanTick < _oracleArithmeticMeanTick + lowerTwapThreshold;
    }
  }

  function _computeTwap(
    int56 _tickCumulative1,
    int56 _tickCumulative2,
    uint32 _delta
  ) internal pure returns (int24 _arithmeticMeanTick) {
    int56 _tickCumulativesDelta = _tickCumulative2 - _tickCumulative1;
    _arithmeticMeanTick = int24(_tickCumulativesDelta / int32(_delta));
    // Always round to negative infinity
    if (_tickCumulativesDelta < 0 && (_tickCumulativesDelta % int32(_delta) != 0)) --_arithmeticMeanTick;
  }

  function _setDefaultBridgeSenderAdapter(IBridgeSenderAdapter _defaultBridgeSenderAdapter) private {
    defaultBridgeSenderAdapter = _defaultBridgeSenderAdapter;
    emit DefaultBridgeSenderAdapterUpdated(_defaultBridgeSenderAdapter);
  }

  function _setJobCooldown(uint32 _jobCooldown) private {
    if (
      (_jobCooldown <= periodLength)
      // TODO: define settings requirements with @particle
      // || (_jobCooldown >= twapLength)
    ) revert WrongSetting();
    jobCooldown = _jobCooldown;
    emit JobCooldownUpdated(_jobCooldown);
  }

  function _setPeriodLength(uint32 _periodLength) private {
    if (_periodLength >= jobCooldown) revert WrongSetting();
    periodLength = _periodLength;
    emit PeriodLengthUpdated(_periodLength);
  }

  function _setTwapLength(uint32 _twapLength) private {
    //if (_twapLength <= jobCooldown) revert WrongSetting();
    twapLength = _twapLength;
    emit TwapLengthUpdated(_twapLength);
  }

  function _setTwapThresholds(int24 _upperTwapThreshold, int24 _lowerTwapThreshold) private {
    // TODO: define settings requirements KMC-130
    upperTwapThreshold = _upperTwapThreshold;
    lowerTwapThreshold = _lowerTwapThreshold;
    emit TwapThresholdsUpdated(_upperTwapThreshold, _lowerTwapThreshold);
  }
}
