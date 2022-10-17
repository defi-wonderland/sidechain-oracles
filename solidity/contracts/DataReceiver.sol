//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {OracleSidechain} from './OracleSidechain.sol';
import {Governable} from './peripherals/Governable.sol';
import {IDataReceiver, IOracleSidechain, IBridgeReceiverAdapter} from '../interfaces/IDataReceiver.sol';
import {IOracleFactory} from '../interfaces/IOracleFactory.sol';
import {Create2Address} from '../libraries/Create2Address.sol';

contract DataReceiver is IDataReceiver, Governable {
  /// @inheritdoc IDataReceiver
  IOracleFactory public oracleFactory;

  bytes32 public constant ORACLE_INIT_CODE_HASH = 0xd3c84c76027a893c261cc6c48447a62206e59286b7bfc08c0e71e1c581d1b012;

  /// @inheritdoc IDataReceiver
  mapping(IBridgeReceiverAdapter => bool) public whitelistedAdapters;

  constructor(address _governor, IOracleFactory _oracleFactory) Governable(_governor) {
    oracleFactory = _oracleFactory;
  }

  function _writeObservations(
    IOracleSidechain _oracle,
    IOracleSidechain.ObservationData[] memory _observationsData,
    uint24 _poolNonce
  ) internal {
    if (_oracle.write(_observationsData, _poolNonce)) {
      emit ObservationsAdded(msg.sender, _observationsData);
    } else {
      revert ObservationsNotWritable();
    }
  }

  function addObservations(
    IOracleSidechain.ObservationData[] memory _observationsData,
    bytes32 _poolSalt,
    uint24 _poolNonce
  ) external onlyWhitelistedAdapters {
    _addObservations(_observationsData, _poolSalt, _poolNonce);
  }

  function _addObservations(
    IOracleSidechain.ObservationData[] memory _observationsData,
    bytes32 _poolSalt,
    uint24 _poolNonce
  ) internal {
    IOracleSidechain _resultingAddress = IOracleSidechain(
      Create2Address.computeAddress(address(oracleFactory), _poolSalt, ORACLE_INIT_CODE_HASH)
    );
    bool _isDeployed = address(_resultingAddress).code.length > 0;
    if (_isDeployed) {
      return _writeObservations(_resultingAddress, _observationsData, _poolNonce);
    }
    address _deployedOracle = oracleFactory.deployOracle(_poolSalt, _poolNonce);
    _writeObservations(IOracleSidechain(_deployedOracle), _observationsData, _poolNonce);
  }

  function whitelistAdapter(IBridgeReceiverAdapter _receiverAdapter, bool _isWhitelisted) external onlyGovernor {
    _whitelistAdapter(_receiverAdapter, _isWhitelisted);
  }

  /// @inheritdoc IDataReceiver
  function whitelistAdapters(IBridgeReceiverAdapter[] calldata _receiverAdapters, bool[] calldata _isWhitelisted) external onlyGovernor {
    uint256 _receiverAdapterLength = _receiverAdapters.length;
    if (_receiverAdapterLength != _isWhitelisted.length) revert LengthMismatch();
    unchecked {
      for (uint256 _i; _i < _receiverAdapterLength; ++_i) {
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
