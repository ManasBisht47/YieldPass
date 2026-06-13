// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title  IReputationRegistry
/// @notice Interface for the on-chain reputation store.
///         Tracks KYC status, credit scores, linked child wallets,
///         and ZK proof commitments for each master wallet.
interface IReputationRegistry {
    // -------------------------------------------------------------------------
    // Structs
    // -------------------------------------------------------------------------

    struct ReputationProfile {
        uint16  creditScore;       // 0–1000
        uint32  scoreUpdatedAt;    // unix timestamp of last score update
        uint32  kycVerifiedAt;     // unix timestamp of KYC verification
        uint32  kycExpiry;         // unix timestamp when KYC expires
        bool    kycVerified;       // current KYC status
        uint8   childWalletCount;  // number of linked child wallets (max 10)
    }

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event KYCVerified(address indexed master, uint32 expiry);
    event KYCRevoked(address indexed master);
    event CreditScoreUpdated(address indexed master, uint16 oldScore, uint16 newScore);
    event ChildWalletLinked(address indexed master, address indexed child, uint8 totalLinked);
    event ZKProofCommitted(address indexed master, bytes32 indexed proofHash, bytes32 proofTypeHash);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error NotKYCVerified(address wallet);
    error KYCAlreadyVerified(address wallet);
    error InvalidScore(uint16 score);
    error InvalidSignature();
    error SignatureExpired();
    error ProofAlreadyUsed(bytes32 proofHash);
    error ProofCategoryAlreadyUsed(bytes32 proofTypeHash);
    error DocumentAlreadyUsed(bytes32 documentNullifier);
    error ChildWalletAlreadyLinked(address child);
    error ChildWalletLimitReached(address master);
    error NonceAlreadyUsed(uint256 nonce);
    error ZeroAddress();

    // -------------------------------------------------------------------------
    // State-changing — KYC
    // -------------------------------------------------------------------------

    /// @notice Records KYC verification for a master wallet.
    ///         Called by backend oracle after QIEPass DID verification.
    /// @param master    The wallet that completed KYC.
    /// @param expiry    Unix timestamp when this KYC attestation expires.
    /// @param signature Oracle's ECDSA signature over (master, expiry, nonce).
    /// @param nonce     One-time nonce to prevent replay.
    function verifyKYC(
        address master,
        uint32  expiry,
        bytes calldata signature,
        uint256 nonce
    ) external;

    /// @notice Revokes KYC status. Only callable by ADMIN_ROLE.
    function revokeKYC(address master) external;

    // -------------------------------------------------------------------------
    // State-changing — Credit Score
    // -------------------------------------------------------------------------

    /// @notice Updates the credit score for a master wallet.
    ///         Only callable by SCORER_ROLE (backend oracle).
    /// @param master    Target wallet.
    /// @param score     New score in range [0, 1000].
    /// @param signature Oracle's ECDSA signature over (master, score, nonce).
    /// @param nonce     One-time nonce to prevent replay.
    function updateCreditScore(
        address master,
        uint16  score,
        bytes calldata signature,
        uint256 nonce
    ) external;

    // -------------------------------------------------------------------------
    // State-changing — Child Wallets
    // -------------------------------------------------------------------------

    /// @notice Links a child wallet to a master wallet to contribute
    ///         on-chain reputation data.
    ///         Both wallets must co-sign a linking message.
    /// @param childWallet      Address of the child wallet being linked.
    /// @param masterSignature  Master's ECDSA sig over (LINK_TYPEHASH, child, nonce).
    /// @param childSignature   Child's  ECDSA sig over (LINK_TYPEHASH, master, nonce).
    /// @param nonce            One-time nonce embedded in both signatures.
    function linkChildWallet(
        address childWallet,
        bytes calldata masterSignature,
        bytes calldata childSignature,
        uint256 nonce
    ) external;

    // -------------------------------------------------------------------------
    // State-changing — ZK Proofs
    // -------------------------------------------------------------------------

    /// @notice Records that a ZK proof has been verified off-chain and
    ///         commits its hash on-chain to prevent resubmission.
    /// @param master             Wallet the proof belongs to.
    /// @param proofHash          Keccak256 hash of the verified proof payload.
    /// @param proofTypeHash      keccak256(abi.encode(proofType, master)) — wallet-specific,
    ///                           so observers cannot determine which bank/service was used.
    /// @param documentNullifier  SHA-256 of the extracted proof data (wallet-agnostic).
    ///                           Prevents the same real-world document from being used
    ///                           across multiple wallet addresses.
    /// @param signature          Oracle's ECDSA sig over
    ///                           (master, proofHash, proofTypeHash, documentNullifier, nonce).
    /// @param nonce              One-time nonce.
    function commitZKProof(
        address master,
        bytes32 proofHash,
        bytes32 proofTypeHash,
        bytes32 documentNullifier,
        bytes   calldata signature,
        uint256 nonce
    ) external;

    /// @notice Returns true if a document nullifier has already been committed.
    function isDocumentNullifierUsed(bytes32 documentNullifier) external view returns (bool);

    // -------------------------------------------------------------------------
    // View
    // -------------------------------------------------------------------------

    /// @notice Returns the full reputation profile for a wallet.
    function getProfile(address master) external view returns (ReputationProfile memory);

    /// @notice Returns true if wallet has valid, non-expired KYC.
    function isKYCVerified(address wallet) external view returns (bool);

    /// @notice Returns the current credit score (0 if no profile).
    function getCreditScore(address wallet) external view returns (uint16);

    /// @notice Returns all child wallets linked to a master.
    function getChildWallets(address master) external view returns (address[] memory);

    /// @notice Returns true if a proof hash has already been committed.
    function isProofUsed(bytes32 proofHash) external view returns (bool);

    /// @notice Returns true if a nonce has already been consumed.
    function isNonceUsed(uint256 nonce) external view returns (bool);
}
