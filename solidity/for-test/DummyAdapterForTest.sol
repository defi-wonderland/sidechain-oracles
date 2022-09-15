//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {OracleSidechain} from '../contracts/OracleSidechain.sol';
import {IOracleSidechain} from '../interfaces/IOracleSidechain.sol';
import {IDataReceiver} from '../interfaces/IDataReceiver.sol';

contract DummyAdapterForTest {
  // TODO: factorize interfaces so that this adapter can use same as sender/receiver
  event SentData(IDataReceiver, IOracleSidechain.ObservationData[]);
  event Create2Hash(bytes32);

  constructor() {
    /// @dev Emitted to validate correct calculation of ORACLE_INIT_CODE_HASH
    emit Create2Hash(keccak256(type(OracleSidechain).creationCode));
  }

  function bridgeObservations(
    IDataReceiver _to,
    uint32,
    IOracleSidechain.ObservationData[] calldata _observationsData,
    bytes32 _poolSalt
  ) external payable {
    _to.addObservations(_observationsData, _poolSalt);
    emit SentData(_to, _observationsData);
  }
}
