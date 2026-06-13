// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title  IYieldVault
/// @notice Interface for the YieldPass staking vault.
interface IYieldVault {
    // -------------------------------------------------------------------------
    // Structs
    // -------------------------------------------------------------------------

    enum LockTier { FLEXIBLE, SILVER, GOLD, DIAMOND }

    struct StakePosition {
        uint256  principal;          // QIE staked (18 decimals, held as WQIE)
        uint256  pendingYield;       // accumulated but unclaimed yield
        uint256  lastHarvestTime;    // timestamp of last personal harvest
        uint32   lockExpiry;         // 0 = flexible
        LockTier lockTier;
        bool     reputationOptIn;    // opted into boost program
    }

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event Staked(address indexed user, uint256 amount, LockTier tier);
    event Unstaked(address indexed user, uint256 amount, uint256 earlyExitFee);
    event YieldClaimed(address indexed user, uint256 amount);
    event YieldReceived(uint256 amount);                  // from YieldStrategy
    event ReputationOptIn(address indexed user);
    event GlobalAPYUpdated(uint256 newApyBps);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error ZeroAmount();
    error ZeroAddress();
    error PositionLocked(uint32 expiry);
    error NoActivePosition();
    error NothingToClaim();
    error InsufficientBalance(uint256 requested, uint256 available);
    error ReputationNotOptedIn();

    // -------------------------------------------------------------------------
    // State-changing
    // -------------------------------------------------------------------------

    /// @notice Stake native QIE (send as msg.value) and choose a lock tier.
    function stake(LockTier tier) external payable;

    /// @notice Unstake principal. Charges early-exit fee if still locked.
    function unstake(uint256 amount) external;

    /// @notice Claims all pending yield for msg.sender.
    function claimYield() external;

    /// @notice Opts msg.sender into the Reputation Boost program.
    ///         Requires valid KYC in ReputationRegistry.
    function optInToReputation() external;

    /// @notice Called by YieldStrategy to deposit harvested staker yield.
    function receiveYield(uint256 amount) external;

    // -------------------------------------------------------------------------
    // View
    // -------------------------------------------------------------------------

    /// @notice Returns the current position for a user.
    function getPosition(address user) external view returns (StakePosition memory);

    /// @notice Returns the effective APY (in bps) for a user given their
    ///         credit score, lock tier, and stake amount.
    function getEffectiveAPY(address user) external view returns (uint256 apyBps);

    /// @notice Current global base APY in basis points (updated after each harvest).
    function globalBaseApyBps() external view returns (uint256);

    /// @notice Total QIE staked across all users.
    function totalStaked() external view returns (uint256);
}
