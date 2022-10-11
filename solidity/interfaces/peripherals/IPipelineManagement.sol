//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IGovernable} from './IGovernable.sol';
import {IBridgeSenderAdapter} from '../bridges/IBridgeSenderAdapter.sol';

interface IPipelineManagement is IGovernable {
  // STATE VARIABLES

  function whitelistedNonces(uint16 _chainId, bytes32 _poolSalt) external view returns (uint24 _whitelistedNonce);

  function whitelistedAdapters(IBridgeSenderAdapter _bridgeSenderAdapter) external view returns (bool _isWhitelisted);

  function destinationDomainIds(IBridgeSenderAdapter _bridgeSenderAdapter, uint16 _chainId) external view returns (uint32 _destinationDomainId);

  function receivers(IBridgeSenderAdapter _bridgeSenderAdapter, uint32 _destinationDomainId) external view returns (address _dataReceiver);

  // EVENTS

  event PipelineWhitelisted(uint16 _chainId, bytes32 indexed _poolSalt, uint24 _whitelistedNonce);

  event AdapterWhitelisted(IBridgeSenderAdapter _bridgeSenderAdapter, bool _isWhitelisted);

  event DestinationDomainIdSet(IBridgeSenderAdapter _bridgeSenderAdapter, uint16 _chainId, uint32 _destinationDomainId);

  event ReceiverSet(IBridgeSenderAdapter _bridgeSenderAdapter, uint32 _destinationDomainId, address _dataReceiver);

  // ERRORS

  error UnallowedPool();

  error UnallowedPipeline();

  error WrongNonce();

  error UnallowedAdapter();

  error DestinationDomainIdNotSet();

  error ReceiverNotSet();

  error LengthMismatch();

  // FUNCTIONS

  function isWhitelistedPool(bytes32 _poolSalt) external view returns (bool _isWhitelisted);

  function whitelistPipeline(uint16 _chainId, bytes32 _poolSalt) external;

  function whitelistPipelines(uint16[] calldata _chainIds, bytes32[] calldata _poolSalts) external;

  function whitelistAdapter(IBridgeSenderAdapter _bridgeSenderAdapter, bool _isWhitelisted) external;

  function whitelistAdapters(IBridgeSenderAdapter[] calldata _bridgeSenderAdapters, bool[] calldata _isWhitelisted) external;

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

  function validateSenderAdapter(IBridgeSenderAdapter _bridgeSenderAdapter, uint16 _chainId)
    external
    view
    returns (uint32 _destinationDomainId, address _dataReceiver);
}
