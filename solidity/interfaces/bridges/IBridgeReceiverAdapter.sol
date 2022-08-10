//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IOracleSidechain} from '../IOracleSidechain.sol';

interface IBridgeReceiverAdapter {
  // FUNCTIONS

  function addObservations(
    IOracleSidechain.ObservationData[] calldata _observationsData,
    address _tokenA,
    address _tokenB,
    uint24 _fee
  ) external;
}
