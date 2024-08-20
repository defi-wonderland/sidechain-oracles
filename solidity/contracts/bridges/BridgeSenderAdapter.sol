//SPDX-License-Identifier: MIT
pragma solidity >=0.8.8 <0.9.0;

import {IBridgeSenderAdapter, IOracleSidechain} from '../../interfaces/bridges/IBridgeSenderAdapter.sol';

abstract contract BridgeSenderAdapter is IBridgeSenderAdapter {
  /// @inheritdoc IBridgeSenderAdapter
  address public immutable dataFeed;

  constructor(address _dataFeed) {
    if (address(_dataFeed) == address(0)) revert ZeroAddress();
    dataFeed = _dataFeed;
  }

  function bridgeObservations(
    address _to,
    uint32 _destinationDomainId,
    IOracleSidechain.ObservationData[] memory _observationsData,
    bytes32 _poolSalt,
    uint24 _poolNonce
  ) external payable onlyDataFeed {
    _bridgeObservations(_to, _destinationDomainId, _observationsData, _poolSalt, _poolNonce);
  }

  function _bridgeObservations(
    address _to,
    uint32 _destinationDomainId,
    IOracleSidechain.ObservationData[] memory _observationsData,
    bytes32 _poolSalt,
    uint24 _poolNonce
  ) internal virtual;

  modifier onlyDataFeed() {
    if (msg.sender != dataFeed) revert OnlyDataFeed();
    _;
  }
}
