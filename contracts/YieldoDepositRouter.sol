// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ILagoonVault.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract YieldoDepositRouter is EIP712, ReentrancyGuard {
    using ECDSA for bytes32;

    uint256 public constant FEE_BPS = 10; // 0.10%
    uint256 public constant BPS_DENOMINATOR = 10_000;

    bytes32 public constant DEPOSIT_INTENT_TYPEHASH =
        keccak256(
            "DepositIntent(address user,address kol,address vault,uint256 amount,uint256 nonce,uint256 deadline)"
        );

    IERC20 public immutable USDC;
    ILagoonVault public immutable lagoonVault;
    address public immutable yieldoTreasury;

    mapping(address => uint256) public nonces;

    event DepositIntentConfirmed(
        address indexed user,
        address indexed kol,
        address indexed vault,
        uint256 grossAmount,
        uint256 nonce,
        uint256 timestamp
    );

    event DepositFeeTaken(
        address indexed user,
        address indexed kol,
        uint256 grossAmount,
        uint256 totalFee,
        uint256 kolFee,
        uint256 yieldoFee
    );

    constructor(
        address _usdc,
        address _lagoonVault,
        address _yieldoTreasury
    ) EIP712("Yieldo", "1") {
        require(_usdc != address(0), "USDC zero address");
        require(_lagoonVault != address(0), "Vault zero address");
        require(_yieldoTreasury != address(0), "Treasury zero address");

        USDC = IERC20(_usdc);
        lagoonVault = ILagoonVault(_lagoonVault);
        yieldoTreasury = _yieldoTreasury;
    }

    function depositWithIntent(
        address user,
        address kol,
        uint256 amount,
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant {
        require(block.timestamp <= deadline, "Intent expired");
        require(amount > 0, "Zero amount");
        require(kol != address(0), "KOL zero address");

        uint256 nonce = _verifyIntent(user, kol, amount, deadline, signature);

        require(
            USDC.transferFrom(user, address(this), amount),
            "USDC transfer failed"
        );

        uint256 netAmount = _takeFee(user, kol, amount);

        _depositIntoLagoon(user, netAmount);

        emit DepositIntentConfirmed(
            user,
            kol,
            address(lagoonVault),
            amount,
            nonce,
            block.timestamp
        );
    }

    function _verifyIntent(
        address user,
        address kol,
        uint256 amount,
        uint256 deadline,
        bytes calldata signature
    ) internal returns (uint256 nonce) {
        nonce = nonces[user];

        bytes32 structHash = keccak256(
            abi.encode(
                DEPOSIT_INTENT_TYPEHASH,
                user,
                kol,
                address(lagoonVault),
                amount,
                nonce,
                deadline
            )
        );

        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = digest.recover(signature);

        require(signer == user, "Invalid signature");

        nonces[user] = nonce + 1;
    }

    function _takeFee(
        address user,
        address kol,
        uint256 amount
    ) internal returns (uint256 netAmount) {
        uint256 totalFee = (amount * FEE_BPS) / BPS_DENOMINATOR;
        uint256 kolFee = (totalFee * 70) / 100;
        uint256 yieldoFee = totalFee - kolFee;

        if (kolFee > 0) {
            require(
                USDC.transfer(kol, kolFee),
                "KOL fee transfer failed"
            );
        }

        if (yieldoFee > 0) {
            require(
                USDC.transfer(yieldoTreasury, yieldoFee),
                "Yieldo fee transfer failed"
            );
        }

        emit DepositFeeTaken(
            user,
            kol,
            amount,
            totalFee,
            kolFee,
            yieldoFee
        );

        return amount - totalFee;
    }

    function _depositIntoLagoon(
        address user,
        uint256 netAmount
    ) internal {
        USDC.approve(address(lagoonVault), 0);
        USDC.approve(address(lagoonVault), netAmount);

        if (lagoonVault.isTotalAssetsValid()) {
            lagoonVault.deposit(netAmount, user);
        } else {
            lagoonVault.requestDeposit(netAmount, user);
        }
    }
}
