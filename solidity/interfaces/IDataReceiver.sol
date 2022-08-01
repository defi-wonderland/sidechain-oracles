//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IOracleFactory} from './IOracleFactory.sol';
import {IOracleSidechain} from './IOracleSidechain.sol';
import {IBridgeReceiverAdapter} from './bridges/IBridgeReceiverAdapter.sol';
import {IGovernable} from './peripherals/IGovernable.sol';

/// @title The DataReceiver interface
/// @author 0xJabberwock (from DeFi Wonderland)
/// @notice Contains state variables, events, custom errors and functions used in DataReceiver
interface IDataReceiver is IGovernable {
  // STATE VARIABLES
  function oracleFactory() external view returns (IOracleFactory _oracleFactory);

  function whitelistedAdapters(IBridgeReceiverAdapter _adapter) external view returns (bool _isAllowed);

  // EVENTS

  event ObservationsAdded(address _user, IOracleSidechain.ObservationData[] _observationsData);
  event AdapterWhitelisted(IBridgeReceiverAdapter _adapter, bool _isAllowed);

  // CUSTOM ERRORS

  error ObservationsNotWritable();
  error UnallowedAdapter();
  error LengthMismatch();

  // FUNCTIONS

  function addObservations(
    IOracleSidechain.ObservationData[] calldata _observationsData,
    address _token0,
    address _token1,
    uint24 _fee
  ) external;

  function whitelistAdapter(IBridgeReceiverAdapter _receiverAdapter, bool _isWhitelisted) external;

  function whitelistAdapters(IBridgeReceiverAdapter[] calldata _receiverAdapters, bool[] calldata _isWhitelisted) external;
}
