//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

interface IBridgeAdapter {
  // FUNCTIONS

  function bridgeObservation(
    address _to,
    uint32 _destinationDomainId,
    uint32 _blockTimestamp,
    int24 _tick
  ) external payable;
}
