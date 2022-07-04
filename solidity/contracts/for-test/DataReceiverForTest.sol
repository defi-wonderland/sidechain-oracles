//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {DataReceiver} from '../DataReceiver.sol';
import {IOracleSidechain} from '../../interfaces/IOracleSidechain.sol';

contract DataReceiverForTest is DataReceiver {
  constructor(IOracleSidechain _oracleSidechain, address _governance) DataReceiver(_oracleSidechain, _governance) {}

  function addPermissionlessObservation(uint32 _blockTimestamp, int24 _tick) external {
    if (oracleSidechain.write(_blockTimestamp, _tick)) {
      emit ObservationAdded(msg.sender, _blockTimestamp, _tick);
    } else {
      revert ObservationNotWritable(_blockTimestamp);
    }
  }
}
