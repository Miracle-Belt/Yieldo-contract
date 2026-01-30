// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockLagoonVault
 * @notice Mock implementation of Lagoon vault for testing
 * Supports both sync and async deposit patterns
 */
contract MockLagoonVault is ERC20 {
    using SafeERC20 for IERC20;

    IERC20 public immutable asset;
    bool public totalAssetsValid;
    uint256 public totalAssetsAmount;

    // Async deposit requests
    struct AsyncRequest {
        address owner;
        uint256 assets;
        uint256 timestamp;
        bool claimed;
    }

    mapping(uint256 => AsyncRequest) public asyncRequests;
    uint256 public requestIdCounter;

    event SyncDeposit(
        address indexed user,
        address indexed referral,
        uint256 assets,
        uint256 shares
    );

    event AsyncDepositRequested(
        uint256 indexed requestId,
        address indexed owner,
        uint256 assets
    );

    event AsyncDepositClaimed(
        uint256 indexed requestId,
        address indexed owner,
        uint256 shares
    );

    constructor(
        address _asset,
        string memory name,
        string memory symbol
    ) ERC20(name, symbol) {
        asset = IERC20(_asset);
        totalAssetsValid = true; // Start as sync-capable
        totalAssetsAmount = 0;
    }

    /**
     * @notice Check if total assets are valid (sync deposit available)
     */
    function isTotalAssetsValid() external view returns (bool) {
        return totalAssetsValid;
    }

    /**
     * @notice Set total assets validity (for testing async flow)
     */
    function setTotalAssetsValid(bool _valid) external {
        totalAssetsValid = _valid;
    }

    /**
     * @notice Synchronous deposit
     */
    function syncDeposit(
        uint256 assets,
        address receiver,
        address referral
    ) external returns (uint256 shares) {
        require(totalAssetsValid, "Vault not ready for sync deposits");
        require(assets > 0, "Invalid amount");

        asset.safeTransferFrom(msg.sender, address(this), assets);
        totalAssetsAmount += assets;

        // 1:1 shares for simplicity (in real vault, this would be calculated)
        shares = assets;
        _mint(receiver, shares);

        emit SyncDeposit(receiver, referral, assets, shares);
        return shares;
    }

    /**
     * @notice Request async deposit
     */
    function requestDeposit(
        uint256 assets,
        address controller,
        address owner
    ) external returns (uint256 requestId) {
        require(!totalAssetsValid, "Vault ready for sync deposits");
        require(assets > 0, "Invalid amount");

        asset.safeTransferFrom(controller, address(this), assets);

        requestId = requestIdCounter++;
        asyncRequests[requestId] = AsyncRequest({
            owner: owner,
            assets: assets,
            timestamp: block.timestamp,
            claimed: false
        });

        emit AsyncDepositRequested(requestId, owner, assets);
        return requestId;
    }

    /**
     * @notice Claim async deposit (simulate vault becoming ready)
     */
    function claimAsyncDeposit(uint256 requestId) external {
        AsyncRequest storage request = asyncRequests[requestId];
        require(!request.claimed, "Already claimed");
        require(totalAssetsValid, "Vault not ready");

        request.claimed = true;
        totalAssetsAmount += request.assets;

        // 1:1 shares
        uint256 shares = request.assets;
        _mint(request.owner, shares);

        emit AsyncDepositClaimed(requestId, request.owner, shares);
    }

    /**
     * @notice Get total assets (for AUM calculation)
     */
    function totalAssets() external view returns (uint256) {
        return totalAssetsAmount;
    }
}
