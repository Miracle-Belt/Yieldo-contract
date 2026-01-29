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
    // Packed struct: address (20 bytes) + uint96 assets (12 bytes) = 32 bytes (1 slot)
    // timestamp and claimed stored separately for gas efficiency
    struct AsyncRequest {
        address owner;      // 20 bytes
        uint96 assets;      // 12 bytes (packed with owner in same slot)
        uint64 timestamp;   // 8 bytes
        bool claimed;       // 1 byte (can pack with timestamp if needed)
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
        
        // Unchecked addition - overflow protection not needed for realistic amounts
        unchecked {
            totalAssetsAmount += assets;
        }

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
        require(assets <= type(uint96).max, "Assets amount too large");

        asset.safeTransferFrom(controller, address(this), assets);

        // Unchecked increment - counter cannot overflow in practice
        unchecked {
            requestId = requestIdCounter++;
        }
        
        asyncRequests[requestId] = AsyncRequest({
            owner: owner,
            assets: uint96(assets),  // Safe cast after require check
            timestamp: uint64(block.timestamp),  // Safe cast (timestamp fits in uint64)
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

        // Cache values in memory to avoid multiple storage reads
        address owner = request.owner;
        uint256 assets = uint256(request.assets);

        request.claimed = true;
        
        // Unchecked addition - overflow protection not needed
        unchecked {
            totalAssetsAmount += assets;
        }

        // 1:1 shares
        uint256 shares = assets;
        _mint(owner, shares);

        emit AsyncDepositClaimed(requestId, owner, shares);
    }

    /**
     * @notice Get total assets (for AUM calculation)
     */
    function totalAssets() external view returns (uint256) {
        return totalAssetsAmount;
    }
}
