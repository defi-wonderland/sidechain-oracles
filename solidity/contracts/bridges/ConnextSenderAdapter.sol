// SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {LibConnextStorage, CallParams, XCallArgs} from '@connext/nxtp-contracts/contracts/core/connext/libraries/LibConnextStorage.sol';
import {IConnextSenderAdapter, IBridgeSenderAdapter, IConnextHandler, IDataFeed, IOracleSidechain} from '../../interfaces/bridges/IConnextSenderAdapter.sol';

contract ConnextSenderAdapter is IConnextSenderAdapter {
  /// @inheritdoc IConnextSenderAdapter
  IConnextHandler public immutable connext;
  /// @inheritdoc IConnextSenderAdapter
  IDataFeed public immutable dataFeed;

  constructor(IConnextHandler _connext, IDataFeed _dataFeed) {
    connext = _connext;
    dataFeed = _dataFeed;
  }

  /// @inheritdoc IBridgeSenderAdapter
  function bridgeObservations(
    address _to,
    uint32 _destinationDomainId,
    IOracleSidechain.ObservationData[] calldata _observationsData,
    bytes32 _poolSalt
  ) external payable {
    if (msg.sender != address(dataFeed)) revert OnlyDataFeed();

    // TODO: asset will be deprecated, we have to have one for now--will delete as soon as it's deprecated. This address is a random placeholder
    address _asset = 0x3FFc03F05D1869f493c7dbf913E636C6280e0ff9;
    bytes4 _selector = bytes4(keccak256('addObservations((uint32,int24)[],bytes32)'));

    bytes memory _callData = abi.encodeWithSelector(_selector, _observationsData, _poolSalt);
    uint32 _originDomainId = 1111; // TODO: in theory if we are only going to bridge from mainnet, this could be hardcoded--1111 is rinkeby

    CallParams memory _callParams = CallParams({
      to: _to,
      callData: _callData,
      originDomain: _originDomainId,
      destinationDomain: _destinationDomainId,
      agent: address(0),
      recovery: _to,
      forceSlow: true,
      receiveLocal: false,
      callback: address(0),
      callbackFee: 0,
      relayerFee: 0,
      slippageTol: 9995
    });

    XCallArgs memory _xcallArgs = XCallArgs({params: _callParams, transactingAssetId: _asset, amount: 0});

    connext.xcall(_xcallArgs);

    emit DataSent(_to, _originDomainId, _destinationDomainId, _observationsData, _poolSalt);
  }
}
