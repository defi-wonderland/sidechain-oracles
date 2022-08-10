//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {DataReceiver} from '../contracts/DataReceiver.sol';
import {OracleSidechain} from '../contracts/OracleSidechain.sol';
import {IDataReceiver, IOracleSidechain, IBridgeReceiverAdapter} from '../interfaces/IDataReceiver.sol';
import {IOracleFactory} from '../interfaces/IOracleFactory.sol';

contract DataReceiverForTest is DataReceiver {
  constructor(address _governance, IOracleFactory _oracleFactory) DataReceiver(_governance, _oracleFactory) {}

  function addPermissionlessObservations(
    IOracleSidechain.ObservationData[] calldata _observationsData,
    address _tokenA,
    address _tokenB,
    uint24 _fee
  ) external {
    (address _token0, address _token1) = _tokenA < _tokenB ? (_tokenA, _tokenB) : (_tokenB, _tokenA);

    IOracleSidechain _resultingAddress = IOracleSidechain(_calculateAddress(address(oracleFactory), _token0, _token1, _fee));
    bool _isDeployed = address(_resultingAddress).code.length > 0;
    if (_isDeployed) {
      return _addObservations(_resultingAddress, _observationsData);
    }
    address _deployedOracle = oracleFactory.deployOracle(_token0, _token1, _fee);
    _addObservations(IOracleSidechain(_deployedOracle), _observationsData);
  }
}
