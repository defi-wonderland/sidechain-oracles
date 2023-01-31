//SPDX-License-Identifier: MIT
pragma solidity >=0.8.8 <0.9.0;

import {IConnext} from '@connext/nxtp-contracts/contracts/core/connext/interfaces/IConnext.sol';
import {IXReceiver} from '@connext/nxtp-contracts/contracts/core/connext/interfaces/IXReceiver.sol';
import {IBridgeReceiverAdapter, IDataReceiver, IOracleSidechain} from './IBridgeReceiverAdapter.sol';

interface IConnextReceiverAdapter is IXReceiver, IBridgeReceiverAdapter {
  // STATE VARIABLES

  /// @notice Gets the ConnextHandler contract on this domain
  /// @return _connext Address of the ConnextHandler contract
  function connext() external view returns (IConnext _connext);

  /// @notice Gets the DAO that is expected as the xcaller
  /// @return _originContract Address of the xcaller contract
  function source() external view returns (address _originContract);

  /// @notice Gets the origin domain id
  /// @return _originDomain The origin domain id
  function originDomain() external view returns (uint32 _originDomain);

  // ERRORS

  /// @notice Thrown if a caller is not authorized
  error ConnextReceiverAdapter_UnauthorizedCaller();

  /// @notice Thrown if a state variable is set to the zero address
  error ConnextReceiverAdapter_ZeroAddress();
}
