//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IUniswapV3Factory} from '@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol';
import {IUniswapV3Pool} from '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import {IConnextSenderAdapter, IBridgeSenderAdapter, IOracleSidechain} from '../interfaces/bridges/IConnextSenderAdapter.sol';
import {IGovernable} from '../interfaces/peripherals/IGovernable.sol';

interface IDataFeed is IGovernable {
  // STRUCTS

  struct PoolState {
    uint32 blockTimestamp;
    int56 tickCumulative;
    int24 arithmeticMeanTick;
  }

  // STATE VARIABLES

  function lastPoolStateBridged()
    external
    view
    returns (
      uint32 _lastBlockTimestampBridged,
      int56 _lastTickCumulativeBridged,
      int24 _lastArithmeticMeanTickBridged
    );

  function whitelistedAdapters(IBridgeSenderAdapter _bridgeSenderAdapter) external view returns (bool _isWhitelisted);

  function receivers(IBridgeSenderAdapter _bridgeSenderAdapter, uint32 _destinationDomainId) external view returns (address _dataReceiver);

  function destinationDomainIds(IBridgeSenderAdapter _bridgeSenderAdapter, uint16 _chainId) external view returns (uint32 _destinationDomainId);

  //solhint-disable-next-line func-name-mixedcase
  function UNISWAP_FACTORY() external view returns (IUniswapV3Factory _uniswapFactory);

  // EVENTS

  event DataSent(
    IBridgeSenderAdapter _bridgeSenderAdapter,
    address _dataReceiver,
    uint32 _destinationDomainId,
    IOracleSidechain.ObservationData[] _observationsData,
    address _token0,
    address _token1,
    uint24 _fee
  );

  event AdapterWhitelisted(IBridgeSenderAdapter _bridgeSenderAdapter, bool _isWhitelisted);

  event ReceiverSet(IBridgeSenderAdapter _bridgeSenderAdapter, uint32 _destinationDomainId, address _dataReceiver);

  event DestinationDomainIdSet(IBridgeSenderAdapter _bridgeSenderAdapter, uint16 _chainId, uint32 _destinationDomainId);

  // ERRORS

  error UnallowedAdapter();
  error DestinationDomainIdNotSet();
  error ReceiverNotSet();
  error InvalidSecondsAgos();
  error LengthMismatch();

  // FUNCTIONS

  function sendObservations(
    IBridgeSenderAdapter _bridgeSenderAdapter,
    uint16 _chainId,
    address _token0,
    address _token1,
    uint24 _fee,
    uint32[] calldata _secondsAgos
  ) external;

  function fetchObservations(IUniswapV3Pool _pool, uint32[] calldata _secondsAgos)
    external
    view
    returns (IOracleSidechain.ObservationData[] memory _observationsData, PoolState memory _lastPoolState);

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
