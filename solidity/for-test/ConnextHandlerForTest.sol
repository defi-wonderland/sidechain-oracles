// SPDX-License-Identifier: MIT
pragma solidity >=0.8.8 <0.9.0;

import {LibConnextStorage, XCallArgs} from '@connext/nxtp-contracts/contracts/core/connext/libraries/LibConnextStorage.sol';
import {IOracleSidechain} from '../interfaces/IOracleSidechain.sol';

interface IExecutorLike {
  function execute(
    address _originalSender,
    address _receiverAdapter,
    uint32 _originDomain,
    IOracleSidechain.ObservationData[] calldata _observationsData,
    bytes32 _poolSalt
  ) external;
}

contract ConnextHandlerForTest {
  IExecutorLike public immutable executor;

  constructor(IExecutorLike _executor) {
    executor = _executor;
  }

  function xcall(XCallArgs calldata _args) external payable returns (bytes32) {
    (IOracleSidechain.ObservationData[] memory _observationsData, bytes32 _poolSalt) = abi.decode(
      _args.params.callData[4:],
      (IOracleSidechain.ObservationData[], bytes32)
    );
    executor.execute(msg.sender, _args.params.to, _args.params.originDomain, _observationsData, _poolSalt);
    return bytes32(abi.encode('random'));
  }
}
