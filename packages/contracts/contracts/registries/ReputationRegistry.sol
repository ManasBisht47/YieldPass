// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "../interfaces/registries/IReputationRegistry.sol";
import "../interfaces/registries/INullifierRegistry.sol";

// ReputationRegistry - the on-chain source of truth for who's KYC'd, their
// credit score, linked child wallets, and committed proofs.
//
// The trust model: the backend does the actual off-chain verification (KYC docs,
// bureau scores, bank proofs) and signs an EIP-712 message. The chain only
// checks that signature came from a SCORER_ROLE key - it never sees the raw
// data. Every write also burns a nonce so a signature can't be replayed.
//
// Deploy order matters: NullifierRegistry first, then this with REGISTRAR_ROLE
// on it (child-wallet locks live there).
contract ReputationRegistry is AccessControl, EIP712, IReputationRegistry {
    using ECDSA for bytes32;

    // -------------------------------------------------------------------------
    // Roles
    // -------------------------------------------------------------------------

    bytes32 public constant SCORER_ROLE = keccak256("SCORER_ROLE");
    bytes32 public constant REVOKER_ROLE = keccak256("REVOKER_ROLE");

    // -------------------------------------------------------------------------
    // EIP-712 type hashes
    // -------------------------------------------------------------------------

    bytes32 private constant KYC_TYPEHASH = keccak256(
        "VerifyKYC(address master,uint32 expiry,uint256 nonce)"
    );

    bytes32 private constant SCORE_TYPEHASH = keccak256(
        "UpdateScore(address master,uint16 score,uint256 nonce)"
    );

    bytes32 private constant LINK_TYPEHASH = keccak256(
        "LinkWallet(address master,address child,uint256 nonce)"
    );

    bytes32 private constant PROOF_TYPEHASH = keccak256(
        "CommitProof(address master,bytes32 proofHash,bytes32 proofTypeHash,bytes32 documentNullifier,uint256 nonce)"
    );

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    uint16  public constant MAX_CREDIT_SCORE     = 1000;
    uint8   public constant MAX_CHILD_WALLETS     = 10;
    uint32  public constant KYC_VALIDITY_PERIOD   = 90 days;

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    INullifierRegistry public immutable nullifierRegistry;

    /// @dev master wallet → reputation profile
    mapping(address => ReputationProfile) private _profiles;

    /// @dev master wallet → list of linked child wallets
    mapping(address => address[]) private _childWallets;

    /// @dev proofHash → already committed
    mapping(bytes32 => bool) private _usedProofs;

    /// @dev keccak256(abi.encode(proofType, master)) → already used for this wallet.
    ///      Prevents one wallet submitting the same proof category twice
    ///      without leaking which bank/service was used on-chain.
    mapping(bytes32 => bool) private _usedProofCategories;

    /// @dev SHA-256(proofType + ":" + sortedExtractedParams) → already committed.
    ///      Wallet-agnostic: prevents the same real-world document (same bureau
    ///      score page, same SIM account, etc.) from being used across multiple wallets.
    mapping(bytes32 => bool) private _usedDocumentNullifiers;

    /// @dev nonce → already consumed (global, prevents cross-function replay)
    mapping(uint256 => bool) private _usedNonces;

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(
        address admin,
        address oracle,
        address nullifierRegistry_
    ) EIP712("YieldPass:ReputationRegistry", "1") {
        if (admin == address(0) || oracle == address(0) || nullifierRegistry_ == address(0))
            revert ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(SCORER_ROLE,        oracle);
        _grantRole(REVOKER_ROLE,       admin);

        nullifierRegistry = INullifierRegistry(nullifierRegistry_);
    }

    // -------------------------------------------------------------------------
    // External - KYC
    // -------------------------------------------------------------------------

    /// @inheritdoc IReputationRegistry
    function verifyKYC(
        address master,
        uint32  expiry,
        bytes calldata signature,
        uint256 nonce
    ) external {
        if (master == address(0)) revert ZeroAddress();
        if (_usedNonces[nonce])   revert NonceAlreadyUsed(nonce);
        if (block.timestamp >= expiry) revert SignatureExpired();

        _verifyOracleSignature(
            keccak256(abi.encode(KYC_TYPEHASH, master, expiry, nonce)),
            signature
        );

        _usedNonces[nonce] = true;

        ReputationProfile storage profile = _profiles[master];
        profile.kycVerified   = true;
        profile.kycVerifiedAt = uint32(block.timestamp);
        profile.kycExpiry     = expiry;

        emit KYCVerified(master, expiry);
    }

    /// @inheritdoc IReputationRegistry
    function revokeKYC(address master) external onlyRole(REVOKER_ROLE) {
        _profiles[master].kycVerified = false;
        emit KYCRevoked(master);
    }

    // -------------------------------------------------------------------------
    // External - Credit Score
    // -------------------------------------------------------------------------

    /// @inheritdoc IReputationRegistry
    function updateCreditScore(
        address master,
        uint16  score,
        bytes calldata signature,
        uint256 nonce
    ) external {
        if (master == address(0)) revert ZeroAddress();
        if (score > MAX_CREDIT_SCORE) revert InvalidScore(score);
        if (_usedNonces[nonce])       revert NonceAlreadyUsed(nonce);

        _verifyOracleSignature(
            keccak256(abi.encode(SCORE_TYPEHASH, master, score, nonce)),
            signature
        );

        _usedNonces[nonce] = true;

        uint16 oldScore = _profiles[master].creditScore;
        _profiles[master].creditScore     = score;
        _profiles[master].scoreUpdatedAt  = uint32(block.timestamp);

        emit CreditScoreUpdated(master, oldScore, score);
    }

    // -------------------------------------------------------------------------
    // External - Child Wallets
    // -------------------------------------------------------------------------

    /// @inheritdoc IReputationRegistry
    /// @dev msg.sender is the master wallet. Both master and child must sign
    ///      the same LINK_TYPEHASH message to prove mutual ownership.
    function linkChildWallet(
        address childWallet,
        bytes calldata masterSignature,
        bytes calldata childSignature,
        uint256 nonce
    ) external {
        address master = msg.sender;

        if (childWallet == address(0))      revert ZeroAddress();
        if (childWallet == master)          revert INullifierRegistry.CannotLinkToSelf();
        if (_usedNonces[nonce])             revert NonceAlreadyUsed(nonce);
        if (nullifierRegistry.isLocked(childWallet))
            revert ChildWalletAlreadyLinked(childWallet);
        if (_profiles[master].childWalletCount >= MAX_CHILD_WALLETS)
            revert ChildWalletLimitReached(master);

        bytes32 structHash = keccak256(
            abi.encode(LINK_TYPEHASH, master, childWallet, nonce)
        );
        bytes32 digest = _hashTypedDataV4(structHash);

        // both sides have to sign the same digest, otherwise anyone could claim
        // someone else's wallet as their "child"
        if (digest.recover(masterSignature) != master)      revert InvalidSignature();
        if (digest.recover(childSignature)  != childWallet) revert InvalidSignature();

        _usedNonces[nonce] = true;

        // one-way lock: a child can never be re-linked to a different master
        nullifierRegistry.registerNullifier(childWallet, master);

        _childWallets[master].push(childWallet);
        _profiles[master].childWalletCount++;

        emit ChildWalletLinked(
            master,
            childWallet,
            _profiles[master].childWalletCount
        );
    }

    // -------------------------------------------------------------------------
    // External - ZK Proofs
    // -------------------------------------------------------------------------

    /// @inheritdoc IReputationRegistry
    function commitZKProof(
        address master,
        bytes32 proofHash,
        bytes32 proofTypeHash,
        bytes32 documentNullifier,
        bytes   calldata signature,
        uint256 nonce
    ) external {
        if (master == address(0))                          revert ZeroAddress();
        if (_usedProofs[proofHash])                        revert ProofAlreadyUsed(proofHash);
        if (_usedProofCategories[proofTypeHash])            revert ProofCategoryAlreadyUsed(proofTypeHash);
        if (_usedDocumentNullifiers[documentNullifier])    revert DocumentAlreadyUsed(documentNullifier);
        if (_usedNonces[nonce])                            revert NonceAlreadyUsed(nonce);

        _verifyOracleSignature(
            keccak256(abi.encode(
                PROOF_TYPEHASH,
                master,
                proofHash,
                proofTypeHash,
                documentNullifier,
                nonce
            )),
            signature
        );

        _usedNonces[nonce]                             = true;
        _usedProofs[proofHash]                         = true;
        _usedProofCategories[proofTypeHash]            = true;
        _usedDocumentNullifiers[documentNullifier]     = true;

        emit ZKProofCommitted(master, proofHash, proofTypeHash);
    }

    // -------------------------------------------------------------------------
    // External - View
    // -------------------------------------------------------------------------

    /// @inheritdoc IReputationRegistry
    function getProfile(address master)
        external
        view
        returns (ReputationProfile memory)
    {
        return _profiles[master];
    }

    /// @inheritdoc IReputationRegistry
    function isKYCVerified(address wallet) external view returns (bool) {
        ReputationProfile storage p = _profiles[wallet];
        return p.kycVerified && block.timestamp < p.kycExpiry;
    }

    /// @inheritdoc IReputationRegistry
    function getCreditScore(address wallet) external view returns (uint16) {
        return _profiles[wallet].creditScore;
    }

    /// @inheritdoc IReputationRegistry
    function getChildWallets(address master)
        external
        view
        returns (address[] memory)
    {
        return _childWallets[master];
    }

    /// @inheritdoc IReputationRegistry
    function isProofUsed(bytes32 proofHash) external view returns (bool) {
        return _usedProofs[proofHash];
    }

    /// @inheritdoc IReputationRegistry
    function isDocumentNullifierUsed(bytes32 documentNullifier) external view returns (bool) {
        return _usedDocumentNullifiers[documentNullifier];
    }

    /// @inheritdoc IReputationRegistry
    function isNonceUsed(uint256 nonce) external view returns (bool) {
        return _usedNonces[nonce];
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    /// @dev Verifies that `signature` was signed by an account with SCORER_ROLE.
    function _verifyOracleSignature(
        bytes32 structHash,
        bytes calldata signature
    ) internal view {
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = digest.recover(signature);
        if (!hasRole(SCORER_ROLE, signer)) revert InvalidSignature();
    }
}
