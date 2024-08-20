//SPDX-License-Identifier: MIT
pragma solidity >=0.8.8 <0.9.0;

import {IConnext, IConnextSenderAdapter} from '../../interfaces/bridges/IConnextSenderAdapter.sol';
import {IBridgeSenderAdapter, IOracleSidechain} from '../../interfaces/bridges/IBridgeSenderAdapter.sol';
import {IDataFeed} from '../../interfaces/IDataFeed.sol';
import {BridgeSenderAdapter} from './BridgeSenderAdapter.sol';
import {LibConnextStorage, TransferInfo} from '@connext/nxtp-contracts/contracts/core/connext/libraries/LibConnextStorage.sol';

contract ConnextSenderAdapter is IConnextSenderAdapter, BridgeSenderAdapter {
  /// @inheritdoc IConnextSenderAdapter
  IConnext public immutable connext;

  constructor(address _dataFeed, IConnext _connext) BridgeSenderAdapter(_dataFeed) {
    if (address(_connext) == address(0)) revert ZeroAddress();
    connext = _connext;
  }

  function _bridgeObservations(
    address _to,
    uint32 _destinationDomainId,
    IOracleSidechain.ObservationData[] memory _observationsData,
    bytes32 _poolSalt,
    uint24 _poolNonce
  ) internal override {
    bytes memory _callData = abi.encode(_observationsData, _poolSalt, _poolNonce);

    connext.xcall{value: msg.value}({
      _destination: _destinationDomainId, // unique identifier for destination domain
      _to: _to, // recipient of funds, where calldata will be executed
      _asset: address(0), // asset being transferred
      _delegate: address(0), // permissioned address to recover in edgecases on destination domain
      _amount: 0, // amount being transferred
      _slippage: 0, // slippage in bps
      _callData: _callData // to be executed on _to on the destination domain
    });
  }
}
