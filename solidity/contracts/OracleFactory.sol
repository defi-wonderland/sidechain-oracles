//TODO: change license
// SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {OracleSidechain} from './OracleSidechain.sol';
import {Governable} from './peripherals/Governable.sol';
import {IOracleFactory} from '../interfaces/IOracleFactory.sol';
import {IDataReceiver} from '../interfaces/IDataReceiver.sol';
import {Create2Address} from '../libraries/Create2Address.sol';

contract OracleFactory is IOracleFactory, Governable {
  IDataReceiver public dataReceiver;

  uint16 public initialCardinality = 144;

  OracleParameters public oracleParameters;

  constructor(address _governance, IDataReceiver _dataReceiver) Governable(_governance) {
    dataReceiver = _dataReceiver;
  }

  function deployOracle(bytes32 _poolSalt) external returns (address _deployedOracle) {
    if (IDataReceiver(msg.sender) != dataReceiver) revert OnlyDataReceiver();
    oracleParameters = OracleParameters({factory: IOracleFactory(address(this)), poolSalt: _poolSalt, cardinality: initialCardinality});
    _deployedOracle = address(new OracleSidechain{salt: _poolSalt}());
    delete oracleParameters;
    emit OracleDeployed(_deployedOracle, _poolSalt, initialCardinality);
  }

  function setDataReceiver(IDataReceiver _dataReceiver) external onlyGovernance {
    dataReceiver = _dataReceiver;
    emit DataReceiverSet(dataReceiver);
  }

  function setInitialCardinality(uint16 _initialCardinality) external onlyGovernance {
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
}
