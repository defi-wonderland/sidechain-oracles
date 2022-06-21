//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {LibConnextStorage, CallParams, XCallArgs} from '@connext/nxtp-contracts/contracts/core/connext/libraries/LibConnextStorage.sol';
import {IConnextSenderAdapter, IConnextHandler, IDataFeed} from '../../interfaces/bridges/IConnextSenderAdapter.sol';

contract ConnextSenderAdapter is IConnextSenderAdapter {
  IConnextHandler public immutable override connext;
  IDataFeed public immutable dataFeed;

  constructor(IConnextHandler _connext, IDataFeed _dataFeed) {
    connext = _connext;
    dataFeed = _dataFeed;
  }

  function bridgeObservation(
    address _to,
    uint32 _destinationDomainId,
    uint32 _blockTimestamp,
    int24 _tick
  ) external payable {
    if (msg.sender != address(dataFeed)) revert OnlyDataFeed();

    //TODO: asset will be deprecated, we have to have one for now--will delete as soon as it's deprecated. This address is a random placeholder
    address _asset = 0x3FFc03F05D1869f493c7dbf913E636C6280e0ff9;
    bytes4 selector = bytes4(keccak256('addObservation(uint32,int24)'));

    bytes memory callData = abi.encodeWithSelector(selector, _blockTimestamp, _tick);
    uint32 _originDomainId = 1111; //TODO: in theory if we are only going to bridge from mainnet, this could be hardcoded--1111 is rinkeby

    CallParams memory callParams = CallParams({
      to: _to,
      callData: callData,
      originDomain: _originDomainId,
      destinationDomain: _destinationDomainId,
      recovery: _to,
      callback: address(0),
      callbackFee: 0,
      forceSlow: false, // TODO: change to true when switch to permissioned
      receiveLocal: false
    });

    XCallArgs memory xcallArgs = XCallArgs({
      params: callParams,
      transactingAssetId: _asset,
      amount: 0,
      relayerFee: 0 //TODO: will probably need to add an estimator for this when connext defines how this will be handled
    });

    connext.xcall(xcallArgs);

    emit DataSent(_to, _originDomainId, _destinationDomainId, _blockTimestamp, _tick);
  }
}
