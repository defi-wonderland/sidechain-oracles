//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IGovernable} from './peripherals/IGovernable.sol';
import {IOracleSidechain} from './IOracleSidechain.sol';
import {IDataReceiver} from './IDataReceiver.sol';

interface IOracleFactory is IGovernable {
  // STRUCTS

  struct OracleParameters {
    IOracleFactory factory;
    bytes32 poolSalt;
    uint24 poolNonce;
    uint16 cardinality;
  }

  // STATE VARIABLES

  function dataReceiver() external view returns (IDataReceiver _dataReceiver);

  /// @return _factory The address of the deployer factory
  /// @return _poolSalt The id of both the oracle and the pool
  /// @return _poolNonce The initial nonce of the pool data
  /// @return _cardinality The size of the observations memory storage
  function oracleParameters()
    external
    view
    returns (
      IOracleFactory _factory,
      bytes32 _poolSalt,
      uint24 _poolNonce,
      uint16 _cardinality
    );

  /// @return _initialCardinality The initial size of the observations memory storage for newly deployed pools
  function initialCardinality() external view returns (uint16 _initialCardinality);

  // EVENTS

  event OracleDeployed(IOracleSidechain _oracle, bytes32 _poolSalt, uint16 _cardinality);

  event DataReceiverSet(IDataReceiver _dataReceiver);

  event InitialCardinalitySet(uint16 _initialCardinality);

  // ERRORS

  error OnlyDataReceiver();

  // FUNCTIONS

  /// @notice Deploys a new oracle given an inputted salt
  /// @dev Requires that the salt has not been deployed before
  /// @param _poolSalt Pool salt that deterministically binds an oracle with a pool
  /// @return _oracle The address of the newly deployed oracle
  function deployOracle(bytes32 _poolSalt, uint24 _poolNonce) external returns (IOracleSidechain _oracle);

  /// @notice Allows governor to set a new allowed dataReceiver
  /// @dev Will disallow the previous dataReceiver
  /// @param _dataReceiver The address of the new allowed dataReceiver
  function setDataReceiver(IDataReceiver _dataReceiver) external;

  /// @notice Allows governor to set a new initial cardinality for new oracles
  /// @param _initialCardinality The initial size of the observations memory storage for newly deployed pools
  function setInitialCardinality(uint16 _initialCardinality) external;

  /// @notice Overrides UniV3Factory getPool mapping
  /// @param _tokenA The contract address of either token0 or token1
  /// @param _tokenB The contract address of the other token
  /// @param _fee The fee denominated in hundredths of a bip
  /// @return _oracle The oracle address
  function getPool(
    address _tokenA,
    address _tokenB,
    uint24 _fee
  ) external view returns (IOracleSidechain _oracle);

  function getPool(bytes32 _poolSalt) external view returns (IOracleSidechain _oracle);

  /// @param _tokenA The contract address of either token0 or token1
  /// @param _tokenB The contract address of the other token
  /// @param _fee The fee denominated in hundredths of a bip
  /// @return _poolSalt Pool salt for inquired parameters
  function getPoolSalt(
    address _tokenA,
    address _tokenB,
    uint24 _fee
  ) external view returns (bytes32 _poolSalt);
}
