//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {Oracle} from '@uniswap/v3-core/contracts/libraries/Oracle.sol';
import {IOracleSidechain, IDataReceiver} from '../interfaces/IOracleSidechain.sol';

/// @title A sidechain oracle contract
/// @author 0xJabberwock (from DeFi Wonderland)
/// @notice Computes on-chain price data from Mainnet
/// @dev Bridges Uniswap V3 pool observations
contract OracleSidechain is IOracleSidechain {
  using Oracle for Oracle.Observation[65535];

  struct Slot0 {
    // the most-recently updated index of the observations array
    uint16 observationIndex;
    // the current maximum number of observations that are being stored
    uint16 observationCardinality;
    // the next maximum number of observations to store, triggered in observations.write
    uint16 observationCardinalityNext;
  }
  /// @inheritdoc IOracleSidechain
  Slot0 public slot0;

  /// @inheritdoc IOracleSidechain
  int24 public lastTick;

  /// @inheritdoc IOracleSidechain
  IDataReceiver public dataReceiver;

  /// @inheritdoc IOracleSidechain
  Oracle.Observation[65535] public observations;

  constructor(IDataReceiver _dataReceiver) {
    dataReceiver = _dataReceiver;
  }

  /// @dev Returns the block timestamp truncated to 32 bits, i.e. mod 2**32. This method is overridden in tests.
  function _getBlockTimestamp() internal view virtual returns (uint32) {
    return uint32(block.timestamp); // truncation is desired
  }

  /// @inheritdoc IOracleSidechain
  function observe(uint32[] calldata _secondsAgos)
    external
    view
    returns (int56[] memory _tickCumulatives, uint160[] memory _secondsPerLiquidityCumulativeX128s)
  {
    return observations.observe(_getBlockTimestamp(), _secondsAgos, lastTick, slot0.observationIndex, 0, slot0.observationCardinality);
  }

  // TODO: if not initialized, initialize it --> internalize _initialize
  /// @inheritdoc IOracleSidechain
  function write(uint32 _blockTimestamp, int24 _tick) external returns (bool _written) {
    if (IDataReceiver(msg.sender) != dataReceiver) revert OnlyDataReceiver();
    Slot0 memory _slot0 = slot0;
    Oracle.Observation memory _lastObservation = observations[_slot0.observationIndex];
    if (_lastObservation.blockTimestamp < _blockTimestamp) {
      (uint16 _indexUpdated, uint16 _cardinalityUpdated) = observations.write(
        _slot0.observationIndex,
        _blockTimestamp,
        _tick,
        0,
        _slot0.observationCardinality,
        _slot0.observationCardinalityNext
      );
      (slot0.observationIndex, slot0.observationCardinality) = (_indexUpdated, _cardinalityUpdated);
      lastTick = _tick;
      _written = true;
      emit ObservationWritten(msg.sender, _blockTimestamp, _tick);
    }
  }

  /// @inheritdoc IOracleSidechain
  function increaseObservationCardinalityNext(uint16 _observationCardinalityNext) external {
    uint16 _observationCardinalityNextOld = slot0.observationCardinalityNext; // for the event
    uint16 _observationCardinalityNextNew = observations.grow(_observationCardinalityNextOld, _observationCardinalityNext);
    slot0.observationCardinalityNext = _observationCardinalityNextNew;
    if (_observationCardinalityNextOld != _observationCardinalityNextNew)
      emit IncreaseObservationCardinalityNext(_observationCardinalityNextOld, _observationCardinalityNextNew);
  }

  /// @inheritdoc IOracleSidechain
  function initialize(uint32 _blockTimestamp, int24 _tick) external {
    if (slot0.observationCardinality != 0) revert AI();

    lastTick = _tick;

    (uint16 _cardinality, uint16 _cardinalityNext) = observations.initialize(_blockTimestamp);

    slot0 = Slot0({observationIndex: 0, observationCardinality: _cardinality, observationCardinalityNext: _cardinalityNext});

    emit Initialize(_blockTimestamp, _tick);
  }
}
