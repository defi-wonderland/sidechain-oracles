//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {Governable} from '../contracts/peripherals/Governable.sol';
import {IDataFeed, IUniswapV3Pool, IConnextSenderAdapter, IBridgeSenderAdapter, IOracleSidechain} from '../interfaces/IDataFeed.sol';

contract DataFeed is IDataFeed, Governable {
  // TODO: write full natspec when logic is approved
  /// @inheritdoc IDataFeed
  mapping(IBridgeSenderAdapter => bool) public whitelistedAdapters;

  // adapter => destinationDomainId => dataReceiver
  /// @inheritdoc IDataFeed
  mapping(IBridgeSenderAdapter => mapping(uint32 => address)) public receivers;

  // adapter => chainId => destinationDomain
  /// @inheritdoc IDataFeed
  mapping(IBridgeSenderAdapter => mapping(uint16 => uint32)) public destinationDomainIds;

  constructor(address _governance) Governable(_governance) {
    governance = _governance;
  }

  /// @inheritdoc IDataFeed
  function sendObservations(
    IBridgeSenderAdapter _bridgeSenderAdapter,
    uint16 _chainId,
    IUniswapV3Pool _pool,
    uint32[] calldata _secondsAgos
  ) external {
    if (!whitelistedAdapters[_bridgeSenderAdapter]) revert UnallowedAdapter();

    uint32 _destinationDomainId = destinationDomainIds[_bridgeSenderAdapter][_chainId];
    if (_destinationDomainId == 0) revert DestinationDomainIdNotSet();

    address _dataReceiver = receivers[_bridgeSenderAdapter][_destinationDomainId];
    if (_dataReceiver == address(0)) revert ReceiverNotSet();

    IOracleSidechain.ObservationData[] memory _observationsData = fetchObservations(_pool, _secondsAgos);
    _bridgeSenderAdapter.bridgeObservations(_dataReceiver, _destinationDomainId, _observationsData);
    emit DataSent(_bridgeSenderAdapter, _dataReceiver, _destinationDomainId, _observationsData);
  }

  /// @inheritdoc IDataFeed
  function fetchObservations(IUniswapV3Pool _pool, uint32[] calldata _secondsAgos)
    public
    view
    returns (IOracleSidechain.ObservationData[] memory _observationsData)
  {
    uint256 _secondsAgosLength = _secondsAgos.length;
    if (_secondsAgosLength < 2) revert InvalidSecondsAgos();

    (int56[] memory _tickCumulatives, ) = _pool.observe(_secondsAgos);
    uint32 _secondsNow = uint32(block.timestamp); // truncation is desired
    _observationsData = new IOracleSidechain.ObservationData[](--_secondsAgosLength);

    uint256 _j;
    int56 _tickCumulativesDelta;
    uint32 _delta;
    int24 _arithmeticMeanTick;
    uint32 _arithmeticMeanBlockTimestamp;

    for (uint256 _i; _i < _secondsAgosLength; ++_i) {
      _j = _i + 1;
      _tickCumulativesDelta = _tickCumulatives[_j] - _tickCumulatives[_i];
      _delta = _secondsAgos[_i] - _secondsAgos[_j];

      _arithmeticMeanTick = int24(_tickCumulativesDelta / int56(uint56(_delta)));
      // Always round to negative infinity
      if (_tickCumulativesDelta < 0 && (_tickCumulativesDelta % int56(uint56(_delta)) != 0)) --_arithmeticMeanTick;

      _arithmeticMeanBlockTimestamp = ((_secondsNow - _secondsAgos[_i]) + (_secondsNow - _secondsAgos[_j])) / 2;

      _observationsData[_i].blockTimestamp = _arithmeticMeanBlockTimestamp;
      _observationsData[_i].tick = _arithmeticMeanTick;
    }
  }

  /// @inheritdoc IDataFeed
  function whitelistAdapter(IBridgeSenderAdapter _bridgeSenderAdapter, bool _isWhitelisted) external onlyGovernance {
    _whitelistAdapter(_bridgeSenderAdapter, _isWhitelisted);
  }

  /// @inheritdoc IDataFeed
  function whitelistAdapters(IBridgeSenderAdapter[] calldata _bridgeSenderAdapters, bool[] calldata _isWhitelisted) external onlyGovernance {
    uint256 _bridgeSenderAdapterLength = _bridgeSenderAdapters.length;
    if (_bridgeSenderAdapterLength != _isWhitelisted.length) revert LengthMismatch();
    uint256 _i;
    unchecked {
      for (_i; _i < _bridgeSenderAdapterLength; ++_i) {
        _whitelistAdapter(_bridgeSenderAdapters[_i], _isWhitelisted[_i]);
      }
    }
  }

  /// @inheritdoc IDataFeed
  function setReceiver(
    IBridgeSenderAdapter _bridgeSenderAdapter,
    uint32 _destinationDomainId,
    address _dataReceiver
  ) external onlyGovernance {
    _setReceiver(_bridgeSenderAdapter, _destinationDomainId, _dataReceiver);
  }

  /// @inheritdoc IDataFeed
  function setReceivers(
    IBridgeSenderAdapter[] calldata _bridgeSenderAdapters,
    uint32[] calldata _destinationDomainIds,
    address[] calldata _dataReceivers
  ) external onlyGovernance {
    uint256 _bridgeSenderAdapterLength = _bridgeSenderAdapters.length;
    if (_bridgeSenderAdapterLength != _destinationDomainIds.length || _bridgeSenderAdapterLength != _dataReceivers.length)
      revert LengthMismatch();
    uint256 _i;
    unchecked {
      for (_i; _i < _bridgeSenderAdapterLength; ++_i) {
        _setReceiver(_bridgeSenderAdapters[_i], _destinationDomainIds[_i], _dataReceivers[_i]);
      }
    }
  }

  /// @inheritdoc IDataFeed
  function setDestinationDomainId(
    IBridgeSenderAdapter _bridgeSenderAdapter,
    uint16 _chainId,
    uint32 _destinationDomainId
  ) external onlyGovernance {
    _setDestinationDomainId(_bridgeSenderAdapter, _chainId, _destinationDomainId);
  }

  /// @inheritdoc IDataFeed
  function setDestinationDomainIds(
    IBridgeSenderAdapter[] calldata _bridgeSenderAdapters,
    uint16[] calldata _chainIds,
    uint32[] calldata _destinationDomainIds
  ) external onlyGovernance {
    uint256 _bridgeSenderAdapterLength = _bridgeSenderAdapters.length;
    if (_bridgeSenderAdapterLength != _destinationDomainIds.length || _bridgeSenderAdapterLength != _chainIds.length) revert LengthMismatch();
    uint256 _i;
    unchecked {
      for (_i; _i < _bridgeSenderAdapterLength; ++_i) {
        _setDestinationDomainId(_bridgeSenderAdapters[_i], _chainIds[_i], _destinationDomainIds[_i]);
      }
    }
  }

  function _setReceiver(
    IBridgeSenderAdapter _bridgeSenderAdapter,
    uint32 _destinationDomainId,
    address _dataReceiver
  ) internal {
    receivers[_bridgeSenderAdapter][_destinationDomainId] = _dataReceiver;
    emit ReceiverSet(_bridgeSenderAdapter, _destinationDomainId, _dataReceiver);
  }

  function _whitelistAdapter(IBridgeSenderAdapter _bridgeSenderAdapter, bool _isWhitelisted) internal {
    whitelistedAdapters[_bridgeSenderAdapter] = _isWhitelisted;
    emit AdapterWhitelisted(_bridgeSenderAdapter, _isWhitelisted);
  }

  function _setDestinationDomainId(
    IBridgeSenderAdapter _bridgeSenderAdapter,
    uint16 _chainId,
    uint32 _destinationDomainId
  ) internal {
    destinationDomainIds[_bridgeSenderAdapter][_chainId] = _destinationDomainId;
    emit DestinationDomainIdSet(_bridgeSenderAdapter, _chainId, _destinationDomainId);
  }
}
