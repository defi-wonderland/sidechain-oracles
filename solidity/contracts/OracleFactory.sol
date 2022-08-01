//TODO: change license
//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {OracleSidechain} from './OracleSidechain.sol';
import {Governable} from './peripherals/Governable.sol';
import {IOracleFactory} from '../interfaces/IOracleFactory.sol';
import {IDataReceiver} from '../interfaces/IDataReceiver.sol';

contract OracleFactory is IOracleFactory, Governable {
  IDataReceiver public dataReceiver;

  uint16 public initialCardinality = 144;

  mapping(address => mapping(address => mapping(uint24 => address))) public getPool;

  OracleParameters public oracleParameters;

  constructor(address _governance, IDataReceiver _dataReceiver) Governable(_governance) {
    dataReceiver = _dataReceiver;
  }

  function deployOracle(
    address _token0,
    address _token1,
    uint24 _fee
  ) external returns (address _deployedOracle) {
    if (IDataReceiver(msg.sender) != dataReceiver) revert OnlyDataReceiver();
    oracleParameters = OracleParameters({
      factory: IOracleFactory(address(this)),
      token0: _token0,
      token1: _token1,
      fee: _fee,
      cardinality: initialCardinality
    });
    _deployedOracle = address(new OracleSidechain{salt: keccak256(abi.encode(_token0, _token1, _fee))}());
    getPool[_token0][_token1][_fee] = _deployedOracle;
    getPool[_token1][_token0][_fee] = _deployedOracle;
    delete oracleParameters;
    emit OracleDeployed(_deployedOracle, _token0, _token1, _fee, initialCardinality);
  }

  function setDataReceiver(IDataReceiver _dataReceiver) external onlyGovernance {
    dataReceiver = _dataReceiver;
    emit DataReceiverSet(dataReceiver);
  }

  function setInitialCardinality(uint16 _initialCardinality) external onlyGovernance {
    initialCardinality = _initialCardinality;
    emit InitialCardinalitySet(initialCardinality);
  }
}
