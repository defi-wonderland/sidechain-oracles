//SPDX-License-Identifier: MIT
pragma solidity >=0.8.8 <0.9.0;

import {Keep3rJob, Governable} from '../contracts/peripherals/Keep3rJob.sol';

contract Keep3rJobForTest is Keep3rJob {
  constructor(address _governor) Governable(_governor) {}

  function externalIsValidKeeper(address _keeper) external {
    _isValidKeeper(_keeper);
  }
}
