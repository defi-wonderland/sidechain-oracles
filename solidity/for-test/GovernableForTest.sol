//SPDX-License-Identifier: MIT
pragma solidity >=0.8.8 <0.9.0;

import {Governable} from '../contracts/peripherals/Governable.sol';

contract GovernableForTest is Governable {
  constructor(address _governor) Governable(_governor) {}
}
