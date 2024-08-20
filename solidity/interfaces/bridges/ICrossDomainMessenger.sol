//SPDX-License-Identifier: MIT
pragma solidity >=0.8.8 <0.9.0;

interface ICrossDomainMessenger {
  function xDomainMessageSender() external view returns (address);

  function sendMessage(
    address _target,
    bytes calldata _message,
    uint32 _gasLimit
  ) external payable;
}
