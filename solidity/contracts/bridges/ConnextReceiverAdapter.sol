//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IXReceiver} from '@connext/nxtp-contracts/contracts/core/connext/interfaces/IXReceiver.sol';
import {IConnextReceiverAdapter, IDataReceiver, IOracleSidechain} from '../../interfaces/bridges/IConnextReceiverAdapter.sol';
import {BridgeReceiverAdapter} from './BridgeReceiverAdapter.sol';

contract ConnextReceiverAdapter is BridgeReceiverAdapter, IXReceiver, IConnextReceiverAdapter {
  // The connectHandler contract on this domain
  address public connext;
  // The origin domain ID
  uint32 public immutable origin;
  // The DAO that's expected as the xcaller
  address public immutable dao;

  constructor(
    IDataReceiver _dataReceiver,
    address _dao,
    uint32 _origin,
    address _connext
  ) BridgeReceiverAdapter(_dataReceiver) {
    dao = _dao;
    origin = _origin;
    connext = _connext;
  }

  modifier onlyExecutor(address _originSender, uint32 _origin) {
    if (msg.sender != connext || _originSender != dao || _origin != origin) revert UnauthorizedCaller();
    _;
  }

  function xReceive(
    bytes32 _transferId,
    uint256 _amount,
    address _asset,
    address _originSender,
    uint32 _origin,
    bytes memory _callData
  ) external onlyExecutor(_originSender, _origin) returns (bytes memory) {
    (IOracleSidechain.ObservationData[] memory _observationsData, bytes32 _poolSalt, uint24 _poolNonce) = abi.decode(
      _callData,
      (IOracleSidechain.ObservationData[], bytes32, uint24)
    );

    _addObservations(_observationsData, _poolSalt, _poolNonce);
    return bytes(abi.encode('random'));
  }
}
