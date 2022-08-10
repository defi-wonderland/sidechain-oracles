//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IExecutor} from '@connext/nxtp-contracts/contracts/core/connext/interfaces/IExecutor.sol';
import {IBridgeReceiverAdapter, IOracleSidechain} from './IBridgeReceiverAdapter.sol';
import {IDataReceiver} from '../IDataReceiver.sol';

interface IConnextReceiverAdapter is IBridgeReceiverAdapter {
  // STATE VARIABLES

  function dataReceiver() external view returns (IDataReceiver _dataReceiver);

  function executor() external view returns (IExecutor _executor);

  function originContract() external view returns (address _originContract);

  function originDomain() external view returns (uint32 _originDomain);

  // EVENTS

  event DataSent(IOracleSidechain.ObservationData[] _observationsData, address _tokenA, address _tokenB, uint24 _fee);

  // CUSTOM ERRORS

  error UnauthorizedCaller();
}
