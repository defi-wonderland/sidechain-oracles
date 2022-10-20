//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IOracleSidechain} from '../IOracleSidechain.sol';
import {IDataReceiver} from '../IDataReceiver.sol';

interface IBridgeReceiverAdapter {
  // FUNCTIONS

  function dataReceiver() external view returns (IDataReceiver _dataReceiver);

  /* NOTE: callback methods should be here declared */

  // EVENTS

  event DataSent(IOracleSidechain.ObservationData[] _observationsData, bytes32 _poolSalt);

  // ERRORS

  error UnauthorizedCaller();
}
