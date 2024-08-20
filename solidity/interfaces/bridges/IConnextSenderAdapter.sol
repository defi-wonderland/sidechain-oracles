//SPDX-License-Identifier: MIT
pragma solidity >=0.8.8 <0.9.0;

import {IConnext} from '@connext/nxtp-contracts/contracts/core/connext/interfaces/IConnext.sol';
import {IBridgeSenderAdapter} from './IBridgeSenderAdapter.sol';

interface IConnextSenderAdapter is IBridgeSenderAdapter {
  // STATE VARIABLES

  /// @notice Gets the ConnextHandler contract on this domain
  /// @return _connext Address of the ConnextHandler contract
  function connext() external view returns (IConnext _connext);
}
