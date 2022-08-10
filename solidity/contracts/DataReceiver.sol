//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {OracleSidechain} from './OracleSidechain.sol';
import {Governable} from './peripherals/Governable.sol';
import {IDataReceiver, IOracleSidechain, IBridgeReceiverAdapter} from '../interfaces/IDataReceiver.sol';
import {IOracleFactory} from '../interfaces/IOracleFactory.sol';

contract DataReceiver is IDataReceiver, Governable {
  IOracleFactory public oracleFactory;

  bytes32 public constant ORACLE_INIT_CODE_HASH = 0xd39e292a7d431cad5cd9b77d7bdf2f24b85287105b7dafce5950ebeb60755ecb;

  mapping(IBridgeReceiverAdapter => bool) public whitelistedAdapters;

  constructor(address _governance, IOracleFactory _oracleFactory) Governable(_governance) {
    oracleFactory = _oracleFactory;
  }

  function _addObservations(IOracleSidechain _oracle, IOracleSidechain.ObservationData[] calldata _observationsData) internal {
    if (_oracle.write(_observationsData)) {
      emit ObservationsAdded(msg.sender, _observationsData);
    } else {
      revert ObservationsNotWritable();
    }
  }

  function addObservations(
    IOracleSidechain.ObservationData[] calldata _observationsData,
    address _tokenA,
    address _tokenB,
    uint24 _fee
  ) external onlyWhitelistedAdapters {
    (address _token0, address _token1) = _tokenA < _tokenB ? (_tokenA, _tokenB) : (_tokenB, _tokenA);

    IOracleSidechain _resultingAddress = IOracleSidechain(_calculateAddress(address(oracleFactory), _token0, _token1, _fee));
    bool _isDeployed = address(_resultingAddress).code.length > 0;
    if (_isDeployed) {
      return _addObservations(_resultingAddress, _observationsData);
    }
    address _deployedOracle = oracleFactory.deployOracle(_token0, _token1, _fee);
    _addObservations(IOracleSidechain(_deployedOracle), _observationsData);
  }

  function _calculateAddress(
    address _factory,
    address _token0,
    address _token1,
    uint24 _fee
  ) internal pure returns (address _resultingAddress) {
    _resultingAddress = address(
      uint160(uint256(keccak256(abi.encodePacked(hex'ff', _factory, keccak256(abi.encode(_token0, _token1, _fee)), ORACLE_INIT_CODE_HASH))))
    );
  }

  function whitelistAdapter(IBridgeReceiverAdapter _receiverAdapter, bool _isWhitelisted) external onlyGovernance {
    _whitelistAdapter(_receiverAdapter, _isWhitelisted);
  }

  function whitelistAdapters(IBridgeReceiverAdapter[] calldata _receiverAdapters, bool[] calldata _isWhitelisted) external onlyGovernance {
    uint256 _receiverAdapterLength = _receiverAdapters.length;
    if (_receiverAdapterLength != _isWhitelisted.length) revert LengthMismatch();
    uint256 _i;
    unchecked {
      for (_i; _i < _receiverAdapterLength; ++_i) {
        _whitelistAdapter(_receiverAdapters[_i], _isWhitelisted[_i]);
      }
    }
  }

  function _whitelistAdapter(IBridgeReceiverAdapter _receiverAdapter, bool _isWhitelisted) internal {
    whitelistedAdapters[_receiverAdapter] = _isWhitelisted;
    emit AdapterWhitelisted(_receiverAdapter, _isWhitelisted);
  }

  modifier onlyWhitelistedAdapters() {
    if (!whitelistedAdapters[IBridgeReceiverAdapter(msg.sender)]) revert UnallowedAdapter();
    _;
  }
}
