//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IUniswapV3Pool} from '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import {IPipelineManagement} from './peripherals/IPipelineManagement.sol';
import {IDataFeedStrategy} from './IDataFeedStrategy.sol';
import {IConnextSenderAdapter} from './bridges/IConnextSenderAdapter.sol';
import {IBridgeSenderAdapter} from './bridges/IBridgeSenderAdapter.sol';
import {IOracleSidechain} from './IOracleSidechain.sol';

interface IDataFeed is IPipelineManagement {
  // STRUCTS

  struct PoolState {
    uint24 poolNonce;
    uint32 blockTimestamp;
    int56 tickCumulative;
    int24 arithmeticMeanTick;
  }

  // STATE VARIABLES

  function strategy() external view returns (IDataFeedStrategy _strategy);

  /// @notice Tracks the last observed pool state by salt
  /// @param _poolSalt The id of both the oracle and the pool
  /// @return _lastPoolNonceObserved Nonce of the last observation
  /// @return _lastBlockTimestampObserved Last observed timestamp
  /// @return _lastTickCumulativeObserved Pool's tickCumulative at last observed timestamp
  /// @return _lastArithmeticMeanTickObserved Last observed arithmeticMeanTick
  function lastPoolStateObserved(bytes32 _poolSalt)
    external
    view
    returns (
      uint24 _lastPoolNonceObserved,
      uint32 _lastBlockTimestampObserved,
      int56 _lastTickCumulativeObserved,
      int24 _lastArithmeticMeanTickObserved
    );

  // EVENTS

  event DataSent(
    IBridgeSenderAdapter _bridgeSenderAdapter,
    address _dataReceiver,
    uint32 _destinationDomainId,
    IOracleSidechain.ObservationData[] _observationsData,
    bytes32 _poolSalt
  );

  event PoolObserved(bytes32 _poolSalt, uint24 _poolNonce, IOracleSidechain.ObservationData[] _observationsData);

  event StrategyUpdated(IDataFeedStrategy _strategy);

  // ERRORS

  error InvalidSecondsAgos();

  error UnknownHash();

  error OnlyStrategy();

  // FUNCTIONS

  function sendObservations(
    IBridgeSenderAdapter _bridgeSenderAdapter,
    uint32 _chainId,
    bytes32 _poolSalt,
    uint24 _poolNonce,
    IOracleSidechain.ObservationData[] memory _observationsData
  ) external;

  function fetchObservations(bytes32 _poolSalt, uint32[] calldata _secondsAgos) external;

  function fetchObservationsIndices(IUniswapV3Pool _pool, uint32[] calldata _secondsAgos)
    external
    view
    returns (uint16[] memory _observationsIndices);

  function setStrategy(IDataFeedStrategy _strategy) external;
}
