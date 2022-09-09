//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {Governable} from './peripherals/Governable.sol';
import {AdapterManagement} from './peripherals/AdapterManagement.sol';
import {IDataFeed, IUniswapV3Factory, IUniswapV3Pool, IConnextSenderAdapter, IBridgeSenderAdapter, IOracleSidechain} from '../interfaces/IDataFeed.sol';
import {OracleFork} from '../libraries/OracleFork.sol';

contract DataFeed is IDataFeed, AdapterManagement {
  IUniswapV3Factory public constant UNISWAP_FACTORY = IUniswapV3Factory(0x1F98431c8aD98523631AE4a59f267346ea31F984);

  /// @inheritdoc IDataFeed
  PoolState public lastPoolStateBridged;

  constructor(address _governance) Governable(_governance) {}

  /// @inheritdoc IDataFeed
  function sendObservations(
    IBridgeSenderAdapter _bridgeSenderAdapter,
    uint16 _chainId,
    address _tokenA,
    address _tokenB,
    uint24 _fee,
    uint32[] calldata _secondsAgos
  ) external {
    (uint32 _destinationDomainId, address _dataReceiver) = validateSenderAdapter(_bridgeSenderAdapter, _chainId);

    // TODO: replace getPool with pure calculation
    IUniswapV3Pool _pool = IUniswapV3Pool(UNISWAP_FACTORY.getPool(_tokenA, _tokenB, _fee));

    IOracleSidechain.ObservationData[] memory _observationsData;
    // TODO: make lastPoolStateBridged a mapping[bytes?]
    (_observationsData, lastPoolStateBridged) = fetchObservations(_pool, _secondsAgos, true);

    // TODO: sort tokens
    _bridgeSenderAdapter.bridgeObservations(_dataReceiver, _destinationDomainId, _observationsData, _tokenA, _tokenB, _fee);
    emit DataSent(_bridgeSenderAdapter, _dataReceiver, _destinationDomainId, _observationsData, _tokenA, _tokenB, _fee);
  }

  /// @inheritdoc IDataFeed
  function fetchObservations(
    IUniswapV3Pool _pool,
    uint32[] calldata _secondsAgos,
    bool _stitch
  ) public view returns (IOracleSidechain.ObservationData[] memory _observationsData, PoolState memory _lastPoolState) {
    (int56[] memory _tickCumulatives, ) = _pool.observe(_secondsAgos);
    _lastPoolState = lastPoolStateBridged;

    uint32 _secondsNow = uint32(block.timestamp); // truncation is desired
    uint32 _secondsAgo;
    uint32 _delta;
    int56 _tickCumulative;
    int56 _tickCumulativesDelta;
    int24 _arithmeticMeanTick;
    uint256 _secondsAgosLength = _secondsAgos.length;
    uint256 _observationsDataIndex;
    uint256 _i;

    if ((_lastPoolState.blockTimestamp == 0) || !_stitch) {
      if (_secondsAgosLength == 1) revert InvalidSecondsAgos();
      // initializes timestamp and cumulative with first item (and skips it)
      _observationsData = new IOracleSidechain.ObservationData[](_secondsAgosLength - 1);
      _secondsAgo = _secondsAgos[0];
      _tickCumulative = _tickCumulatives[0];
      ++_i;
    } else {
      // initializes timestamp and cumulative with cache
      _observationsData = new IOracleSidechain.ObservationData[](_secondsAgosLength);
      _secondsAgo = _secondsNow - _lastPoolState.blockTimestamp;
      _tickCumulative = _lastPoolState.tickCumulative;
    }

    for (_i; _i < _secondsAgosLength; ++_i) {
      _tickCumulativesDelta = _tickCumulatives[_i] - _tickCumulative;
      _delta = _secondsAgo - _secondsAgos[_i];
      _arithmeticMeanTick = int24(_tickCumulativesDelta / int32(_delta));

      // Always round to negative infinity
      if (_tickCumulativesDelta < 0 && (_tickCumulativesDelta % int32(_delta) != 0)) --_arithmeticMeanTick;

      _observationsData[_observationsDataIndex++] = IOracleSidechain.ObservationData({
        blockTimestamp: _secondsNow - _secondsAgo,
        tick: _arithmeticMeanTick
      });

      _secondsAgo = _secondsAgos[_i];
      _tickCumulative = _tickCumulatives[_i];
    }

    _lastPoolState = PoolState({
      blockTimestamp: _secondsNow - _secondsAgo,
      tickCumulative: _tickCumulative,
      arithmeticMeanTick: _arithmeticMeanTick
    });
  }

  function fetchObservationsIndices(IUniswapV3Pool _pool, uint32[] calldata _secondsAgos)
    external
    view
    returns (uint16[] memory _observationsIndices)
  {
    (, , uint16 _observationIndex, uint16 _observationCardinality, , , ) = _pool.slot0();
    uint256 _secondsAgosLength = _secondsAgos.length;
    uint32 _time = uint32(block.timestamp);
    uint32 _target;
    uint16 _beforeOrAtIndex;
    _observationsIndices = new uint16[](_secondsAgosLength);

    for (uint256 _i; _i < _secondsAgosLength; ++_i) {
      _target = _time - _secondsAgos[_i];
      _beforeOrAtIndex = OracleFork.getPreviousObservationIndex(_pool, _time, _target, _observationIndex, _observationCardinality);
      _observationsIndices[_i] = _beforeOrAtIndex;
    }
  }
}
