//SPDX-License-Identifier: MIT
pragma solidity >=0.8.8 <0.9.0;

import {IConnext} from '@connext/nxtp-contracts/contracts/core/connext/interfaces/IConnext.sol';
import {IBridgeSenderAdapter, IOracleSidechain} from './IBridgeSenderAdapter.sol';
import {IDataFeed} from '../IDataFeed.sol';

interface IConnextSenderAdapter is IBridgeSenderAdapter {
  // STATE VARIABLES

  /// @notice Gets the address of the DataFeed contract
  /// @return _dataFeed Address of the DataFeed contract
  function dataFeed() external view returns (IDataFeed _dataFeed);

  /// @notice Gets the ConnextHandler contract on this domain
  /// @return _connext Address of the ConnextHandler contract
  function connext() external view returns (IConnext _connext);

  // ERRORS

  /// @notice Thrown if the DataFeed contract is not the one calling for bridging observations
  error ConnextSenderAdapter_OnlyDataFeed();

  /// @notice Thrown if a state variable is set to the zero address
  error ConnextSenderAdapter_ZeroAddress();
}
