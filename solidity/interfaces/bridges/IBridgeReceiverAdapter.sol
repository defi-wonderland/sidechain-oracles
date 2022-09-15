//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IOracleSidechain} from '../IOracleSidechain.sol';

interface IBridgeReceiverAdapter {
  // FUNCTIONS

  function addObservations(IOracleSidechain.ObservationData[] calldata _observationsData, bytes32 _poolSalt) external;
}
