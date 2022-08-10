// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import {IUniswapV3Pool} from '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';

/// @title OracleFork
/// @notice Provides price and liquidity data useful for a wide variety of system designs
/// @dev Instances of stored oracle data, "observations", are collected in the oracle array
/// Every pool is initialized with an oracle array length of 1. Anyone can pay the SSTOREs to increase the
/// maximum length of the oracle array. New slots will be added when the array is fully populated.
/// Observations are overwritten when the full length of the oracle array is populated.
/// The most recent observation is available, independent of the length of the oracle array, by passing 0 to observe()
library OracleFork {
  error I();
  error OLD();

  /// @notice comparator for 32-bit timestamps
  /// @dev safe for 0 or 1 overflows, a and b _must_ be chronologically before or equal to time
  /// @param _time A timestamp truncated to 32 bits
  /// @param _a A comparison timestamp from which to determine the relative position of `time`
  /// @param _b From which to determine the relative position of `time`
  /// @return Whether `a` is chronologically <= `b`
  function _lte(
    uint32 _time,
    uint32 _a,
    uint32 _b
  ) private pure returns (bool) {
    unchecked {
      // if there hasn't been overflow, no need to adjust
      if (_a <= _time && _b <= _time) return _a <= _b;

      uint256 _aAdjusted = _a > _time ? _a : _a + 2**32;
      uint256 _bAdjusted = _b > _time ? _b : _b + 2**32;

      return _aAdjusted <= _bAdjusted;
    }
  }

  /// @notice Fetches the observations beforeOrAt and atOrAfter a target, i.e. where [beforeOrAt, atOrAfter] is satisfied.
  /// The result may be the same observation, or adjacent observations.
  /// @dev The answer must be contained in the array, used when the target is located within the stored observation
  /// boundaries: older than the most recent observation and younger, or the same age as, the oldest observation
  /// @param _pool The Uniswap V3 pool
  /// @param _time The current block.timestamp
  /// @param _target The timestamp at which the reserved observation should be for
  /// @param _index The index of the observation that was most recently written to the observations array
  /// @param _cardinality The number of populated elements in the oracle array
  /// @return _beforeOrAtIndex The index of the observation recorded before, or at, the target
  function _binarySearch(
    IUniswapV3Pool _pool,
    uint32 _time,
    uint32 _target,
    uint16 _index,
    uint16 _cardinality
  ) private view returns (uint16 _beforeOrAtIndex) {
    unchecked {
      uint16 _atOrAfterIndex;
      uint256 _l = (_index + 1) % _cardinality; // oldest observation
      uint256 _r = _l + _cardinality - 1; // newest observation
      uint256 _i;
      uint32 _blockTimestamp;
      bool _initialized;
      while (true) {
        _i = (_l + _r) / 2;

        _beforeOrAtIndex = uint16(_i % _cardinality);
        (_blockTimestamp, , , _initialized) = _pool.observations(_beforeOrAtIndex);

        // we've landed on an uninitialized tick, keep searching higher (more recently)
        if (!_initialized) {
          _l = _i + 1;
          continue;
        }

        if (!_lte(_time, _blockTimestamp, _target)) {
          _r = _i - 1;
          continue;
        }

        _atOrAfterIndex = uint16((_i + 1) % _cardinality);
        (_blockTimestamp, , , ) = _pool.observations(_atOrAfterIndex);

        // check if we've found the answer!
        if (!_lte(_time, _target, _blockTimestamp)) {
          _l = _i + 1;
          continue;
        }

        if (_target == _blockTimestamp) _beforeOrAtIndex = _atOrAfterIndex;
        break;
      }
    }
  }

  /// @notice Fetches the observations beforeOrAt and atOrAfter a given target, i.e. where [beforeOrAt, atOrAfter] is satisfied
  /// @dev Assumes there is at least 1 initialized observation.
  /// @param _pool The Uniswap V3 pool
  /// @param _time The current block.timestamp
  /// @param _target The timestamp at which the reserved observation should be for
  /// @param _index The index of the observation that was most recently written to the observations array
  /// @param _cardinality The number of populated elements in the oracle array
  /// @return _beforeOrAtIndex The index of the observation which occurred at, or before, the given timestamp
  function getPreviousObservationIndex(
    IUniswapV3Pool _pool,
    uint32 _time,
    uint32 _target,
    uint16 _index,
    uint16 _cardinality
  ) internal view returns (uint16 _beforeOrAtIndex) {
    unchecked {
      if (_cardinality <= 0) revert I();

      // optimistically fetch the newest observation
      (uint32 _blockTimestamp, , , ) = _pool.observations(_index);

      // if the target is chronologically at or after the newest observation, we can early return
      if (_lte(_time, _blockTimestamp, _target)) {
        return _index;
      }

      // now, fetch the oldest observation
      bool _initialized;
      (_blockTimestamp, , , _initialized) = _pool.observations((_index + 1) % _cardinality);
      if (!_initialized) {
        (_blockTimestamp, , , ) = _pool.observations(0);
      }

      // ensure that the target is chronologically at or after the oldest observation
      if (!_lte(_time, _blockTimestamp, _target)) revert OLD();

      // if we've reached this point, we have to binary search
      return _binarySearch(_pool, _time, _target, _index, _cardinality);
    }
  }
}
