//SPDX-License-Identifier: MIT
pragma solidity >=0.8.8 <0.9.0;

import {OracleSidechain} from '../contracts/OracleSidechain.sol';
import {IOracleSidechain} from '../interfaces/IOracleSidechain.sol';
import {IDataReceiver} from '../interfaces/IDataReceiver.sol';
import {IBridgeSenderAdapter} from '../interfaces/bridges/IBridgeSenderAdapter.sol';

contract DummyAdapterForTest is IBridgeSenderAdapter {
  event Create2Hash(bytes32);

  bool public ignoreTxs;
  address public dataFeed; // needed to comply with interface

  constructor() {
    /// @dev Emitted to validate correct calculation of ORACLE_INIT_CODE_HASH
    emit Create2Hash(keccak256(type(OracleSidechain).creationCode));
  }

  function bridgeObservations(
    address _to,
    uint32,
    IOracleSidechain.ObservationData[] memory _observationsData,
    bytes32 _poolSalt,
    uint24 _poolNonce
  ) external payable {
    if (!ignoreTxs) {
      IDataReceiver(_to).addObservations(_observationsData, _poolSalt, _poolNonce);
    }
  }

  function setIgnoreTxs(bool _ignoreTxs) external {
    ignoreTxs = _ignoreTxs;
  }
}
