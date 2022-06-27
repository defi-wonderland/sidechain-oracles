//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IOracleSidechain} from '../interfaces/IOracleSidechain.sol';

/// @title The DataReceiver interface
/// @author 0xJabberwock (from DeFi Wonderland)
/// @notice Contains state variables, events, custom errors and functions used in DataReceiver
interface IDataReceiver {
  // STATE VARIABLES

  function oracleSidechain() external view returns (IOracleSidechain _oracleSidechain);

  // EVENTS

  event ObservationAdded(address _user, uint32 _blockTimestamp, int24 _tick);

  // CUSTOM ERRORS

  error ObservationNotWritable(uint32 _blockTimestamp);

  // FUNCTIONS

  function addObservation(uint32 _blockTimestamp, int24 _tick) external;
}
