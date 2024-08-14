//SPDX-License-Identifier: MIT
pragma solidity >=0.8.8 <0.9.0;

import {IGovernable} from '@defi-wonderland/solidity-utils/solidity/interfaces/IGovernable.sol';
import {IOracleFactory} from './IOracleFactory.sol';
import {IOracleSidechain} from './IOracleSidechain.sol';
import {IBridgeReceiverAdapter} from './bridges/IBridgeReceiverAdapter.sol';

interface IDataReceiver is IGovernable {
  // STATE VARIABLES

  /// @return _oracleFactory The address of the OracleFactory
  function oracleFactory() external view returns (IOracleFactory _oracleFactory);

  /// @notice Tracks already deployed oracles
  /// @param _poolSalt The identifier of the oracle
  /// @return _deployedOracle The address of the correspondant Oracle
  function deployedOracles(bytes32 _poolSalt) external view returns (IOracleSidechain _deployedOracle);

  /// @notice Tracks the whitelisting of bridge adapters
  /// @param _adapter Address of the bridge adapter to consult
  /// @return _isAllowed Whether a bridge adapter is whitelisted
  function whitelistedAdapters(IBridgeReceiverAdapter _adapter) external view returns (bool _isAllowed);

  // EVENTS

  /// @notice Emitted when a broadcast observation is succesfully processed
  /// @param _poolSalt Identifier of the pool to fetch
  /// @return _poolNonce Nonce of the observation broadcast
  /// @return _receiverAdapter Handler of the broadcast
  event ObservationsAdded(bytes32 indexed _poolSalt, uint24 _poolNonce, address _receiverAdapter);

  /// @notice Emitted when a broadcast observation is cached for later processing
  /// @param _poolSalt Identifier of the pool to fetch
  /// @return _poolNonce Nonce of the observation broadcast
  /// @return _receiverAdapter Handler of the broadcast
  event ObservationsCached(bytes32 indexed _poolSalt, uint24 _poolNonce, address _receiverAdapter);

  /// @notice Emitted when a new adapter whitelisting rule is set
  /// @param _adapter Address of the adapter
  /// @param _isAllowed New whitelisting status
  event AdapterWhitelisted(IBridgeReceiverAdapter _adapter, bool _isAllowed);

  // ERRORS

  /// @notice Thrown when the broadcast nonce is incorrect
  error ObservationsNotWritable();

  /// @notice Thrown when a not-whitelisted adapter triggers an update
  error UnallowedAdapter();

  // FUNCTIONS

  /// @notice Allows whitelisted bridge adapters to push a broadcast
  /// @param _observationsData Array of tuples containing the dataset
  /// @param _poolSalt Identifier of the pool to fetch
  /// @param _poolNonce Nonce of the observation broadcast
  function addObservations(
    IOracleSidechain.ObservationData[] memory _observationsData,
    bytes32 _poolSalt,
    uint24 _poolNonce
  ) external;

  /// @notice Allows governance to set an adapter whitelisted state
  /// @param _receiverAdapter Address of the adapter
  /// @param _isWhitelisted New whitelisting status
  function whitelistAdapter(IBridgeReceiverAdapter _receiverAdapter, bool _isWhitelisted) external;

  /// @notice Allows governance to batch set adapters whitelisted state
  /// @param _receiverAdapters Array of addresses of the adapter
  /// @param _isWhitelisted Array of whitelisting status for each address
  function whitelistAdapters(IBridgeReceiverAdapter[] calldata _receiverAdapters, bool[] calldata _isWhitelisted) external;
}
