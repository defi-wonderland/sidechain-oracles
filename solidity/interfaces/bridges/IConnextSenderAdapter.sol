// SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IConnextHandler} from '@connext/nxtp-contracts/contracts/core/connext/interfaces/IConnextHandler.sol';
import {IBridgeSenderAdapter, IOracleSidechain} from './IBridgeSenderAdapter.sol';
import {IDataFeed} from '../IDataFeed.sol';

interface IConnextSenderAdapter is IBridgeSenderAdapter {
  // STATE VARIABLES

  function connext() external view returns (IConnextHandler _connext);

  function dataFeed() external view returns (IDataFeed _dataFeed);

  // EVENTS

  event DataSent(
    address _to,
    uint32 _originDomainId,
    uint32 _destinationDomainId,
    IOracleSidechain.ObservationData[] _observationsData,
    bytes32 _poolSalt
  );

  // ERRORS

  error OnlyDataFeed();
}
