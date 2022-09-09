// SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {DataReceiver} from '../contracts/DataReceiver.sol';
import {OracleSidechain} from '../contracts/OracleSidechain.sol';
import {IDataReceiver, IOracleSidechain, IBridgeReceiverAdapter} from '../interfaces/IDataReceiver.sol';
import {IOracleFactory} from '../interfaces/IOracleFactory.sol';
import {Create2Address} from '../libraries/Create2Address.sol';

contract DataReceiverForTest is DataReceiver {
  constructor(address _governor, IOracleFactory _oracleFactory) DataReceiver(_governor, _oracleFactory) {}

  // TODO: reuse logic from DataReceiver (don't rewrite code)
  function addPermissionlessObservations(IOracleSidechain.ObservationData[] calldata _observationsData, bytes32 _poolSalt) external {
    IOracleSidechain _resultingAddress = IOracleSidechain(
      Create2Address.computeAddress(address(oracleFactory), _poolSalt, ORACLE_INIT_CODE_HASH)
    );
    bool _isDeployed = address(_resultingAddress).code.length > 0;
    if (_isDeployed) {
      return _addObservations(_resultingAddress, _observationsData);
    }
    address _deployedOracle = oracleFactory.deployOracle(_poolSalt);
    _addObservations(IOracleSidechain(_deployedOracle), _observationsData);
  }
}
