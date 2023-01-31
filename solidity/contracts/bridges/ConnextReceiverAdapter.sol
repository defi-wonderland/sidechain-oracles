//SPDX-License-Identifier: MIT
pragma solidity >=0.8.8 <0.9.0;

import {BridgeReceiverAdapter} from './BridgeReceiverAdapter.sol';
import {IConnext, IXReceiver, IConnextReceiverAdapter, IDataReceiver, IOracleSidechain} from '../../interfaces/bridges/IConnextReceiverAdapter.sol';

contract ConnextReceiverAdapter is IConnextReceiverAdapter, BridgeReceiverAdapter {
  /// @inheritdoc IConnextReceiverAdapter
  IConnext public immutable connext;

  /// @inheritdoc IConnextReceiverAdapter
  address public immutable source;

  /// @inheritdoc IConnextReceiverAdapter
  uint32 public immutable originDomain;

  constructor(
    IDataReceiver _dataReceiver,
    IConnext _connext,
    address _source,
    uint32 _originDomain
  ) BridgeReceiverAdapter(_dataReceiver) {
    if (address(_connext) == address(0) || _source == address(0)) revert ConnextReceiverAdapter_ZeroAddress();
    connext = _connext;
    source = _source;
    originDomain = _originDomain;
  }

  /// @inheritdoc IXReceiver
  function xReceive(
    bytes32, // _transferId
    uint256, // _amount
    address, // _asset
    address _originSender,
    uint32 _origin,
    bytes memory _callData
  ) external onlyExecutor(_originSender, _origin) returns (bytes memory) {
    (IOracleSidechain.ObservationData[] memory _observationsData, bytes32 _poolSalt, uint24 _poolNonce) = abi.decode(
      _callData,
      (IOracleSidechain.ObservationData[], bytes32, uint24)
    );

    _addObservations(_observationsData, _poolSalt, _poolNonce);
  }

  modifier onlyExecutor(address _originSender, uint32 _originDomain) {
    if (msg.sender != address(connext) || _originSender != source || _originDomain != originDomain)
      revert ConnextReceiverAdapter_UnauthorizedCaller();
    _;
  }
}
