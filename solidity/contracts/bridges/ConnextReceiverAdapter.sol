//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IConnextReceiverAdapter, IExecutor, IDataReceiver} from '../../interfaces/bridges/IConnextReceiverAdapter.sol';
import {IConnextHandler} from '@connext/nxtp-contracts/contracts/core/connext/interfaces/IConnextHandler.sol';

contract ConnextReceiverAdapter is IConnextReceiverAdapter {
  IDataReceiver public immutable dataReceiver;
  IExecutor public immutable executor;
  address public immutable originContract;
  uint32 public immutable originDomain;

  constructor(
    IDataReceiver _dataReceiver,
    address _originContract,
    uint32 _originDomain,
    IConnextHandler _connext
  ) {
    dataReceiver = _dataReceiver;
    originContract = _originContract;
    originDomain = _originDomain;
    executor = _connext.executor();
  }

  function addObservation(uint32 _blockTimestamp, int24 _tick) external onlyExecutor {
    dataReceiver.addObservation(_blockTimestamp, _tick);
    emit ObservationSent(_blockTimestamp, _tick);
  }

  modifier onlyExecutor() {
    if (
      IExecutor(msg.sender) != executor ||
      IExecutor(msg.sender).originSender() != originContract ||
      IExecutor(msg.sender).origin() != originDomain
    ) revert UnauthorizedCaller();
    _;
  }
}
