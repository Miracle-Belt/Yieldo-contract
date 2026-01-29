// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/*//////////////////////////////////////////////////////////////
                            INTERFACE
//////////////////////////////////////////////////////////////*/

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

/*//////////////////////////////////////////////////////////////
                        DEPOSIT ROUTER
//////////////////////////////////////////////////////////////*/

contract DepositRouter is EIP712, Ownable {
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
                                TYPES
    //////////////////////////////////////////////////////////////*/

    bytes32 public constant DEPOSIT_INTENT_TYPEHASH =
        keccak256(
            "DepositIntent(address user,address vault,address asset,address kolAddress,uint256 amount,uint256 nonce,uint256 deadline)"
        );

    struct DepositIntent {
        address user;
        address vault;
        address asset;
        address kolAddress;
        uint256 amount;
        uint256 nonce;
        uint256 deadline;
    }

    // Minimal async storage (1 slot)
    struct AsyncDeposit {
        address vault;     // 20 bytes
        uint96 requestId;  // fits same slot
    }

    /*//////////////////////////////////////////////////////////////
                            STORAGE
    //////////////////////////////////////////////////////////////*/

    // replay protection
    mapping(address => mapping(uint256 => bool)) public usedNonces;

    // async deposits only
    mapping(bytes32 => AsyncDeposit) public asyncDeposits;

    // fees
    bool public feesEnabled;
    address public treasury;

    uint256 public constant FEE_BPS = 10;          // 0.1%
    uint256 public constant KOL_FEE_SHARE = 70;    // 70%
    uint256 public constant YIELDO_FEE_SHARE = 30; // 30%

    /*//////////////////////////////////////////////////////////////
                                ERRORS
    //////////////////////////////////////////////////////////////*/

    error InvalidSignature();
    error IntentExpired();
    error NonceAlreadyUsed();
    error DepositNotFound();
    error VaultNotReady();
    error InvalidTreasuryAddress();

    /*//////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/

    event DepositIntentVerified(
        bytes32 indexed intentHash,
        address indexed user,
        address indexed vault,
        address asset,
        uint256 amount,
        address kol,
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
        uint256 amount,
        uint256 requestId
    );

    event FeeCollected(
        bytes32 indexed intentHash,
        address indexed kol,
        uint256 totalFee,
        uint256 kolFee,
        uint256 yieldoFee
    );

    /*//////////////////////////////////////////////////////////////
                            CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(address _treasury)
        EIP712("YieldoDepositRouter", "1")
        Ownable(msg.sender)
    {
        if (_treasury == address(0)) revert InvalidTreasuryAddress();
        treasury = _treasury;
    }

    /*//////////////////////////////////////////////////////////////
                        MAIN ENTRYPOINT
    //////////////////////////////////////////////////////////////*/

    function verifyAndDeposit(
        DepositIntent calldata intent,
        bytes calldata signature
    ) external returns (bytes32 intentHash) {
        // verify signature
        intentHash = _verifyIntent(intent, signature);

        // deadline
        if (block.timestamp > intent.deadline) revert IntentExpired();

        // nonce
        if (usedNonces[intent.user][intent.nonce]) revert NonceAlreadyUsed();
        usedNonces[intent.user][intent.nonce] = true;

        ILagoonVault vault = ILagoonVault(intent.vault);
        bool isAsync = !vault.isTotalAssetsValid();

        uint256 amount = intent.amount;
        uint256 depositAmount = amount;
        uint256 totalFee;
        uint256 kolFee;
        uint256 yieldoFee;

        if (feesEnabled) {
            unchecked {
                totalFee = (amount * FEE_BPS) / 10_000;
                kolFee = (totalFee * KOL_FEE_SHARE) / 100;
                yieldoFee = totalFee - kolFee;
            }
            depositAmount = amount - totalFee;
        }

        IERC20 asset = IERC20(intent.asset);

        // pull funds
        asset.safeTransferFrom(intent.user, address(this), amount);

        // fees
        if (feesEnabled) {
            emit FeeCollected(
                intentHash,
                intent.kolAddress,
                totalFee,
                kolFee,
                yieldoFee
            );

            if (kolFee != 0 && intent.kolAddress != address(0)) {
                asset.safeTransfer(intent.kolAddress, kolFee);
            }

            if (yieldoFee != 0) {
                asset.safeTransfer(treasury, yieldoFee);
            }
        }

        // approve vault
        asset.safeIncreaseAllowance(intent.vault, depositAmount);

        if (isAsync) {
            uint256 requestId =
                vault.requestDeposit(depositAmount, address(this), intent.user);

            asyncDeposits[intentHash] = AsyncDeposit({
                vault: intent.vault,
                requestId: uint96(requestId)
            });

            emit AsyncDepositRequested(
                intentHash,
                intent.user,
                intent.vault,
                depositAmount,
                requestId
            );
        } else {
            vault.syncDeposit(depositAmount, intent.user, intent.kolAddress);

            emit DepositExecuted(
                intentHash,
                intent.user,
                intent.vault,
                depositAmount,
                false
            );
        }

        emit DepositIntentVerified(
            intentHash,
            intent.user,
            intent.vault,
            intent.asset,
            amount,
            intent.kolAddress,
            isAsync
        );

        return intentHash;
    }

    /*//////////////////////////////////////////////////////////////
                        ASYNC CLAIM
    //////////////////////////////////////////////////////////////*/

    function claimAsyncDeposit(bytes32 intentHash) external {
        AsyncDeposit memory record = asyncDeposits[intentHash];
        if (record.vault == address(0)) revert DepositNotFound();

        ILagoonVault vault = ILagoonVault(record.vault);
        if (!vault.isTotalAssetsValid()) revert VaultNotReady();

        vault.claimAsyncDeposit(record.requestId);

        delete asyncDeposits[intentHash]; // gas refund

        emit DepositExecuted(
            intentHash,
            msg.sender,
            record.vault,
            0,
            true
        );
    }

    /*//////////////////////////////////////////////////////////////
                        ADMIN
    //////////////////////////////////////////////////////////////*/

    function setFeesEnabled(bool _enabled) external onlyOwner {
        feesEnabled = _enabled;
    }

    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert InvalidTreasuryAddress();
        treasury = _treasury;
    }

    /*//////////////////////////////////////////////////////////////
                        EIP-712 VERIFY
    //////////////////////////////////////////////////////////////*/

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
                intent.kolAddress,
                intent.amount,
                intent.nonce,
                intent.deadline
            )
        );

        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, signature);
        if (signer != intent.user) revert InvalidSignature();

        // deterministic intent hash (cheap & indexer-friendly)
        return keccak256(
            abi.encodePacked(
                intent.user,
                intent.nonce,
                intent.vault,
                intent.amount
            )
        );
    }
}
