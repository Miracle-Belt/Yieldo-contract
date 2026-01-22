// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ILagoonVault.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract TestnetLagoonVault is ILagoonVault {
    IERC20 public immutable USDC;

    mapping(address => uint256) public balances;

    constructor(address _usdc) {
        USDC = IERC20(_usdc);
    }

    function deposit(uint256 assets, address receiver) external override returns (uint256) {
        balances[receiver] += assets;
        return assets;
    }

    function requestDeposit(uint256 assets, address receiver) external override returns (uint256) {
        balances[receiver] += assets;
        return assets;
    }

    function isTotalAssetsValid() external pure override returns (bool) {
        return true;
    }
}
