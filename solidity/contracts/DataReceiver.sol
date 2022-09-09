// SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {OracleSidechain} from './OracleSidechain.sol';
import {Governable} from './peripherals/Governable.sol';
import {IDataReceiver, IOracleSidechain, IBridgeReceiverAdapter} from '../interfaces/IDataReceiver.sol';
import {IOracleFactory} from '../interfaces/IOracleFactory.sol';
import {Create2Address} from '../libraries/Create2Address.sol';

contract DataReceiver is IDataReceiver, Governable {
  IOracleFactory public oracleFactory;

  bytes32 public constant ORACLE_INIT_CODE_HASH = 0xff738c27977cb06ff63c2b4640f8371d66e6b7fe2d4f8b3d12d3ccf9bc9957b2;

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

  function addObservations(IOracleSidechain.ObservationData[] calldata _observationsData, bytes32 _poolSalt) external onlyWhitelistedAdapters {
    IOracleSidechain _resultingAddress = IOracleSidechain(
      Create2Address.computeAddress(address(oracleFactory), _poolSalt, ORACLE_INIT_CODE_HASH)
    );
    bool _isDeployed = address(_resultingAddress).code.length > 0;
    if (_isDeployed) {
      return _addObservations(_resultingAddress, _observationsData);
    }
    address _deployedOracle = oracleFactory.deployOracle(_poolSalt);
    _addObservations(IOracleSidechain(_deployedOracle), _observationsData);
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
