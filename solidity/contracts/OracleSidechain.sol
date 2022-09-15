//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {Oracle} from '@uniswap/v3-core/contracts/libraries/Oracle.sol';
import {IOracleSidechain} from '../interfaces/IOracleSidechain.sol';
import {IOracleFactory} from '../interfaces/IOracleFactory.sol';

/// @title A sidechain oracle contract
/// @author 0xJabberwock (from DeFi Wonderland)
/// @notice Computes on-chain price data from Mainnet
/// @dev Bridges Uniswap V3 pool observations
contract OracleSidechain is IOracleSidechain {
  using Oracle for Oracle.Observation[65535];

  /// @inheritdoc IOracleSidechain
  IOracleFactory public immutable factory;

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
  Slot0 public slot0;

  /// @inheritdoc IOracleSidechain
  Oracle.Observation[65535] public observations;

  /// @inheritdoc IOracleSidechain
  bytes32 public immutable poolSalt;
  /// @inheritdoc IOracleSidechain
  address public token0;
  /// @inheritdoc IOracleSidechain
  address public token1;
  /// @inheritdoc IOracleSidechain
  uint24 public fee;

  /// @dev Returns the block timestamp truncated to 32 bits, i.e. mod 2**32. This method is overridden in tests.
  function _getBlockTimestamp() internal view virtual returns (uint32) {
    return uint32(block.timestamp); // truncation is desired
  }

  constructor() {
    uint16 _cardinality;
    (factory, poolSalt, _cardinality) = IOracleFactory(msg.sender).oracleParameters();

    slot0 = Slot0({
      sqrtPriceX96: 0,
      tick: 0,
      observationIndex: _cardinality - 1,
      observationCardinality: _cardinality,
      observationCardinalityNext: _cardinality,
      feeProtocol: 0,
      unlocked: true
    });
  }

  /*
   * NOTE: public function that allows signer to register token0, token1 and fee
   *       before someone registers, oracle can be found with poolSalt, but token0 and token1 views will return address(0)
   */
  /// @inheritdoc IOracleSidechain
  function initializePoolInfo(
    address _tokenA,
    address _tokenB,
    uint24 _fee
  ) external {
    if (!slot0.unlocked) revert AI();

    (address _token0, address _token1) = _tokenA < _tokenB ? (_tokenA, _tokenB) : (_tokenB, _tokenA);
    if (poolSalt != keccak256(abi.encode(_token0, _token1, _fee))) revert InvalidPool();

    token0 = _token0;
    token1 = _token1;
    fee = _fee;
    slot0.unlocked = false;

    emit PoolInfoInitialized(poolSalt, _token0, _token1, _fee);
  }

  /// @inheritdoc IOracleSidechain
  function observe(uint32[] calldata _secondsAgos)
    external
    view
    returns (int56[] memory _tickCumulatives, uint160[] memory _secondsPerLiquidityCumulativeX128s)
  {
    return observations.observe(_getBlockTimestamp(), _secondsAgos, slot0.tick, slot0.observationIndex, 0, slot0.observationCardinality);
  }

  /// @inheritdoc IOracleSidechain
  function write(ObservationData[] calldata _observationsData) external onlyDataReceiver returns (bool _written) {
    Oracle.Observation memory _lastObservation = observations[slot0.observationIndex];
    uint256 _observationsDataLength = _observationsData.length;
    for (uint256 _i; _i < _observationsDataLength; ++_i) {
      if (_lastObservation.blockTimestamp < _observationsData[_i].blockTimestamp) {
        _write(_observationsData[_i]);
        _written = true;
      }
    }
  }

  function _write(ObservationData calldata _observationData) private {
    (uint16 _indexUpdated, uint16 _cardinalityUpdated) = observations.write(
      slot0.observationIndex,
      _observationData.blockTimestamp,
      slot0.tick,
      0,
      slot0.observationCardinality,
      slot0.observationCardinalityNext
    );
    (slot0.observationIndex, slot0.observationCardinality) = (_indexUpdated, _cardinalityUpdated);
    slot0.tick = _observationData.tick;
    emit ObservationWritten(msg.sender, _observationData);
  }

  modifier onlyDataReceiver() {
    if (msg.sender != address(factory.dataReceiver())) revert OnlyDataReceiver();
    _;
  }
}
