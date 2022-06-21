//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IConnextSenderAdapter, IBridgeAdapter} from './bridges/IConnextSenderAdapter.sol';
import {IUniswapV3Pool} from '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import {IGovernable} from './peripherals/IGovernable.sol';

interface IDataFeed is IGovernable {
  // STATE VARIABLES

  function whitelistedAdapters(IBridgeAdapter _bridgeAdapter) external view returns (bool _isWhitelisted);

  function receivers(IBridgeAdapter _bridgeAdapter, uint32 _destinationDomainId) external view returns (address _dataReceiver);

  function destinationDomainIds(IBridgeAdapter _bridgeAdapter, uint16 _chainId) external view returns (uint32 _destinationDomainId);

  // EVENTS

  event DataSent(IBridgeAdapter bridgeAdapter, address dataReceiver, uint32 destinationDomainId, uint32 blockTimestamp, int24 tick);

  event AdapterWhitelisted(IBridgeAdapter bridgeAdapter, bool isWhitelisted);

  event ReceiverSet(IBridgeAdapter bridgeAdapter, uint32 destinationDomainId, address dataReceiver);

  event DestinationDomainIdSet(IBridgeAdapter bridgeAdapter, uint16 chainId, uint32 destinationDomainId);

  // ERRORS

  error UnallowedAdapter();
  error LengthMismatch();
  error ReceiverNotSet();
  error DestinationDomainIdNotSet();

  // FUNCTIONS

  function sendObservation(
    IBridgeAdapter _bridgeAdapter,
    uint16 _chainId,
    IUniswapV3Pool _pool
  ) external;

  function fetchLatestObservation(IUniswapV3Pool _pool) external view returns (uint32 _blockTimestamp, int24 _tick);

  function whitelistAdapter(IBridgeAdapter _bridgeAdapter, bool _isWhitelisted) external;

  function whitelistAdapters(IBridgeAdapter[] calldata _bridgeAdapters, bool[] calldata _isWhitelisted) external;

  function setReceiver(
    IBridgeAdapter _bridgeAdapter,
    uint32 _destinationDomainId,
    address _dataReceiver
  ) external;

  function setReceivers(
    IBridgeAdapter[] calldata _bridgeAdapters,
    uint32[] calldata _destinationDomainIds,
    address[] calldata _dataReceivers
  ) external;

  function setDestinationDomainId(
    IBridgeAdapter _bridgeAdapter,
    uint16 _chainId,
    uint32 _destinationDomainId
  ) external;

  function setDestinationDomainIds(
    IBridgeAdapter[] calldata _bridgeAdapter,
    uint16[] calldata _chainId,
    uint32[] calldata _destinationDomainId
  ) external;
}
