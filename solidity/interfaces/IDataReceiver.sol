//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IGovernable} from './peripherals/IGovernable.sol';
import {IOracleFactory} from './IOracleFactory.sol';
import {IOracleSidechain} from './IOracleSidechain.sol';
import {IBridgeReceiverAdapter} from './bridges/IBridgeReceiverAdapter.sol';

/// @title The DataReceiver interface
/// @author 0xJabberwock (from DeFi Wonderland)
/// @notice Contains state variables, events, custom errors and functions used in DataReceiver
interface IDataReceiver is IGovernable {
  // STATE VARIABLES

  function oracleFactory() external view returns (IOracleFactory _oracleFactory);

  function deployedOracles(bytes32 _poolSalt) external view returns (IOracleSidechain _deployedOracle);

  function whitelistedAdapters(IBridgeReceiverAdapter _adapter) external view returns (bool _isAllowed);

  //solhint-disable-next-line func-name-mixedcase
  function ORACLE_INIT_CODE_HASH() external view returns (bytes32 _oracleInitCodeHash);

  // EVENTS

  event ObservationsAdded(address _user, IOracleSidechain.ObservationData[] _observationsData);

  event AdapterWhitelisted(IBridgeReceiverAdapter _adapter, bool _isAllowed);

  // ERRORS

  error ObservationsNotWritable();

  error UnallowedAdapter();

  error LengthMismatch();

  // FUNCTIONS

  function addObservations(
    IOracleSidechain.ObservationData[] memory _observationsData,
    bytes32 _poolSalt,
    uint24 _poolNonce
  ) external;

  function whitelistAdapter(IBridgeReceiverAdapter _receiverAdapter, bool _isWhitelisted) external;

  function whitelistAdapters(IBridgeReceiverAdapter[] calldata _receiverAdapters, bool[] calldata _isWhitelisted) external;
}
