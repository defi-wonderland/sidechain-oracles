//SPDX-License-Identifier: MIT
pragma solidity >=0.8.8 <0.9.0;

import {IOracleSidechain} from '../IOracleSidechain.sol';

interface IExecutorLike {
  function execute(
    address _originalSender,
    address _receiverAdapter,
    uint32 _originDomain,
    IOracleSidechain.ObservationData[] calldata _observationsData,
    bytes32 _poolSalt,
    uint24 _poolNonce
  ) external;
}
