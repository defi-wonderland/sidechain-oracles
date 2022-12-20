//SPDX-License-Identifier: MIT
pragma solidity >=0.8.8 <0.9.0;

import {Governable} from './peripherals/Governable.sol';
import {OracleSidechain} from './OracleSidechain.sol';
import {IOracleFactory, IOracleSidechain, IDataReceiver} from '../interfaces/IOracleFactory.sol';
import {Create2Address} from '../libraries/Create2Address.sol';

/// @title The OracleFactory contract
/// @notice Handles the deployment of new OracleSidechains
contract OracleFactory is IOracleFactory, Governable {
  /// @inheritdoc IOracleFactory
  IDataReceiver public dataReceiver;

  /// @inheritdoc IOracleFactory
  OracleParameters public oracleParameters;

  /// @inheritdoc IOracleFactory
  uint16 public initialCardinality = 144;

  /// @inheritdoc IOracleFactory
  bytes32 public constant ORACLE_INIT_CODE_HASH = keccak256(type(OracleSidechain).creationCode);

  constructor(address _governor, IDataReceiver _dataReceiver) Governable(_governor) {
    _setDataReceiver(_dataReceiver);
  }

  /// @inheritdoc IOracleFactory
  function deployOracle(bytes32 _poolSalt, uint24 _initialNonce) external onlyDataReceiver returns (IOracleSidechain _oracle) {
    oracleParameters = OracleParameters({poolSalt: _poolSalt, poolNonce: _initialNonce, cardinality: initialCardinality});
    _oracle = new OracleSidechain{salt: _poolSalt}();

    delete oracleParameters;
    emit OracleDeployed(_poolSalt, address(_oracle), _initialNonce);
  }

  /// @inheritdoc IOracleFactory
  function setDataReceiver(IDataReceiver _dataReceiver) external onlyGovernor {
    _setDataReceiver(_dataReceiver);
  }

  /// @inheritdoc IOracleFactory
  function setInitialCardinality(uint16 _initialCardinality) external onlyGovernor {
    if (_initialCardinality == 0) revert ZeroCardinality();

    initialCardinality = _initialCardinality;
    emit InitialCardinalitySet(_initialCardinality);
  }

  function increaseOracleCardinality(bytes32 _poolSalt, uint16 _observationCardinalityNext) external onlyGovernor {
    IOracleSidechain _oracle = getPool(_poolSalt);
    _oracle.increaseObservationCardinalityNext(_observationCardinalityNext);
  }

  /// @inheritdoc IOracleFactory
  function getPool(
    address _tokenA,
    address _tokenB,
    uint24 _fee
  ) external view returns (IOracleSidechain _oracle) {
    bytes32 _poolSalt = getPoolSalt(_tokenA, _tokenB, _fee);
    _oracle = getPool(_poolSalt);
  }

  /// @inheritdoc IOracleFactory
  function getPool(bytes32 _poolSalt) public view returns (IOracleSidechain _oracle) {
    _oracle = IOracleSidechain(Create2Address.computeAddress(address(this), _poolSalt, ORACLE_INIT_CODE_HASH));
    if (address(_oracle).code.length == 0) return IOracleSidechain(address(0));
  }

  /// @inheritdoc IOracleFactory
  function getPoolSalt(
    address _tokenA,
    address _tokenB,
    uint24 _fee
  ) public pure returns (bytes32 _poolSalt) {
    (address _token0, address _token1) = _tokenA < _tokenB ? (_tokenA, _tokenB) : (_tokenB, _tokenA);
    _poolSalt = keccak256(abi.encode(_token0, _token1, _fee));
  }

  function _setDataReceiver(IDataReceiver _dataReceiver) private {
    if (address(_dataReceiver) == address(0)) revert ZeroAddress();

    dataReceiver = _dataReceiver;
    emit DataReceiverSet(_dataReceiver);
  }

  modifier onlyDataReceiver() {
    if (msg.sender != address(dataReceiver)) revert OnlyDataReceiver();
    _;
  }
}
