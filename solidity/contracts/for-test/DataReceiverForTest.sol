//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {DataReceiver} from '../../contracts/DataReceiver.sol';
import {IOracleSidechain} from '../../interfaces/IOracleSidechain.sol';

contract DataReceiverForTest is DataReceiver {
  constructor(IOracleSidechain _oracleSidechain, address _governance) DataReceiver(_oracleSidechain, _governance) {}

  function addPermissionlessObservations(IOracleSidechain.ObservationData[] calldata _observationsData) external {
    if (oracleSidechain.write(_observationsData)) {
      emit ObservationsAdded(msg.sender, _observationsData);
    } else {
      revert ObservationsNotWritable();
    }
  }
}
