//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {DataReceiver} from '../contracts/DataReceiver.sol';
import {OracleSidechain} from '../contracts/OracleSidechain.sol';
import {IDataReceiver, IOracleSidechain, IBridgeReceiverAdapter} from '../interfaces/IDataReceiver.sol';
import {IOracleFactory} from '../interfaces/IOracleFactory.sol';
import {Create2Address} from '../libraries/Create2Address.sol';

contract DataReceiverForTest is DataReceiver {
  constructor(address _governor, IOracleFactory _oracleFactory) DataReceiver(_governor, _oracleFactory) {}

  function internalAddObservations(
    IOracleSidechain.ObservationData[] memory _observationsData,
    bytes32 _poolSalt,
    uint24 _poolNonce
  ) external {
    _addObservations(_observationsData, _poolSalt, _poolNonce);
  }
}
