//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {LibConnextStorage, CallParams, XCallArgs} from '@connext/nxtp-contracts/contracts/core/connext/libraries/LibConnextStorage.sol';
import {IConnextSenderAdapter, IConnextHandler, IBridgeSenderAdapter, IDataFeed} from '../../interfaces/bridges/IConnextSenderAdapter.sol';

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
  function bridgeObservation(
    address _to,
    uint32 _destinationDomainId,
    uint32 _arithmeticMeanBlockTimestamp,
    int24 _arithmeticMeanTick
  ) external payable {
    if (msg.sender != address(dataFeed)) revert OnlyDataFeed();

    //TODO: asset will be deprecated, we have to have one for now--will delete as soon as it's deprecated. This address is a random placeholder
    address _asset = 0x3FFc03F05D1869f493c7dbf913E636C6280e0ff9;
    bytes4 _selector = bytes4(keccak256('addObservation(uint32,int24)'));

    bytes memory _callData = abi.encodeWithSelector(_selector, _arithmeticMeanBlockTimestamp, _arithmeticMeanTick);
    uint32 _originDomainId = 1111; //TODO: in theory if we are only going to bridge from mainnet, this could be hardcoded--1111 is rinkeby

    CallParams memory _callParams = CallParams({
      to: _to,
      callData: _callData,
      originDomain: _originDomainId,
      destinationDomain: _destinationDomainId,
      recovery: _to,
      callback: address(0),
      callbackFee: 0,
      forceSlow: true,
      receiveLocal: false
    });

    XCallArgs memory _xcallArgs = XCallArgs({
      params: _callParams,
      transactingAssetId: _asset,
      amount: 0,
      relayerFee: 0 //TODO: will probably need to add an estimator for this when connext defines how this will be handled
    });

    connext.xcall(_xcallArgs);

    emit DataSent(_to, _originDomainId, _destinationDomainId, _arithmeticMeanBlockTimestamp, _arithmeticMeanTick);
  }
}
