//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IBridgeReceiverAdapter, IOracleSidechain} from './IBridgeReceiverAdapter.sol';
import {IDataReceiver} from '../IDataReceiver.sol';

interface IConnextReceiverAdapter is IBridgeReceiverAdapter {
  // STATE VARIABLES

  function dataReceiver() external view returns (IDataReceiver _dataReceiver);

  function dao() external view returns (address _originContract);

  function origin() external view returns (uint32 _originDomain);

  // connext()
}
