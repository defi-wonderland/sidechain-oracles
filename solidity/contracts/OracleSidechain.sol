//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {Oracle} from '@uniswap/v3-core/contracts/libraries/Oracle.sol';
import {IOracleSidechain} from '../interfaces/IOracleSidechain.sol';

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
  Slot0 public override slot0;

  int24 public lastTick;

  /// @inheritdoc IOracleSidechain
  Oracle.Observation[65535] public override observations;

  /// @dev Returns the block timestamp truncated to 32 bits, i.e. mod 2**32. This method is overridden in tests.
  function _getBlockTimestamp() internal view virtual returns (uint32) {
    return uint32(block.timestamp); // truncation is desired
  }

  /// @inheritdoc IOracleSidechain
  function observe(uint32[] calldata _secondsAgos)
    external
    view
    override
    returns (int56[] memory _tickCumulatives, uint160[] memory _secondsPerLiquidityCumulativeX128s)
  {
    return observations.observe(_getBlockTimestamp(), _secondsAgos, lastTick, slot0.observationIndex, 0, slot0.observationCardinality);
  }

  function write(uint32 _blockTimestamp, int24 _tick) external returns (bool _written) {
    Slot0 memory _slot0 = slot0;
    Oracle.Observation memory lastObservation = observations[_slot0.observationIndex];
    if (lastObservation.blockTimestamp < _blockTimestamp) {
      (uint16 indexUpdated, uint16 cardinalityUpdated) = observations.write(
        _slot0.observationIndex,
        _blockTimestamp,
        _tick,
        0,
        _slot0.observationCardinality,
        _slot0.observationCardinalityNext
      );
      (slot0.observationIndex, slot0.observationCardinality) = (indexUpdated, cardinalityUpdated);
      lastTick = _tick;
      _written = true;
      emit ObservationWritten(msg.sender, _blockTimestamp, _tick);
    }
  }

  /// @inheritdoc IOracleSidechain
  function increaseObservationCardinalityNext(uint16 _observationCardinalityNext) external override {
    uint16 observationCardinalityNextOld = slot0.observationCardinalityNext; // for the event
    uint16 observationCardinalityNextNew = observations.grow(observationCardinalityNextOld, _observationCardinalityNext);
    slot0.observationCardinalityNext = observationCardinalityNextNew;
    if (observationCardinalityNextOld != observationCardinalityNextNew)
      emit IncreaseObservationCardinalityNext(observationCardinalityNextOld, observationCardinalityNextNew);
  }

  /// @inheritdoc IOracleSidechain
  function initialize(uint32 _blockTimestamp, int24 _tick) external override {
    if (slot0.observationCardinality != 0) revert AI();

    lastTick = _tick;

    (uint16 cardinality, uint16 cardinalityNext) = observations.initialize(_blockTimestamp);

    slot0 = Slot0({observationIndex: 0, observationCardinality: cardinality, observationCardinalityNext: cardinalityNext});

    emit Initialize(_blockTimestamp, _tick);
  }
}
