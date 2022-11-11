//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {Governable} from './peripherals/Governable.sol';
import {IDataFeedStrategy, IUniswapV3Pool, IDataFeed, IBridgeSenderAdapter, IOracleSidechain} from '../interfaces/IDataFeedStrategy.sol';
import {Create2Address} from '../libraries/Create2Address.sol';

contract DataFeedStrategy is IDataFeedStrategy, Governable {
  address internal constant _UNISWAP_FACTORY = 0x1F98431c8aD98523631AE4a59f267346ea31F984;
  bytes32 internal constant _POOL_INIT_CODE_HASH = 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54;

  /// @inheritdoc IDataFeedStrategy
  IDataFeed public immutable dataFeed;

  /// @inheritdoc IDataFeedStrategy
  uint32 public strategyCooldown;

  /// @inheritdoc IDataFeedStrategy
  uint32 public periodLength;

  /// @inheritdoc IDataFeedStrategy
  uint32 public twapLength;

  /// @inheritdoc IDataFeedStrategy
  int24 public upperTwapThreshold;

  /// @inheritdoc IDataFeedStrategy
  int24 public lowerTwapThreshold;

  constructor(
    address _governor,
    IDataFeed _dataFeed,
    StrategySettings memory _params
  ) Governable(_governor) {
    dataFeed = _dataFeed;
    _setStrategyCooldown(_params.cooldown);
    _setTwapLength(_params.twapLength);
    _setPeriodLength(_params.periodLength);
    _setTwapThresholds(_params.upperTwapThreshold, _params.lowerTwapThreshold);
  }

  /// @inheritdoc IDataFeedStrategy
  function strategicFetchObservations(bytes32 _poolSalt, TriggerReason _reason) external {
    if (!isStrategic(_poolSalt, _reason)) revert NotStrategic();
    // TODO: review if the external call can be avoided
    (, uint32 _lastBlockTimestampObserved, , ) = dataFeed.lastPoolStateObserved(_poolSalt);
    uint32[] memory _secondsAgos = calculateSecondsAgos(_lastBlockTimestampObserved);
    dataFeed.fetchObservations(_poolSalt, _secondsAgos);
    emit StrategicFetch(_poolSalt, _reason);
  }

  /// @inheritdoc IDataFeedStrategy
  /// @dev Allows governor to choose a timestamp from which to send data (overcome !OLD error)
  function forceFetchObservations(bytes32 _poolSalt, uint32 _fromTimestamp) external onlyGovernor {
    uint32[] memory _secondsAgos = calculateSecondsAgos(_fromTimestamp);
    dataFeed.fetchObservations(_poolSalt, _secondsAgos);
  }

  /// @inheritdoc IDataFeedStrategy
  function setStrategyCooldown(uint32 _strategyCooldown) external onlyGovernor {
    _setStrategyCooldown(_strategyCooldown);
  }

  /// @inheritdoc IDataFeedStrategy
  function setPeriodLength(uint32 _periodLength) external onlyGovernor {
    _setPeriodLength(_periodLength);
  }

  /// @inheritdoc IDataFeedStrategy
  function setTwapLength(uint32 _twapLength) external onlyGovernor {
    _setTwapLength(_twapLength);
  }

  /// @inheritdoc IDataFeedStrategy
  function setTwapThresholds(int24 _upperTwapThreshold, int24 _lowerTwapThreshold) external onlyGovernor {
    _setTwapThresholds(_upperTwapThreshold, _lowerTwapThreshold);
  }

  function isStrategic(bytes32 _poolSalt) external view returns (TriggerReason _reason) {
    uint32 _secondsNow = uint32(block.timestamp); // truncation is desired
    (, uint32 _lastBlockTimestampObserved, int56 _lastTickCumulativeObserved, int24 _lastArithmeticMeanTickObserved) = dataFeed
      .lastPoolStateObserved(_poolSalt);

    if (_secondsNow >= _lastBlockTimestampObserved + strategyCooldown) return TriggerReason.TIME;

    if (
      _twapIsOutOfThresholds(_poolSalt, _secondsNow, _lastBlockTimestampObserved, _lastTickCumulativeObserved, _lastArithmeticMeanTickObserved)
    ) return TriggerReason.TWAP;
  }

  function isStrategic(bytes32 _poolSalt, TriggerReason _reason) public view returns (bool _isStrategic) {
    uint32 _secondsNow = uint32(block.timestamp); // truncation is desired
    (, uint32 _lastBlockTimestampObserved, int56 _lastTickCumulativeObserved, int24 _lastArithmeticMeanTickObserved) = dataFeed
      .lastPoolStateObserved(_poolSalt);
    if (_reason == TriggerReason.TIME) {
      return _secondsNow >= _lastBlockTimestampObserved + strategyCooldown;
    } else if (_reason == TriggerReason.TWAP) {
      return
        _twapIsOutOfThresholds(
          _poolSalt,
          _secondsNow,
          _lastBlockTimestampObserved,
          _lastTickCumulativeObserved,
          _lastArithmeticMeanTickObserved
        );
    }
  }

  /// @inheritdoc IDataFeedStrategy
  function calculateSecondsAgos(uint32 _fromTimestamp) public view returns (uint32[] memory _secondsAgos) {
    if (_fromTimestamp == 0) return _initializeSecondsAgos();
    uint32 _secondsNow = uint32(block.timestamp); // truncation is desired
    uint32 _timeSinceLastObservation = _secondsNow - _fromTimestamp;
    uint32 _periodLength = periodLength;
    uint32 _periods = _timeSinceLastObservation / _periodLength;
    uint32 _remainder = _timeSinceLastObservation % _periodLength;
    uint32 _i;

    if (_remainder != 0) {
      _secondsAgos = new uint32[](++_periods);
      _timeSinceLastObservation -= _remainder;
      _secondsAgos[_i++] = _timeSinceLastObservation;
    } else {
      _secondsAgos = new uint32[](_periods);
    }

    for (_i; _i < _periods; ) {
      _timeSinceLastObservation -= _periodLength;
      _secondsAgos[_i++] = _timeSinceLastObservation;
    }
  }

  function _twapIsOutOfThresholds(
    bytes32 _poolSalt,
    uint32 _secondsNow,
    uint32 _lastBlockTimestampObserved,
    int56 _lastTickCumulativeObserved,
    int24 _lastArithmeticMeanTickObserved
  ) internal view returns (bool _isOutOfThresholds) {
    uint32 _twapLength = twapLength;

    uint32[] memory _secondsAgos = new uint32[](2);
    _secondsAgos[0] = _twapLength;
    _secondsAgos[1] = 0;

    IUniswapV3Pool _pool = IUniswapV3Pool(Create2Address.computeAddress(_UNISWAP_FACTORY, _poolSalt, _POOL_INIT_CODE_HASH));
    (int56[] memory _poolTickCumulatives, ) = _pool.observe(_secondsAgos);

    int24 _poolArithmeticMeanTick = _computeTwap(_poolTickCumulatives[0], _poolTickCumulatives[1], _twapLength);

    uint32 _oracleDelta = _secondsNow - _lastBlockTimestampObserved;
    int56 _oracleTickCumulative = _lastTickCumulativeObserved + _lastArithmeticMeanTickObserved * int32(_oracleDelta);

    int24 _oracleArithmeticMeanTick = _computeTwap(_poolTickCumulatives[0], _oracleTickCumulative, _twapLength);

    return
      _poolArithmeticMeanTick > _oracleArithmeticMeanTick + upperTwapThreshold ||
      _poolArithmeticMeanTick < _oracleArithmeticMeanTick + lowerTwapThreshold;
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

  function _initializeSecondsAgos() internal view returns (uint32[] memory _secondsAgos) {
    // TODO: define initialization of _secondsAgos
    _secondsAgos = new uint32[](2);
    _secondsAgos[0] = periodLength;
    _secondsAgos[1] = 0; // as if _fromTimestamp = _secondsNow - (periodLength + 1)
  }

  function _setStrategyCooldown(uint32 _strategyCooldown) private {
    if (_strategyCooldown < twapLength) revert WrongSetting();

    strategyCooldown = _strategyCooldown;
    emit StrategyCooldownUpdated(_strategyCooldown);
  }

  function _setPeriodLength(uint32 _periodLength) private {
    if (_periodLength > twapLength) revert WrongSetting();

    periodLength = _periodLength;
    emit PeriodLengthUpdated(_periodLength);
  }

  function _setTwapLength(uint32 _twapLength) private {
    if ((_twapLength > strategyCooldown) || (_twapLength < periodLength)) revert WrongSetting();

    twapLength = _twapLength;
    emit TwapLengthUpdated(_twapLength);
  }

  function _setTwapThresholds(int24 _upperTwapThreshold, int24 _lowerTwapThreshold) private {
    upperTwapThreshold = _upperTwapThreshold;
    lowerTwapThreshold = _lowerTwapThreshold;
    emit TwapThresholdsUpdated(_upperTwapThreshold, _lowerTwapThreshold);
  }
}
