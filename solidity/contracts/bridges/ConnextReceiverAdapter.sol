// SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IConnextHandler} from '@connext/nxtp-contracts/contracts/core/connext/interfaces/IConnextHandler.sol';
import {IConnextReceiverAdapter, IBridgeReceiverAdapter, IExecutor, IDataReceiver, IOracleSidechain} from '../../interfaces/bridges/IConnextReceiverAdapter.sol';

contract ConnextReceiverAdapter is IConnextReceiverAdapter {
  /// @inheritdoc IConnextReceiverAdapter
  IDataReceiver public immutable dataReceiver;
  /// @inheritdoc IConnextReceiverAdapter
  IExecutor public immutable executor;
  /// @inheritdoc IConnextReceiverAdapter
  address public immutable originContract;
  /// @inheritdoc IConnextReceiverAdapter
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

  function addObservations(IOracleSidechain.ObservationData[] calldata _observationsData, bytes32 _poolSalt) external onlyExecutor {
    dataReceiver.addObservations(_observationsData, _poolSalt);
    emit DataSent(_observationsData, _poolSalt);
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
