//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IOracleSidechain} from '../interfaces/IOracleSidechain.sol';
import {IBridgeReceiverAdapter} from '../interfaces/bridges/IBridgeReceiverAdapter.sol';
import {IGovernable} from './peripherals/IGovernable.sol';

/// @title The DataReceiver interface
/// @author 0xJabberwock (from DeFi Wonderland)
/// @notice Contains state variables, events, custom errors and functions used in DataReceiver
interface IDataReceiver is IGovernable {
  // STATE VARIABLES

  function oracleSidechain() external view returns (IOracleSidechain _oracleSidechain);

  function whitelistedAdapters(IBridgeReceiverAdapter _adapter) external view returns (bool _isAllowed);

  // EVENTS

  event ObservationAdded(address _user, uint32 _blockTimestamp, int24 _tick);
  event AdapterWhitelisted(IBridgeReceiverAdapter _adapter, bool _isAllowed);

  // CUSTOM ERRORS

  error ObservationNotWritable(uint32 _blockTimestamp);
  error UnallowedAdapter();
  error LengthMismatch();

  // FUNCTIONS

  function addObservation(uint32 _blockTimestamp, int24 _tick) external;

  function whitelistAdapter(IBridgeReceiverAdapter _receiverAdapter, bool _isWhitelisted) external;

  function whitelistAdapters(IBridgeReceiverAdapter[] calldata _receiverAdapters, bool[] calldata _isWhitelisted) external;
}
