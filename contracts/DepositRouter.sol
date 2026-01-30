// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "hardhat/console.sol";

// Lagoon vault interface (simplified)
interface ILagoonVault {
    function isTotalAssetsValid() external view returns (bool);
    function syncDeposit(
        uint256 assets,
        address receiver,
        address referral
    ) external returns (uint256);
    function requestDeposit(
        uint256 assets,
        address controller,
        address owner
    ) external returns (uint256);
    function claimAsyncDeposit(uint256 requestId) external;
}

/**
 * @title DepositRouter
 * @notice Routes deposits to Lagoon vaults with EIP-712 intent verification
 * Supports both synchronous and asynchronous deposit flows
 */
contract DepositRouter is EIP712, Ownable {
    using SafeERC20 for IERC20;

    bytes32 public constant DEPOSIT_INTENT_TYPEHASH =
        keccak256(
            "DepositIntent(address user,address vault,address asset,uint256 amount,uint256 nonce,uint256 deadline,address kolAddress)"
        );

    struct DepositIntent {
        address user;
        address vault;
        address asset;
        uint256 amount;
        uint256 nonce;
        uint256 deadline;
        address kolAddress;
    }

    struct DepositRecord {
        address user;
        address vault;
        address asset;
        uint256 amount;
        address kolAddress;
        uint256 timestamp;
        bool isAsync;
        bytes32 intentHash;
        uint256 requestId; // For async deposits
    }

    // Mapping: user => nonce => used
    mapping(address => mapping(uint256 => bool)) public usedNonces;

    // Mapping: intent hash => deposit record
    mapping(bytes32 => DepositRecord) public deposits;

    // Fee configuration
    bool public feesEnabled;
    uint256 public constant FEE_BPS = 10; // 10 basis points (0.1%)
    uint256 public constant KOL_FEE_SHARE = 70; // 70% of fee to KOL
    uint256 public constant YIELDO_FEE_SHARE = 30; // 30% of fee to Yieldo
    address public treasury; // Yieldo treasury address

    //event check 
    event EventCheck(
        DepositIntent indexed intent
    );

    // Events
    event DepositIntentVerified(
        bytes32 indexed intentHash,
        address indexed user,
        address indexed vault,
        address asset,
        uint256 amount,
        address kolAddress,
        bool isAsync
    );

    event DepositExecuted(
        bytes32 indexed intentHash,
        address indexed user,
        address indexed vault,
        uint256 amount,
        bool isAsync
    );

    event AsyncDepositRequested(
        bytes32 indexed intentHash,
        address indexed user,
        address indexed vault,
        uint256 amount
    );

    event FeeCollected(
        bytes32 indexed intentHash,
        address indexed kolAddress,
        uint256 totalFee,
        uint256 kolFee,
        uint256 yieldoFee
    );

    constructor(address _treasury) EIP712("YieldoDepositRouter", "1") Ownable(msg.sender) {
        treasury = _treasury;
        feesEnabled = false; // Disabled by default (can be de-scoped)
    }

    /**
     * @notice Verify and execute deposit intent
     * @param intent The deposit intent parameters
     * @param signature The EIP-712 signature from the user
     */
    function verifyAndDeposit(
        DepositIntent calldata intent,
        bytes calldata signature
    ) external returns (bytes32 intentHash) {
        // Verify signature
        intentHash = _verifyIntent(intent, signature);
        emit EventCheck(intent);
        // Check if already executed
        require(deposits[intentHash].timestamp == 0, "Deposit already executed");

        // Check deadline
        require(block.timestamp <= intent.deadline, "Intent expired");

        // Check nonce
        require(!usedNonces[intent.user][intent.nonce], "Nonce already used");
        usedNonces[intent.user][intent.nonce] = true;

        // Determine if async or sync
        ILagoonVault vault = ILagoonVault(intent.vault);
        bool isAsync = !vault.isTotalAssetsValid();

        // Calculate and collect fees (if enabled)
        uint256 depositAmount = intent.amount;
        if (feesEnabled) {
            uint256 totalFee = (intent.amount * FEE_BPS) / 10000;
            uint256 kolFee = (totalFee * KOL_FEE_SHARE) / 100;
            uint256 yieldoFee = totalFee - kolFee; // Remaining 30%
            
            depositAmount = intent.amount - totalFee;

            emit FeeCollected(intentHash, intent.kolAddress, totalFee, kolFee, yieldoFee);
        }

        // Create IERC20 instance for SafeERC20 operations
        IERC20 asset = IERC20(intent.asset);

        // Transfer assets from user to router first
        asset.safeTransferFrom(
            intent.user,
            address(this),
            intent.amount
        );

        // Distribute fees (if enabled)
        if (feesEnabled) {
            uint256 totalFee = intent.amount - depositAmount;
            uint256 kolFee = (totalFee * KOL_FEE_SHARE) / 100;
            uint256 yieldoFee = totalFee - kolFee;

            // Transfer fees
            if (kolFee > 0 && intent.kolAddress != address(0)) {
                asset.safeTransfer(intent.kolAddress, kolFee);
            }
            if (yieldoFee > 0 && treasury != address(0)) {
                asset.safeTransfer(treasury, yieldoFee);
            }
        }

        // Handle async vs sync deposits
        uint256 requestId = 0;
        if (isAsync) {
            // Approve vault for async deposit
            asset.safeIncreaseAllowance(intent.vault, depositAmount);
            // Request async deposit - transfers from router to vault
            requestId = vault.requestDeposit(depositAmount, address(this), intent.user);
            emit AsyncDepositRequested(
                intentHash,
                intent.user,
                intent.vault,
                depositAmount
            );
        } else {
            // Approve vault for sync deposit
            asset.safeIncreaseAllowance(intent.vault, depositAmount);
            // Execute sync deposit
            vault.syncDeposit(depositAmount, intent.user, intent.kolAddress);
            emit DepositExecuted(
                intentHash,
                intent.user,
                intent.vault,
                depositAmount,
                false
            );
        }

        // Record deposit intent (store deposit amount after fees)
        deposits[intentHash] = DepositRecord({
            user: intent.user,
            vault: intent.vault,
            asset: intent.asset,
            amount: depositAmount, // Store amount after fees
            kolAddress: intent.kolAddress,
            timestamp: block.timestamp,
            isAsync: isAsync,
            intentHash: intentHash,
            requestId: requestId
        });

        emit DepositIntentVerified(
            intentHash,
            intent.user,
            intent.vault,
            intent.asset,
            intent.amount, // Original amount in event
            intent.kolAddress,
            isAsync
        );

        return intentHash;
    }

    /**
     * @notice Execute async deposit claim (called after async deposit is ready)
     * @param intentHash The original intent hash
     */
    function claimAsyncDeposit(bytes32 intentHash) external {
        DepositRecord storage record = deposits[intentHash];
        require(record.timestamp > 0, "Deposit not found");
        require(record.isAsync, "Not an async deposit");

        ILagoonVault vault = ILagoonVault(record.vault);
        require(vault.isTotalAssetsValid(), "Vault not ready");

        // Claim the async deposit using the stored requestId
        // Assets are already in the vault from the requestDeposit call
        vault.claimAsyncDeposit(record.requestId);

        emit DepositExecuted(
            intentHash,
            record.user,
            record.vault,
            record.amount,
            true
        );
    }

    /**
     * @notice Get deposit record by intent hash
     */
    function getDeposit(bytes32 intentHash)
        external
        view
        returns (DepositRecord memory)
    {
        return deposits[intentHash];
    }

    /**
     * @notice Enable or disable fees (owner only)
     * @param _enabled Whether fees should be enabled
     */
    function setFeesEnabled(bool _enabled) external onlyOwner {
        feesEnabled = _enabled;
    }

    /**
     * @notice Update treasury address (owner only)
     * @param _treasury New treasury address
     */
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury address");
        treasury = _treasury;
    }

    /**
     * @notice Verify EIP-712 signature
     */
    function _verifyIntent(
        DepositIntent calldata intent,
        bytes calldata signature
    ) internal view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                DEPOSIT_INTENT_TYPEHASH,
                intent.user,
                intent.vault,
                intent.asset,
                intent.amount,
                intent.nonce,
                intent.deadline,
                intent.kolAddress
            )
        );

        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(hash, signature);

        require(signer == intent.user, "Invalid signature");
        // Deterministic intent hash based on user, nonce, and intent parameters
        return keccak256(abi.encodePacked(intent.user, intent.nonce, intent.vault, intent.amount));
    }
}
