//SPDX-License-Identifier: MIT
pragma solidity >=0.8.8 <0.9.0;

import {IBaseErrors} from '@defi-wonderland/solidity-utils/solidity/interfaces/IBaseErrors.sol';
import {IOracleSidechain} from '../IOracleSidechain.sol';

interface IBridgeSenderAdapter is IBaseErrors {
  /// @notice Gets the address of the DataFeed contract
  /// @return _dataFeed Address of the DataFeed contract
  function dataFeed() external view returns (address _dataFeed);

  /// @notice Bridges observations across chains
  /// @param _to Address of the target contract to xcall
  /// @param _destinationDomainId Domain id of the destination chain
  /// @param _observationsData Array of tuples representing broadcast dataset
  /// @param _poolSalt Identifier of the pool
  /// @param _poolNonce Nonce identifier of the dataset
  function bridgeObservations(
    address _to,
    uint32 _destinationDomainId,
    IOracleSidechain.ObservationData[] memory _observationsData,
    bytes32 _poolSalt,
    uint24 _poolNonce
  ) external payable;

  // ERRORS

  /// @notice Thrown if the DataFeed contract is not the one calling for bridging observations
  error OnlyDataFeed();
}
