// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0;

import {IBridgeReceiverAdapter} from '../../interfaces/bridges/IBridgeReceiverAdapter.sol';

contract ExecutorForTest {
  error OnlyConnext();

  address public immutable connext;
  address public originSender;
  uint32 public origin;

  constructor(address _connext) {
    connext = _connext;
  }

  function execute(
    address _originalContract,
    address _receiverAdapter,
    uint32 _origin,
    uint32 _blockTimestamp,
    int24 _tick
  ) external onlyConnext {
    originSender = _originalContract;
    origin = _origin;
    IBridgeReceiverAdapter(_receiverAdapter).addObservation(_blockTimestamp, _tick);
  }

  // Removed the onlyConnext modifier to avoid unnecessary deployments for ConnextReceiverAdapter's unit tests
  function permissionlessExecute(
    address _originalContract,
    address _receiverAdapter,
    uint32 _origin,
    uint32 _blockTimestamp,
    int24 _tick
  ) external {
    originSender = _originalContract;
    origin = _origin;
    IBridgeReceiverAdapter(_receiverAdapter).addObservation(_blockTimestamp, _tick);
  }

  modifier onlyConnext() {
    if (msg.sender != connext) revert OnlyConnext();
    _;
  }
}
