//SPDX-License-Identifier: MIT
pragma solidity >=0.8.8 <0.9.0;

import {IOracleSidechain} from '../../interfaces/bridges/IBridgeSenderAdapter.sol';
import {ICrossDomainMessenger} from '../../interfaces/bridges/ICrossDomainMessenger.sol';
import {IDataReceiver} from '../../interfaces/IDataReceiver.sol';
import {BridgeSenderAdapter} from './BridgeSenderAdapter.sol';
import {LibConnextStorage, TransferInfo} from '@connext/nxtp-contracts/contracts/core/connext/libraries/LibConnextStorage.sol';

contract OptimismSenderAdapter is BridgeSenderAdapter {
  ICrossDomainMessenger public immutable messenger;

  constructor(address _dataFeed, ICrossDomainMessenger _messenger) BridgeSenderAdapter(_dataFeed) {
    if (address(_messenger) == address(0)) revert ZeroAddress();
    messenger = _messenger;
  }

  function _bridgeObservations(
    address _to,
    uint32 _destinationDomainId,
    IOracleSidechain.ObservationData[] memory _observationsData,
    bytes32 _poolSalt,
    uint24 _poolNonce
  ) internal override {
    // assert(_destinationDomainId == OP);

    messenger.sendMessage{value: msg.value}(
      _to, // receiver adapter address
      abi.encodeCall(IDataReceiver.addObservations, (_observationsData, _poolSalt, _poolNonce)), // call data
      100000 // gas limit
    );
  }
}
