//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {Oracle} from '@uniswap/v3-core/contracts/libraries/Oracle.sol';
import {TickMath} from '@uniswap/v3-core/contracts/libraries/TickMath.sol';
import {IOracleSidechain} from '../interfaces/IOracleSidechain.sol';

/// @title A sidechain oracle contract
/// @author 0xJabberwock (from DeFi Wonderland)
/// @notice Computes on-chain price data from Mainnet
/// @dev Bridges Uniswap V3 pool observations
contract OracleSidechain is IOracleSidechain {
  using Oracle for Oracle.Observation[65535];

  struct Slot0 {
    // the current price
    uint160 sqrtPriceX96;
    // the current tick
    int24 tick;
    // the most-recently updated index of the observations array
    uint16 observationIndex;
    // the current maximum number of observations that are being stored
    uint16 observationCardinality;
    // the next maximum number of observations to store, triggered in observations.write
    uint16 observationCardinalityNext;
    // the current protocol fee as a percentage of the swap fee taken on withdrawal
    // represented as an integer denominator (1/x)%
    uint8 feeProtocol;
    // whether the pool is locked
    bool unlocked;
  }
  /// @inheritdoc IOracleSidechain
  Slot0 public override slot0;

  /// @inheritdoc IOracleSidechain
  uint128 public override liquidity;

  /// @inheritdoc IOracleSidechain
  Oracle.Observation[65535] public override observations;

  /// @dev Mutually exclusive reentrancy protection into the pool to/from a method. This method also prevents entrance
  /// to a function before the pool is initialized. The reentrancy guard is required throughout the contract because
  /// we use balance checks to determine the payment status of interactions such as mint, swap and flash.
  modifier lock() {
    if (!slot0.unlocked) revert LOK();
    slot0.unlocked = false;
    _;
    slot0.unlocked = true;
  }

  /// @dev Returns the block timestamp truncated to 32 bits, i.e. mod 2**32. This method is overridden in tests.
  function _blockTimestamp() internal view virtual returns (uint32) {
    return uint32(block.timestamp); // truncation is desired
  }

  /// @inheritdoc IOracleSidechain
  function observe(uint32[] calldata secondsAgos)
    external
    view
    override
    returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s)
  {
    return observations.observe(_blockTimestamp(), secondsAgos, slot0.tick, slot0.observationIndex, liquidity, slot0.observationCardinality);
  }

  function write(
    uint32 blockTimestamp,
    int24 tick,
    uint128 _liquidity
  ) external lock returns (bool written) {
    Slot0 memory _slot0 = slot0;
    Oracle.Observation memory lastObservation = observations[_slot0.observationIndex];
    if (lastObservation.blockTimestamp != blockTimestamp) {
      (uint16 indexUpdated, uint16 cardinalityUpdated) = observations.write(
        _slot0.observationIndex,
        blockTimestamp,
        tick,
        _liquidity,
        _slot0.observationCardinality,
        _slot0.observationCardinalityNext
      );
      (slot0.tick, slot0.observationIndex, slot0.observationCardinality) = (tick, indexUpdated, cardinalityUpdated);
      liquidity = _liquidity;
      written = true;
      emit ObservationWritten(msg.sender, blockTimestamp, tick, _liquidity);
    }
  }

  /// @inheritdoc IOracleSidechain
  function increaseObservationCardinalityNext(uint16 observationCardinalityNext) external override lock {
    uint16 observationCardinalityNextOld = slot0.observationCardinalityNext; // for the event
    uint16 observationCardinalityNextNew = observations.grow(observationCardinalityNextOld, observationCardinalityNext);
    slot0.observationCardinalityNext = observationCardinalityNextNew;
    if (observationCardinalityNextOld != observationCardinalityNextNew)
      emit IncreaseObservationCardinalityNext(observationCardinalityNextOld, observationCardinalityNextNew);
  }

  /// @inheritdoc IOracleSidechain
  /// @dev not locked because it initializes unlocked
  function initialize(uint160 sqrtPriceX96) external override {
    if (slot0.sqrtPriceX96 != 0) revert AI();

    int24 tick = TickMath.getTickAtSqrtRatio(sqrtPriceX96);

    (uint16 cardinality, uint16 cardinalityNext) = observations.initialize(_blockTimestamp());

    slot0 = Slot0({
      sqrtPriceX96: sqrtPriceX96,
      tick: tick,
      observationIndex: 0,
      observationCardinality: cardinality,
      observationCardinalityNext: cardinalityNext,
      feeProtocol: 0,
      unlocked: true
    });

    emit Initialize(sqrtPriceX96, tick);
  }
}
