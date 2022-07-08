//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IOracleSidechain} from '../../interfaces/IOracleSidechain.sol';

interface IBridgeSenderAdapter {
  // FUNCTIONS

  function bridgeObservations(
    address _to,
    uint32 _destinationDomainId,
    IOracleSidechain.ObservationData[] calldata _observationsData
  ) external payable;
}
