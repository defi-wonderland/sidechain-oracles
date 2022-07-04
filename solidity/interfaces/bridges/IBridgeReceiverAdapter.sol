//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

interface IBridgeReceiverAdapter {
  // FUNCTIONS

  function addObservation(uint32 _blockTimestamp, int24 _tick) external;
}
