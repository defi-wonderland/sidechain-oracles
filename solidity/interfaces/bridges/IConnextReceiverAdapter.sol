//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IConnext} from '@connext/nxtp-contracts/contracts/core/connext/interfaces/IConnext.sol';
import {IBridgeReceiverAdapter, IDataReceiver, IOracleSidechain} from './IBridgeReceiverAdapter.sol';

interface IConnextReceiverAdapter is IBridgeReceiverAdapter {
  // STATE VARIABLES

  function connext() external view returns (IConnext _connext);

  function source() external view returns (address _originContract);

  function originDomain() external view returns (uint32 _originDomain);
}
