//TODO: change license
//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {OracleSidechain} from './OracleSidechain.sol';
import {Governable} from './peripherals/Governable.sol';
import {IOracleFactory} from '../interfaces/IOracleFactory.sol';
import {IDataReceiver} from '../interfaces/IDataReceiver.sol';
import {Create2Address} from '../libraries/Create2Address.sol';

contract OracleFactory is IOracleFactory, Governable {
  /// @inheritdoc IOracleFactory
  IDataReceiver public dataReceiver;

  OracleParameters public oracleParameters;

  /// @inheritdoc IOracleFactory
  uint16 public initialCardinality = 144;

  constructor(address _governor, IDataReceiver _dataReceiver) Governable(_governor) {
    dataReceiver = _dataReceiver;
  }

  function deployOracle(bytes32 _poolSalt) external onlyDataReceiver returns (address _deployedOracle) {
    oracleParameters = OracleParameters({factory: IOracleFactory(address(this)), poolSalt: _poolSalt, cardinality: initialCardinality});
    _deployedOracle = address(new OracleSidechain{salt: _poolSalt}());
    delete oracleParameters;
    emit OracleDeployed(_deployedOracle, _poolSalt, initialCardinality);
  }

  /// @inheritdoc IOracleFactory
  function setDataReceiver(IDataReceiver _dataReceiver) external onlyGovernor {
    dataReceiver = _dataReceiver;
    emit DataReceiverSet(dataReceiver);
  }

  /// @inheritdoc IOracleFactory
  function setInitialCardinality(uint16 _initialCardinality) external onlyGovernor {
    initialCardinality = _initialCardinality;
    emit InitialCardinalitySet(initialCardinality);
  }

  function getPool(
    address _tokenA,
    address _tokenB,
    uint24 _fee
  ) external view returns (address _oracle) {
    bytes32 _poolSalt = getPoolSalt(_tokenA, _tokenB, _fee);
    _oracle = Create2Address.computeAddress(address(this), _poolSalt, keccak256(type(OracleSidechain).creationCode));
    if (address(_oracle).code.length == 0) return address(0);
  }

  function getPoolSalt(
    address _tokenA,
    address _tokenB,
    uint24 _fee
  ) public pure returns (bytes32 _poolSalt) {
    (address _token0, address _token1) = _tokenA < _tokenB ? (_tokenA, _tokenB) : (_tokenB, _tokenA);
    _poolSalt = keccak256(abi.encode(_token0, _token1, _fee));
  }

  modifier onlyDataReceiver() {
    if (msg.sender != address(dataReceiver)) revert OnlyDataReceiver();
    _;
  }
}
