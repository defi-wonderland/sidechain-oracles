//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IUniswapV3Pool} from '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import {IConnextSenderAdapter, IBridgeSenderAdapter} from './bridges/IConnextSenderAdapter.sol';
import {IGovernable} from './peripherals/IGovernable.sol';

interface IDataFeed is IGovernable {
  // STATE VARIABLES

  function whitelistedAdapters(IBridgeSenderAdapter _bridgeSenderAdapter) external view returns (bool _isWhitelisted);

  function receivers(IBridgeSenderAdapter _bridgeSenderAdapter, uint32 _destinationDomainId) external view returns (address _dataReceiver);

  function destinationDomainIds(IBridgeSenderAdapter _bridgeSenderAdapter, uint16 _chainId) external view returns (uint32 _destinationDomainId);

  // EVENTS

  event DataSent(
    IBridgeSenderAdapter _bridgeSenderAdapter,
    address _dataReceiver,
    uint32 _destinationDomainId,
    uint32 _arithmeticMeanBlockTimestamp,
    int24 _arithmeticMeanTick
  );

  event AdapterWhitelisted(IBridgeSenderAdapter _bridgeSenderAdapter, bool _isWhitelisted);

  event ReceiverSet(IBridgeSenderAdapter _bridgeSenderAdapter, uint32 _destinationDomainId, address _dataReceiver);

  event DestinationDomainIdSet(IBridgeSenderAdapter _bridgeSenderAdapter, uint16 _chainId, uint32 _destinationDomainId);

  // ERRORS

  error UnallowedAdapter();
  error LengthMismatch();
  error ReceiverNotSet();
  error DestinationDomainIdNotSet();

  // FUNCTIONS

  function sendObservation(
    IBridgeSenderAdapter _bridgeSenderAdapter,
    uint16 _chainId,
    IUniswapV3Pool _pool,
    uint32[] calldata _secondsAgos
  ) external;

  function fetchObservation(IUniswapV3Pool _pool, uint32[] calldata _secondsAgos)
    external
    view
    returns (uint32 _arithmeticMeanBlockTimestamp, int24 _arithmeticMeanTick);

  function whitelistAdapter(IBridgeSenderAdapter _bridgeSenderAdapter, bool _isWhitelisted) external;

  function whitelistAdapters(IBridgeSenderAdapter[] calldata _bridgeSenderAdapters, bool[] calldata _isWhitelisted) external;

  function setReceiver(
    IBridgeSenderAdapter _bridgeSenderAdapter,
    uint32 _destinationDomainId,
    address _dataReceiver
  ) external;

  function setReceivers(
    IBridgeSenderAdapter[] calldata _bridgeSenderAdapters,
    uint32[] calldata _destinationDomainIds,
    address[] calldata _dataReceivers
  ) external;

  function setDestinationDomainId(
    IBridgeSenderAdapter _bridgeSenderAdapter,
    uint16 _chainId,
    uint32 _destinationDomainId
  ) external;

  function setDestinationDomainIds(
    IBridgeSenderAdapter[] calldata _bridgeSenderAdapter,
    uint16[] calldata _chainId,
    uint32[] calldata _destinationDomainId
  ) external;
}
