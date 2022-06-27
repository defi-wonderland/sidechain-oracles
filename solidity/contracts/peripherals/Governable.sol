// SPDX-License-Identifier: MIT
pragma solidity >=0.8.8 <0.9.0;

import {IGovernable} from '../../interfaces/peripherals/IGovernable.sol';

abstract contract Governable is IGovernable {
  /// @inheritdoc IGovernable
  address public governance;

  /// @inheritdoc IGovernable
  address public pendingGovernance;

  constructor(address _governance) {
    if (_governance == address(0)) revert NoGovernanceZeroAddress();
    governance = _governance;
  }

  /// @inheritdoc IGovernable
  function setGovernance(address _governance) external onlyGovernance {
    pendingGovernance = _governance;
    emit GovernanceProposal(_governance);
  }

  /// @inheritdoc IGovernable
  function acceptGovernance() external onlyPendingGovernance {
    governance = pendingGovernance;
    delete pendingGovernance;
    emit GovernanceSet(governance);
  }

  /// @notice Functions with this modifier can only be called by governance
  modifier onlyGovernance() {
    if (msg.sender != governance) revert OnlyGovernance();
    _;
  }

  /// @notice Functions with this modifier can only be called by pendingGovernance
  modifier onlyPendingGovernance() {
    if (msg.sender != pendingGovernance) revert OnlyPendingGovernance();
    _;
  }
}
