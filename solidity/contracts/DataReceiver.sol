//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.8 <0.9.0;

import {IDataReceiver, IOracleSidechain, IBridgeReceiverAdapter} from '../interfaces/IDataReceiver.sol';
import {Governable} from './peripherals/Governable.sol';

contract DataReceiver is Governable, IDataReceiver {
  IOracleSidechain public immutable oracleSidechain;
  mapping(IBridgeReceiverAdapter => bool) public whitelistedAdapters;

  constructor(IOracleSidechain _oracleSidechain, address _governance) Governable(_governance) {
    oracleSidechain = _oracleSidechain;
    governance = _governance;
  }

  /// @inheritdoc IDataReceiver
  function addObservations(IOracleSidechain.ObservationData[] calldata _observationsData) external onlyWhitelistedAdapters {
    if (oracleSidechain.write(_observationsData)) {
      emit ObservationsAdded(msg.sender, _observationsData);
    } else {
      revert ObservationsNotWritable();
    }
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
