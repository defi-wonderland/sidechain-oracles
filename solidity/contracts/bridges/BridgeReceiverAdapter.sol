//SPDX-License-Identifier: MIT
pragma solidity >=0.8.8 <0.9.0;

import {IBridgeReceiverAdapter, IDataReceiver, IOracleSidechain} from '../../interfaces/bridges/IBridgeReceiverAdapter.sol';

abstract contract BridgeReceiverAdapter is IBridgeReceiverAdapter {
  /// @inheritdoc IBridgeReceiverAdapter
  IDataReceiver public immutable dataReceiver;

  constructor(IDataReceiver _dataReceiver) {
    if (address(_dataReceiver) == address(0)) revert ZeroAddress();
    dataReceiver = _dataReceiver;
  }

  function _addObservations(
    IOracleSidechain.ObservationData[] memory _observationsData,
    bytes32 _poolSalt,
    uint24 _poolNonce
  ) internal {
    dataReceiver.addObservations(_observationsData, _poolSalt, _poolNonce);
  }
}
