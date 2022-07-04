//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {ConnextReceiverAdapter, IDataReceiver, IConnextHandler} from '../bridges/ConnextReceiverAdapter.sol';

contract ConnextReceiverAdapterForTest is ConnextReceiverAdapter {
  constructor(
    IDataReceiver _dataReceiver,
    address _originContract,
    uint32 _originDomain,
    IConnextHandler _connext
  ) ConnextReceiverAdapter(_dataReceiver, _originContract, _originDomain, _connext) {}

  function addPermissionlessObservation(uint32 _blockTimestamp, int24 _tick) external {
    dataReceiver.addObservation(_blockTimestamp, _tick);
    emit ObservationSent(_blockTimestamp, _tick);
  }
}
