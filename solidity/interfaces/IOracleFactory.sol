//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IOracleSidechain} from '../interfaces/IOracleSidechain.sol';
import {IDataReceiver} from '../interfaces/IDataReceiver.sol';
import {IGovernable} from '../interfaces/peripherals/IGovernable.sol';

interface IOracleFactory is IGovernable {
  // STRUCTS

  struct OracleParameters {
    IOracleFactory factory;
    address token0;
    address token1;
    uint24 fee;
    uint16 cardinality;
  }

  // STATE VARIABLES

  function dataReceiver() external view returns (IDataReceiver _dataReceiver);

  function initialCardinality() external view returns (uint16 _initialCardinality);

  function oracleParameters()
    external
    view
    returns (
      IOracleFactory _factory,
      address _token0,
      address _token1,
      uint24 _fee,
      uint16 _cardinality
    );

  // EVENTS

  event OracleDeployed(address _oracleAddress, address _token0, address _token1, uint24 _fee, uint16 _cardinality);
  event DataReceiverSet(IDataReceiver _dataReceiver);
  event InitialCardinalitySet(uint16 _initialCardinality);

  // CUSTOM ERRORS

  error OnlyDataReceiver();

  // FUNCTIONS

  function deployOracle(
    address _token0,
    address _token1,
    uint24 _fee
  ) external returns (address _deployedOracle);

  function setDataReceiver(IDataReceiver _dataReceiver) external;

  function setInitialCardinality(uint16 _initialCardinality) external;
}
