// SPDX-License-Identifier: MIT
import {LibConnextStorage, XCallArgs} from '@connext/nxtp-contracts/contracts/core/connext/libraries/LibConnextStorage.sol';

interface IExecutorLike {
  function execute(
    address _originalSender,
    address _receiverAdapter,
    uint32 _originDomain,
    uint32 _blockTimestamp,
    int24 _tick
  ) external;
}

pragma solidity >=0.8.0;

contract ConnextHandlerForTest {
  IExecutorLike public immutable executor;

  constructor(IExecutorLike _executor) {
    executor = _executor;
  }

  function xcall(XCallArgs calldata _args) external payable returns (bytes32) {
    (uint32 _blockTimestamp, int24 _tick) = abi.decode(_args.params.callData[4:], (uint32, int24));
    executor.execute(msg.sender, _args.params.to, _args.params.originDomain, _blockTimestamp, _tick);
    return bytes32(abi.encode('random'));
  }
}
