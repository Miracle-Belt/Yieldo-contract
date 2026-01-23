// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*//////////////////////////////////////////////////////////////
                            INTERFACES
//////////////////////////////////////////////////////////////*/

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function approve(address, uint256) external returns (bool);
}

interface ILagoonVaultLike {
    function asset() external view returns (address);
    function isTotalAssetsValid() external view returns (bool);

    function syncDeposit(
        uint256 assets,
        address receiver,
        address referral
    ) external payable returns (uint256 shares);

    function requestDeposit(
        uint256 assets,
        address controller,
        address owner
    ) external payable returns (uint256 requestId);
}

/*//////////////////////////////////////////////////////////////
                            LIBRARY
//////////////////////////////////////////////////////////////*/

library SafeERC20 {
    function safeTransferFrom(
        IERC20 token,
        address from,
        address to,
        uint256 amount
    ) internal {
        require(token.transferFrom(from, to, amount), "TRANSFER_FROM_FAILED");
    }

    function safeTransfer(
        IERC20 token,
        address to,
        uint256 amount
    ) internal {
        require(token.transfer(to, amount), "TRANSFER_FAILED");
    }

    function safeApprove(
        IERC20 token,
        address spender,
        uint256 amount
    ) internal {
        require(token.approve(spender, amount), "APPROVE_FAILED");
    }
}

/*//////////////////////////////////////////////////////////////
                    YIELDO DEPOSIT ROUTER
//////////////////////////////////////////////////////////////*/

contract YieldoDepositRouter {
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
                                CONFIG
    //////////////////////////////////////////////////////////////*/

    address public owner;
    address public treasury;
    address public intentSigner;

    uint16 public depositFeeBps = 10; // 0.10%
    uint16 public kolShareBps = 7000; // 70% of fee

    /*//////////////////////////////////////////////////////////////
                            ACCOUNTING
    //////////////////////////////////////////////////////////////*/

    mapping(address => mapping(address => uint256)) public feeBalances;
    mapping(bytes32 => bool) public usedIntents;

    /*//////////////////////////////////////////////////////////////
                            EIP-712
    //////////////////////////////////////////////////////////////*/

    bytes32 public DOMAIN_SEPARATOR;

    bytes32 public constant INTENT_TYPEHASH =
        keccak256(
            "DepositIntent(address user,address vault,address kol,uint256 grossAssets,uint256 deadline,uint256 nonce)"
        );

    /*//////////////////////////////////////////////////////////////
                                STRUCTS
    //////////////////////////////////////////////////////////////*/

    struct DepositIntent {
        address user;
        address vault;
        address kol;
        uint256 grossAssets;
        uint256 deadline;
        uint256 nonce;
    }

    /*//////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/

    event DepositRouted(
        bytes32 indexed intentHash,
        address indexed user,
        address indexed vault,
        address asset,
        address kol,
        uint256 grossAssets,
        uint256 netAssets,
        uint256 feeAssets,
        bool isSync,
        uint256 lagoonOut
    );

    event FeeAccrued(address indexed beneficiary, address indexed token, uint256 amount);
    event FeeClaimed(address indexed beneficiary, address indexed token, address to, uint256 amount);

    /*//////////////////////////////////////////////////////////////
                                MODIFIERS
    //////////////////////////////////////////////////////////////*/

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    /*//////////////////////////////////////////////////////////////
                                CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(address _treasury, address _intentSigner) {
        owner = msg.sender;
        treasury = _treasury;
        intentSigner = _intentSigner;

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256("YieldoDepositRouter"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }

    /*//////////////////////////////////////////////////////////////
                            CORE ENTRYPOINT
    //////////////////////////////////////////////////////////////*/

    function depositWithIntent(
        DepositIntent calldata intent,
        bytes calldata sig
    ) external returns (uint256 lagoonOut) {
        _validateIntent(intent, sig);

        address asset = ILagoonVaultLike(intent.vault).asset();

        IERC20(asset).safeTransferFrom(
            intent.user,
            address(this),
            intent.grossAssets
        );

        (uint256 fee, uint256 net) = _calculateFees(intent.grossAssets);
        _splitFees(intent.kol, asset, fee);

        IERC20(asset).safeApprove(intent.vault, 0);
        IERC20(asset).safeApprove(intent.vault, net);

        bool isSync = ILagoonVaultLike(intent.vault).isTotalAssetsValid();

        if (isSync) {
            lagoonOut = ILagoonVaultLike(intent.vault).syncDeposit(
                net,
                intent.user,
                address(0)
            );
        } else {
            lagoonOut = ILagoonVaultLike(intent.vault).requestDeposit(
                net,
                intent.user,
                address(this)
            );
        }

        _emitDepositRouted(intent, asset, net, fee, isSync, lagoonOut);
    }

    /*//////////////////////////////////////////////////////////////
                        EVENT HELPER (STACK FIX)
    //////////////////////////////////////////////////////////////*/

    function _emitDepositRouted(
        DepositIntent calldata intent,
        address asset,
        uint256 net,
        uint256 fee,
        bool isSync,
        uint256 lagoonOut
    ) internal {
        emit DepositRouted(
            _hashIntent(intent),
            intent.user,
            intent.vault,
            asset,
            intent.kol,
            intent.grossAssets,
            net,
            fee,
            isSync,
            lagoonOut
        );
    }

    /*//////////////////////////////////////////////////////////////
                        INTENT VALIDATION
    //////////////////////////////////////////////////////////////*/

    function _validateIntent(
        DepositIntent calldata intent,
        bytes calldata sig
    ) internal {
        require(block.timestamp <= intent.deadline, "INTENT_EXPIRED");
        require(intent.user == msg.sender, "USER_MISMATCH");
        require(intent.grossAssets > 0, "ZERO_AMOUNT");
        require(intent.vault != address(0), "BAD_VAULT");

        bytes32 intentHash = _hashIntent(intent);
        require(!usedIntents[intentHash], "INTENT_USED");
        usedIntents[intentHash] = true;

        require(_verifyIntent(intentHash, sig), "BAD_SIG");
    }

    function _hashIntent(
        DepositIntent calldata intent
    ) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                INTENT_TYPEHASH,
                intent.user,
                intent.vault,
                intent.kol,
                intent.grossAssets,
                intent.deadline,
                intent.nonce
            )
        );
    }

    function _verifyIntent(
        bytes32 structHash,
        bytes calldata sig
    ) internal view returns (bool) {
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash)
        );

        (bytes32 r, bytes32 s, uint8 v) = _splitSig(sig);
        address recovered = ecrecover(digest, v, r, s);
        return recovered == intentSigner;
    }

    function _splitSig(
        bytes calldata sig
    ) internal pure returns (bytes32 r, bytes32 s, uint8 v) {
        require(sig.length == 65, "BAD_SIG_LEN");
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
    }

    /*//////////////////////////////////////////////////////////////
                            FEES
    //////////////////////////////////////////////////////////////*/

    function _calculateFees(
        uint256 gross
    ) internal view returns (uint256 fee, uint256 net) {
        fee = (gross * depositFeeBps) / 10_000;
        net = gross - fee;
    }

    function _splitFees(
        address kol,
        address asset,
        uint256 fee
    ) internal {
        uint256 kolCut = (fee * kolShareBps) / 10_000;
        uint256 protocolCut = fee - kolCut;

        if (kolCut > 0) {
            feeBalances[kol][asset] += kolCut;
            emit FeeAccrued(kol, asset, kolCut);
        }

        if (protocolCut > 0) {
            feeBalances[treasury][asset] += protocolCut;
            emit FeeAccrued(treasury, asset, protocolCut);
        }
    }

    /*//////////////////////////////////////////////////////////////
                        FEE CLAIMING
    //////////////////////////////////////////////////////////////*/

    function claimFees(
        address token,
        address to,
        uint256 amount
    ) external {
        uint256 bal = feeBalances[msg.sender][token];
        require(amount <= bal, "INSUFFICIENT");
        feeBalances[msg.sender][token] = bal - amount;
        IERC20(token).safeTransfer(to, amount);
        emit FeeClaimed(msg.sender, token, to, amount);
    }
}
