//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IUniswapV3Factory} from '@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol';
import {IUniswapV3Pool} from '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import {IConnextSenderAdapter, IBridgeSenderAdapter, IOracleSidechain} from './bridges/IConnextSenderAdapter.sol';
import {IGovernable} from './peripherals/IGovernable.sol';
import {IAdapterManagement} from './peripherals/IAdapterManagement.sol';

interface IDataFeed is IGovernable, IAdapterManagement {
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

  //solhint-disable-next-line func-name-mixedcase
  function UNISWAP_FACTORY() external view returns (IUniswapV3Factory _uniswapFactory);

  // EVENTS

  event DataSent(
    IBridgeSenderAdapter _bridgeSenderAdapter,
    address _dataReceiver,
    uint32 _destinationDomainId,
    IOracleSidechain.ObservationData[] _observationsData,
    address _tokenA,
    address _tokenB,
    uint24 _fee
  );

  // ERRORS

  error InvalidSecondsAgos();

  // FUNCTIONS

  function sendObservations(
    IBridgeSenderAdapter _bridgeSenderAdapter,
    uint16 _chainId,
    address _tokenA,
    address _tokenB,
    uint24 _fee,
    uint32[] calldata _secondsAgos
  ) external;

  function fetchObservations(
    IUniswapV3Pool _pool,
    uint32[] calldata _secondsAgos,
    bool _stitch
  ) external view returns (IOracleSidechain.ObservationData[] memory _observationsData, PoolState memory _lastPoolState);

  function fetchObservationsIndices(IUniswapV3Pool _pool, uint32[] calldata _secondsAgos)
    external
    view
    returns (uint16[] memory _observationsIndices);
}
