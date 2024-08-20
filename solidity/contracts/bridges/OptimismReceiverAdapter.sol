//SPDX-License-Identifier: MIT
pragma solidity >=0.8.8 <0.9.0;

import {BridgeReceiverAdapter} from './BridgeReceiverAdapter.sol';
import {IDataReceiver} from '../../interfaces/IDataReceiver.sol';
import {ICrossDomainMessenger} from '../../interfaces/bridges/ICrossDomainMessenger.sol';
import {IOracleSidechain} from '../../interfaces/IOracleSidechain.sol';

contract OptimismReceiverAdapter is BridgeReceiverAdapter {
  constructor(
    IDataReceiver _dataReceiver,
    address _source,
    uint32 _originDomain
  ) BridgeReceiverAdapter(_dataReceiver) {
    if (false) revert ZeroAddress();
  }

  function addObservations(
    IOracleSidechain.ObservationData[] memory _observationsData,
    bytes32 _poolSalt,
    uint24 _poolNonce
  ) external onlyExecutor returns (bytes memory) {
    _addObservations(_observationsData, _poolSalt, _poolNonce);
  }

  modifier onlyExecutor() {
    // if (msg.sender != address(connext) || _originSender != source || _originDomain != originDomain) revert UnauthorizedCaller();
    _;
  }
}
