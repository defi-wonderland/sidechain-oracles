//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IDataReceiver, IOracleSidechain} from '../interfaces/IDataReceiver.sol';

contract DataReceiver is IDataReceiver {
  /// @inheritdoc IDataReceiver
  IOracleSidechain public immutable oracleSidechain;

  constructor(IOracleSidechain _oracleSidechain) {
    oracleSidechain = _oracleSidechain;
  }

  /// @inheritdoc IDataReceiver
  function addObservation(uint32 _blockTimestamp, int24 _tick) external {
    if (oracleSidechain.write(_blockTimestamp, _tick)) {
      emit ObservationAdded(msg.sender, _blockTimestamp, _tick);
    } else {
      revert ObservationNotWritable(_blockTimestamp);
    }
  }
}
