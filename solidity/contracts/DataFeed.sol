//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IDataFeed, IConnextSenderAdapter, IUniswapV3Pool, IBridgeAdapter} from '../interfaces/IDataFeed.sol';
import {Governable} from './peripherals/Governable.sol';

contract DataFeed is Governable, IDataFeed {
  // TODO: natspec when logic is approved
  mapping(IBridgeAdapter => bool) public whitelistedAdapters;

  // adapter => destinationDomainId => dataReceiver
  mapping(IBridgeAdapter => mapping(uint32 => address)) public receivers;

  // adapter => chainId => destinationDomain
  mapping(IBridgeAdapter => mapping(uint16 => uint32)) public destinationDomainIds;

  constructor(address _governance) Governable(_governance) {
    governance = _governance;
  }

  function sendObservation(
    IBridgeAdapter _bridgeAdapter,
    uint16 _chainId,
    IUniswapV3Pool _pool
  ) external {
    if (!whitelistedAdapters[_bridgeAdapter]) revert UnallowedAdapter();

    uint32 _destinationDomainId = destinationDomainIds[_bridgeAdapter][_chainId];
    if (_destinationDomainId == 0) revert DestinationDomainIdNotSet();

    address _dataReceiver = receivers[_bridgeAdapter][_destinationDomainId];
    if (_dataReceiver == address(0)) revert ReceiverNotSet();

    (uint32 _blockTimestamp, int24 _tick) = fetchLatestObservation(_pool);
    _bridgeAdapter.bridgeObservation(_dataReceiver, _destinationDomainId, _blockTimestamp, _tick);
    emit DataSent(_bridgeAdapter, _dataReceiver, _destinationDomainId, _blockTimestamp, _tick);
  }

  function fetchLatestObservation(IUniswapV3Pool _pool) public view returns (uint32 _blockTimestamp, int24 _tick) {
    (, , uint16 _observationIndex, uint16 _observationCardinality, , , ) = _pool.slot0();
    int56 _tickCumulative;
    (_blockTimestamp, _tickCumulative, , ) = _pool.observations(_observationIndex);
    (uint32 _blockTimestampBefore, int56 _tickCumulativeBefore, , ) = _pool.observations(
      (_observationIndex + _observationCardinality - 1) % _observationCardinality
    );
    uint32 _delta = _blockTimestamp - _blockTimestampBefore;
    _tick = int24((_tickCumulative - _tickCumulativeBefore) / int56(uint56(_delta)));
  }

  function whitelistAdapter(IBridgeAdapter _bridgeAdapter, bool _isWhitelisted) external onlyGovernance {
    _whitelistAdapter(_bridgeAdapter, _isWhitelisted);
  }

  function whitelistAdapters(IBridgeAdapter[] calldata _bridgeAdapters, bool[] calldata _isWhitelisted) external onlyGovernance {
    uint256 _bridgeAdapterLength = _bridgeAdapters.length;
    if (_bridgeAdapterLength != _isWhitelisted.length) revert LengthMismatch();
    uint256 _i;
    unchecked {
      for (_i; _i < _bridgeAdapterLength; ++_i) {
        _whitelistAdapter(_bridgeAdapters[_i], _isWhitelisted[_i]);
      }
    }
  }

  function setReceiver(
    IBridgeAdapter _bridgeAdapter,
    uint32 _destinationDomainId,
    address _dataReceiver
  ) external onlyGovernance {
    _setReceiver(_bridgeAdapter, _destinationDomainId, _dataReceiver);
  }

  function setReceivers(
    IBridgeAdapter[] calldata _bridgeAdapters,
    uint32[] calldata _destinationDomainIds,
    address[] calldata _dataReceivers
  ) external onlyGovernance {
    uint256 _bridgeAdapterLength = _bridgeAdapters.length;
    if (_bridgeAdapterLength != _destinationDomainIds.length || _bridgeAdapterLength != _dataReceivers.length) revert LengthMismatch();
    uint256 _i;
    unchecked {
      for (_i; _i < _bridgeAdapterLength; ++_i) {
        _setReceiver(_bridgeAdapters[_i], _destinationDomainIds[_i], _dataReceivers[_i]);
      }
    }
  }

  function setDestinationDomainId(
    IBridgeAdapter _bridgeAdapter,
    uint16 _chainId,
    uint32 _destinationDomainId
  ) external onlyGovernance {
    _setDestinationDomainId(_bridgeAdapter, _chainId, _destinationDomainId);
  }

  function setDestinationDomainIds(
    IBridgeAdapter[] calldata _bridgeAdapters,
    uint16[] calldata _chainIds,
    uint32[] calldata _destinationDomainIds
  ) external onlyGovernance {
    uint256 _bridgeAdapterLength = _bridgeAdapters.length;
    if (_bridgeAdapterLength != _destinationDomainIds.length || _bridgeAdapterLength != _chainIds.length) revert LengthMismatch();
    uint256 _i;
    unchecked {
      for (_i; _i < _bridgeAdapterLength; ++_i) {
        _setDestinationDomainId(_bridgeAdapters[_i], _chainIds[_i], _destinationDomainIds[_i]);
      }
    }
  }

  function _setReceiver(
    IBridgeAdapter _bridgeAdapter,
    uint32 _destinationDomainId,
    address _dataReceiver
  ) internal {
    receivers[_bridgeAdapter][_destinationDomainId] = _dataReceiver;
    emit ReceiverSet(_bridgeAdapter, _destinationDomainId, _dataReceiver);
  }

  function _whitelistAdapter(IBridgeAdapter _bridgeAdapter, bool _isWhitelisted) internal {
    whitelistedAdapters[_bridgeAdapter] = _isWhitelisted;
    emit AdapterWhitelisted(_bridgeAdapter, _isWhitelisted);
  }

  function _setDestinationDomainId(
    IBridgeAdapter _bridgeAdapter,
    uint16 _chainId,
    uint32 _destinationDomainId
  ) internal {
    destinationDomainIds[_bridgeAdapter][_chainId] = _destinationDomainId;
    emit DestinationDomainIdSet(_bridgeAdapter, _chainId, _destinationDomainId);
  }
}
