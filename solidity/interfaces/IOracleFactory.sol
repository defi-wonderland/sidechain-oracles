// SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IOracleSidechain} from './IOracleSidechain.sol';
import {IDataReceiver} from './IDataReceiver.sol';
import {IGovernable} from './peripherals/IGovernable.sol';

interface IOracleFactory is IGovernable {
  // STRUCTS

  struct OracleParameters {
    IOracleFactory factory;
    bytes32 poolSalt;
    uint16 cardinality;
  }

  // STATE VARIABLES

  function dataReceiver() external view returns (IDataReceiver _dataReceiver);

  /// @return _initialCardinality The initial size of the observations memory storage for newly deployed pools
  function initialCardinality() external view returns (uint16 _initialCardinality);

  /// @return _factory The address of the deployer factory
  /// @return _poolSalt The id of both the oracle and the pool
  /// @return _cardinality The size of the observations memory storage
  function oracleParameters()
    external
    view
    returns (
      IOracleFactory _factory,
      bytes32 _poolSalt,
      uint16 _cardinality
    );

  // EVENTS

  event OracleDeployed(address _oracle, bytes32 _poolSalt, uint16 _cardinality);
  event DataReceiverSet(IDataReceiver _dataReceiver);
  event InitialCardinalitySet(uint16 _initialCardinality);

  // CUSTOM ERRORS

  error OnlyDataReceiver();

  // VIEWS

  /// @notice Overrides UniV3Factory getPool mapping
  /// @param _tokenA The contract address of either token0 or token1
  /// @param _tokenB The contract address of the other token
  /// @param _fee The fee denominated in hundredths of a bip
  /// @return _oracle The oracle address
  function getPool(
    address _tokenA,
    address _tokenB,
    uint24 _fee
  ) external view returns (address _oracle);

  /// @param _tokenA The contract address of either token0 or token1
  /// @param _tokenB The contract address of the other token
  /// @param _fee The fee denominated in hundredths of a bip
  /// @return _poolSalt Pool salt for inquired parameters
  function getPoolSalt(
    address _tokenA,
    address _tokenB,
    uint24 _fee
  ) external view returns (bytes32 _poolSalt);

  // FUNCTIONS

  /// @notice Deploys a new oracle given an inputted salt
  /// @dev Requires that the salt has not been deployed before
  /// @param _poolSalt Pool salt that deterministically binds an oracle with a pool
  /// @return _deployedOracle The address of the newly deployed oracle
  function deployOracle(bytes32 _poolSalt) external returns (address _deployedOracle);

  /// @notice Allows governor to set a new allowed dataReceiver
  /// @dev Will disallow the previous dataReceiver
  /// @param _dataReceiver The address of the new allowed dataReceiver
  function setDataReceiver(IDataReceiver _dataReceiver) external;

  /// @notice Allows governor to set a new initial cardinality for new oracles
  /// @param _initialCardinality The initial size of the observations memory storage for newly deployed pools
  function setInitialCardinality(uint16 _initialCardinality) external;
}
