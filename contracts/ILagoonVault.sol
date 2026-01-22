// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ILagoonVault {
    function deposit(uint256 assets, address receiver) external returns (uint256);
    function requestDeposit(uint256 assets, address receiver) external returns (uint256);
    function isTotalAssetsValid() external view returns (bool);
}
