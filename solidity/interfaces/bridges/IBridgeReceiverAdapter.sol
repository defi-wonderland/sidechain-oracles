//SPDX-License-Identifier: MIT
pragma solidity >=0.8.8 <0.9.0;

import {IDataReceiver} from '../IDataReceiver.sol';
import {IOracleSidechain} from '../IOracleSidechain.sol';

interface IBridgeReceiverAdapter {
  // STATE VARIABLES

  /// @notice Gets the address of the DataReceiver contract
  /// @return _dataReceiver Address of the DataReceiver contract
  function dataReceiver() external view returns (IDataReceiver _dataReceiver);

  /* NOTE: callback methods should be here declared */

  // ERRORS

  /// @notice Thrown if DataReceiver is set to the zero address
  error BridgeReceiverAdapter_ZeroAddress();
}
