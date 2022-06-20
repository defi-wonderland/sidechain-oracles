// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0;

import '@connext/nxtp-contracts/contracts/core/connext/libraries/LibConnextStorage.sol';
import '../../interfaces/IDataFeed.sol';
import '../../interfaces/IDataReceiver.sol';

contract ConnextHandlerForTest {
  IDataReceiver public immutable receiver;

  constructor(IDataReceiver _receiver) {
    receiver = _receiver;
  }

  function xcall(XCallArgs calldata _args) external payable returns (bytes32) {
    (uint32 _blockTimestamp, int24 _tick) = abi.decode(_args.params.callData[4:], (uint32, int24));
    receiver.addObservation(_blockTimestamp, _tick);
    return bytes32(abi.encode('random'));
  }
}
