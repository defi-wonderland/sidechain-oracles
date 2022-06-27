//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {Governable} from './peripherals/Governable.sol';
import {IDataFeed, IConnextSenderAdapter, IBridgeSenderAdapter, IUniswapV3Pool} from '../interfaces/IDataFeed.sol';

contract DataFeed is IDataFeed, Governable {
  // TODO: natspec when logic is approved
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
  function sendObservation(
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

    (uint32 _arithmeticMeanBlockTimestamp, int24 _arithmeticMeanTick) = fetchObservation(_pool, _secondsAgos);
    _bridgeSenderAdapter.bridgeObservation(_dataReceiver, _destinationDomainId, _arithmeticMeanBlockTimestamp, _arithmeticMeanTick);
    emit DataSent(_bridgeSenderAdapter, _dataReceiver, _destinationDomainId, _arithmeticMeanBlockTimestamp, _arithmeticMeanTick);
  }

  /// @inheritdoc IDataFeed
  function fetchObservation(IUniswapV3Pool _pool, uint32[] calldata _secondsAgos)
    public
    view
    returns (uint32 _arithmeticMeanBlockTimestamp, int24 _arithmeticMeanTick)
  {
    (int56[] memory _tickCumulatives, ) = _pool.observe(_secondsAgos);

    int56 _tickCumulativesDelta = _tickCumulatives[1] - _tickCumulatives[0];
    uint32 _delta = _secondsAgos[0] - _secondsAgos[1];

    _arithmeticMeanTick = int24(_tickCumulativesDelta / int56(uint56(_delta)));
    // Always round to negative infinity
    if (_tickCumulativesDelta < 0 && (_tickCumulativesDelta % int56(uint56(_delta)) != 0)) _arithmeticMeanTick--;

    uint32 _secondsNow = uint32(block.timestamp); // truncation is desired
    _arithmeticMeanBlockTimestamp = ((_secondsNow - _secondsAgos[0]) + (_secondsNow - _secondsAgos[1])) / 2;
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
