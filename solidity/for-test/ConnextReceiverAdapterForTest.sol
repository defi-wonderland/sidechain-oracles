//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {ConnextReceiverAdapter, IConnextHandler, IDataReceiver, IOracleSidechain} from '../contracts/bridges/ConnextReceiverAdapter.sol';

contract ConnextReceiverAdapterForTest is ConnextReceiverAdapter {
  constructor(
    IDataReceiver _dataReceiver,
    address _originContract,
    uint32 _originDomain,
    IConnextHandler _connext
  ) ConnextReceiverAdapter(_dataReceiver, _originContract, _originDomain, _connext) {}

  function addPermissionlessObservations(
    IOracleSidechain.ObservationData[] calldata _observationsData,
    address _token0,
    address _token1,
    uint24 _fee
  ) external {
    dataReceiver.addObservations(_observationsData, _token0, _token1, _fee);
    emit DataSent(_observationsData, _token0, _token1, _fee);
  }
}
