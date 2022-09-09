// SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {ConnextReceiverAdapter, IConnextHandler, IDataReceiver, IOracleSidechain} from '../contracts/bridges/ConnextReceiverAdapter.sol';

contract ConnextReceiverAdapterForTest is ConnextReceiverAdapter {
  constructor(
    IDataReceiver _dataReceiver,
    address _originContract,
    uint32 _originDomain,
    IConnextHandler _connext
  ) ConnextReceiverAdapter(_dataReceiver, _originContract, _originDomain, _connext) {}

  // TODO: reuse adapter logic (don't rewrite code)
  function addPermissionlessObservations(IOracleSidechain.ObservationData[] calldata _observationsData, bytes32 _poolSalt) external {
    dataReceiver.addObservations(_observationsData, _poolSalt);
    emit DataSent(_observationsData, _poolSalt);
  }
}
