//SPDX-License-Identifier: MIT
pragma solidity >=0.8.8 <0.9.0;

import {BridgeReceiverAdapter} from './BridgeReceiverAdapter.sol';
import {IDataReceiver} from '../../interfaces/IDataReceiver.sol';
import {ICrossDomainMessenger} from '../../interfaces/bridges/ICrossDomainMessenger.sol';
import {IOracleSidechain} from '../../interfaces/IOracleSidechain.sol';

contract OptimismReceiverAdapter is BridgeReceiverAdapter {
  ICrossDomainMessenger public immutable messenger;
  address public immutable source;

  constructor(
    IDataReceiver _dataReceiver,
    address _messenger,
    address _source
  ) BridgeReceiverAdapter(_dataReceiver) {
    if (_messenger == address(0) || _source == address(0)) revert ZeroAddress();
    messenger = ICrossDomainMessenger(_messenger);
    source = _source;
  }

  function addObservations(
    IOracleSidechain.ObservationData[] memory _observationsData,
    bytes32 _poolSalt,
    uint24 _poolNonce
  ) external onlyExecutor returns (bytes memory) {
    _addObservations(_observationsData, _poolSalt, _poolNonce);
  }

  modifier onlyExecutor() {
    if (msg.sender != address(messenger) || messenger.xDomainMessageSender() != source) revert UnauthorizedCaller();
    _;
  }
}
