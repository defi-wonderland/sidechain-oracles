//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {ConnextReceiverAdapter, IDataReceiver, IOracleSidechain} from '../contracts/bridges/ConnextReceiverAdapter.sol';

contract ConnextReceiverAdapterForTest is ConnextReceiverAdapter {
  constructor(
    IDataReceiver _dataReceiver,
    address _originContract,
    uint32 _originDomain,
    address _connext
  ) ConnextReceiverAdapter(_dataReceiver, _originContract, _originDomain, _connext) {}

  function internalAddObservations(
    IOracleSidechain.ObservationData[] memory _observationsData,
    bytes32 _poolSalt,
    uint24 _poolNonce
  ) external {
    _addObservations(_observationsData, _poolSalt, _poolNonce);
  }
}
