//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {Governable} from './peripherals/Governable.sol';
import {AdapterManagement} from './peripherals/AdapterManagement.sol';
import {IDataFeed, IDataFeedKeeper, IUniswapV3Pool, IConnextSenderAdapter, IBridgeSenderAdapter, IOracleSidechain} from '../interfaces/IDataFeed.sol';
import {OracleFork} from '../libraries/OracleFork.sol';
import {Create2Address} from '../libraries/Create2Address.sol';

contract DataFeed is IDataFeed, AdapterManagement {
  address internal constant _UNISWAP_FACTORY = 0x1F98431c8aD98523631AE4a59f267346ea31F984;
  bytes32 internal constant _POOL_INIT_CODE_HASH = 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54;

  /// @inheritdoc IDataFeed
  IDataFeedKeeper public keeper;

  /// @inheritdoc IDataFeed
  mapping(bytes32 => PoolState) public lastPoolStateObserved;

  mapping(bytes32 => bool) internal _observedKeccak;

  constructor(address _governor, IDataFeedKeeper _keeper) Governable(_governor) {
    _setKeeper(_keeper);
  }

  /// @inheritdoc IDataFeed
  function sendObservations(
    IBridgeSenderAdapter _bridgeSenderAdapter,
    uint16 _chainId,
    bytes32 _poolSalt,
    uint24 _poolNonce,
    IOracleSidechain.ObservationData[] calldata _observationsData
  ) external {
    (uint32 _destinationDomainId, address _dataReceiver) = validateSenderAdapter(_bridgeSenderAdapter, _chainId);
    bytes32 _resultingKeccak = keccak256(abi.encode(_poolSalt, _poolNonce, _observationsData));
    if (!_observedKeccak[_resultingKeccak]) revert UnknownHash();

    _bridgeSenderAdapter.bridgeObservations(_dataReceiver, _destinationDomainId, _observationsData, _poolSalt, _poolNonce);
    // TODO: review event emissions KMC-86
    emit DataSent(_bridgeSenderAdapter, _dataReceiver, _destinationDomainId, _observationsData, _poolSalt);
  }

  /// @inheritdoc IDataFeed
  function fetchObservations(bytes32 _poolSalt, uint32[] calldata _secondsAgos) external onlyKeeper {
    IOracleSidechain.ObservationData[] memory _observationsData;
    PoolState memory _lastPoolStateObserved = lastPoolStateObserved[_poolSalt];

    {
      IUniswapV3Pool _pool = IUniswapV3Pool(Create2Address.computeAddress(_UNISWAP_FACTORY, _poolSalt, _POOL_INIT_CODE_HASH));

      (int56[] memory _tickCumulatives, ) = _pool.observe(_secondsAgos);

      uint32 _secondsNow = uint32(block.timestamp); // truncation is desired
      uint32 _secondsAgo;
      int56 _tickCumulative;
      int24 _arithmeticMeanTick;
      uint256 _secondsAgosLength = _secondsAgos.length;
      uint256 _i;

      {
        if ((_lastPoolStateObserved.blockTimestamp == 0)) {
          if (_secondsAgosLength == 1) revert InvalidSecondsAgos();
          // initializes timestamp and cumulative with first item (and skips it)
          _observationsData = new IOracleSidechain.ObservationData[](_secondsAgosLength - 1);
          _secondsAgo = _secondsAgos[0];
          _tickCumulative = _tickCumulatives[0];
          ++_i;
        } else {
          // initializes timestamp and cumulative with cache
          _observationsData = new IOracleSidechain.ObservationData[](_secondsAgosLength);
          _secondsAgo = _secondsNow - _lastPoolStateObserved.blockTimestamp;
          _tickCumulative = _lastPoolStateObserved.tickCumulative;
        }
      }

      {
        uint32 _delta;
        int56 _tickCumulativesDelta;
        uint256 _observationsDataIndex;

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
      }

      _lastPoolStateObserved = PoolState({
        poolNonce: _lastPoolStateObserved.poolNonce + 1,
        blockTimestamp: _secondsNow - _secondsAgo,
        tickCumulative: _tickCumulative,
        arithmeticMeanTick: _arithmeticMeanTick
      });

      lastPoolStateObserved[_poolSalt] = _lastPoolStateObserved;
    }

    bytes32 _resultingKeccak = keccak256(abi.encode(_poolSalt, _lastPoolStateObserved.poolNonce, _observationsData));
    _observedKeccak[_resultingKeccak] = true;

    emit PoolObserved(_poolSalt, _lastPoolStateObserved.poolNonce, _observationsData);
  }

  /// @inheritdoc IDataFeed
  /// @dev High gas consuming view, avoid using in txs
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

  /// @inheritdoc IDataFeed
  function setKeeper(IDataFeedKeeper _keeper) external onlyGovernor {
    _setKeeper(_keeper);
  }

  function _setKeeper(IDataFeedKeeper _keeper) private {
    keeper = _keeper;
    emit KeeperUpdated(_keeper);
  }

  modifier onlyKeeper() {
    if (msg.sender != address(keeper)) revert OnlyKeeper();
    _;
  }
}
