//SPDX-License-Identifier: MIT
pragma solidity >=0.8.8 <0.9.0;

import {DataReceiver} from '../contracts/DataReceiver.sol';
import {OracleSidechain} from '../contracts/OracleSidechain.sol';
import {IDataReceiver, IOracleFactory, IOracleSidechain, IBridgeReceiverAdapter} from '../interfaces/IDataReceiver.sol';
import {Create2Address} from '@defi-wonderland/solidity-utils/solidity/libraries/Create2Address.sol';

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
