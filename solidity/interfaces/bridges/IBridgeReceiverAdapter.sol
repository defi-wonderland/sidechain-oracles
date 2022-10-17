//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IOracleSidechain} from '../IOracleSidechain.sol';

interface IBridgeReceiverAdapter {
  // FUNCTIONS

  /* NOTE: callback methods should be here declared */

  // EVENTS

  event DataSent(IOracleSidechain.ObservationData[] _observationsData, bytes32 _poolSalt);

  // ERRORS

  error UnauthorizedCaller();
}
