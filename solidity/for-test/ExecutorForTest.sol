// SPDX-License-Identifier: MIT
pragma solidity >=0.8.8 <0.9.0;

import {IBridgeReceiverAdapter} from '../interfaces/bridges/IBridgeReceiverAdapter.sol';
import {IOracleSidechain} from '../interfaces/IOracleSidechain.sol';

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
    IOracleSidechain.ObservationData[] calldata _observationsData,
    address _token0,
    address _token1,
    uint24 _fee
  ) external onlyConnext {
    originSender = _originalContract;
    origin = _origin;
    IBridgeReceiverAdapter(_receiverAdapter).addObservations(_observationsData, _token0, _token1, _fee);
  }

  // Removed the onlyConnext modifier to avoid unnecessary deployments for ConnextReceiverAdapter's unit tests
  function permissionlessExecute(
    address _originalContract,
    address _receiverAdapter,
    uint32 _origin,
    IOracleSidechain.ObservationData[] calldata _observationsData,
    address _token0,
    address _token1,
    uint24 _fee
  ) external {
    originSender = _originalContract;
    origin = _origin;
    IBridgeReceiverAdapter(_receiverAdapter).addObservations(_observationsData, _token0, _token1, _fee);
  }

  modifier onlyConnext() {
    if (msg.sender != connext) revert OnlyConnext();
    _;
  }
}
