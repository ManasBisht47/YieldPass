// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../interfaces/core/IYieldVault.sol";
import "../interfaces/core/IYieldStrategy.sol";
import "../interfaces/core/IWQIE.sol";
import "../interfaces/registries/IReputationRegistry.sol";
import "../libraries/ScoreMultiplier.sol";

// YieldVault - native QIE staking entry point.
//
// Yield distribution uses the MasterChef accumulator (accYieldPerShare), NOT an
// apy-rate over a shared pool. The shared-pool version bit us: a whale could
// stake right before a harvest and skim yield the earlier stakers had earned.
// With the accumulator you only ever get yield that flowed in after you joined.
//
// Your weight isn't raw principal, it's "effective shares":
//   principal -> score multiplier (1.0-1.5x) on the capped slice -> lock bonus.
// No opt-in / score <=200 / flexible lock => shares == principal => plain base rate.
//
// stake() is a single payable tx (wraps QIE->WQIE, hands to strategy for QIEDex
// LP). unstake/claim unwrap back to native QIE. Early unstake pays a fee in WQIE
// to the insurance fund.
contract YieldVault is AccessControl, ReentrancyGuard, IYieldVault {
    using SafeERC20 for IERC20;
    using ScoreMultiplier for uint16;

    // -------------------------------------------------------------------------
    // Roles
    // -------------------------------------------------------------------------

    bytes32 public constant STRATEGY_ROLE      = keccak256("STRATEGY_ROLE");
    bytes32 public constant KEEPER_ROLE        = keccak256("KEEPER_ROLE");
    bytes32 public constant LENDING_POOL_ROLE  = keccak256("LENDING_POOL_ROLE");

    uint256 private constant ACC_PRECISION = 1e18;
    uint256 private constant BPS           = 10_000;

    // -------------------------------------------------------------------------
    // Anti-whale caps (QIE, 18 decimals) - admin-settable for mainnet calibration
    // -------------------------------------------------------------------------

    uint256 public standardBoostedCap = 50_000e18;
    uint256 public whaleBoostedCap    = 75_000e18;
    uint256 public whaleThreshold     = 5_000_000e18;

    event BoostedCapsUpdated(uint256 standardCap, uint256 whaleCap, uint256 threshold);

    // -------------------------------------------------------------------------
    // Lock tiers
    // -------------------------------------------------------------------------

    uint32  public constant SILVER_LOCK_DURATION  = 30 days;
    uint32  public constant GOLD_LOCK_DURATION    = 90 days;
    uint32  public constant DIAMOND_LOCK_DURATION = 180 days;

    // Lock share bonus (bps added to a 1.0× = 10000 multiplier on effective shares)
    uint256 public constant SILVER_SHARE_BONUS  = 500;   // +5 %
    uint256 public constant GOLD_SHARE_BONUS    = 1_000;  // +10 %
    uint256 public constant DIAMOND_SHARE_BONUS = 1_500;  // +15 %

    // Early-exit penalty (bps on the recovered amount)
    uint256 public constant SILVER_PENALTY_BPS  = 100;  // 1 %
    uint256 public constant GOLD_PENALTY_BPS    = 200;  // 2 %
    uint256 public constant DIAMOND_PENALTY_BPS = 300;  // 3 %

    // -------------------------------------------------------------------------
    // Immutables
    // -------------------------------------------------------------------------

    IWQIE               public immutable wqie;
    IYieldStrategy      public immutable strategy;
    IReputationRegistry public immutable reputationRegistry;
    address             public immutable insuranceFund;

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    mapping(address => StakePosition) private _positions;
    mapping(address => uint256)       public effectiveShares;  // weighted shares
    mapping(address => uint256)       public rewardDebt;       // accounting baseline

    uint256 public accYieldPerShare;     // scaled by ACC_PRECISION
    uint256 public totalEffectiveShares;
    uint256 public undistributed;        // yield received while no shares existed

    uint256 public globalBaseApyBps;     // display only, not used in any math
    uint256 public totalStaked;
    uint256 public totalYieldPool;       // WQIE held against unclaimed yield

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(
        address admin_,
        address keeper_,
        address wqie_,
        address strategy_,
        address reputationRegistry_,
        address insuranceFund_
    ) {
        if (
            admin_ == address(0)              || keeper_ == address(0)   ||
            wqie_ == address(0)               || strategy_ == address(0) ||
            reputationRegistry_ == address(0) || insuranceFund_ == address(0)
        ) revert ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(KEEPER_ROLE,        keeper_);
        _grantRole(STRATEGY_ROLE,      strategy_);

        wqie               = IWQIE(wqie_);
        strategy           = IYieldStrategy(strategy_);
        reputationRegistry = IReputationRegistry(reputationRegistry_);
        insuranceFund      = insuranceFund_;
    }

    /// @dev Accept native QIE only from WQIE unwrapping.
    receive() external payable {
        require(msg.sender == address(wqie), "YieldVault: direct QIE not accepted");
    }

    // -------------------------------------------------------------------------
    // External - user actions
    // -------------------------------------------------------------------------

    /// @notice Stake native QIE (send as msg.value). Single tx, no approval.
    function stake(LockTier tier) external payable nonReentrant {
        uint256 amount = msg.value;
        if (amount == 0) revert ZeroAmount();

        _settle(msg.sender);            // settle at old shares before we touch them

        StakePosition storage pos = _positions[msg.sender];
        pos.principal      += amount;
        pos.lockTier        = tier;
        pos.lockExpiry      = _lockExpiry(tier);
        pos.lastHarvestTime = uint32(block.timestamp);
        totalStaked        += amount;

        _updateShares(msg.sender);

        wqie.deposit{value: amount}();
        IERC20(address(wqie)).safeIncreaseAllowance(address(strategy), amount);
        strategy.deployFunds(amount);

        emit Staked(msg.sender, amount, tier);
    }

    /// @notice Unstake principal. Charges early-exit fee if still locked.
    function unstake(uint256 amount) external nonReentrant {
        StakePosition storage pos = _positions[msg.sender];

        if (pos.principal == 0)     revert NoActivePosition();
        if (amount == 0)            revert ZeroAmount();
        if (amount > pos.principal) revert InsufficientBalance(amount, pos.principal);

        _settle(msg.sender);

        // grab the penalty rate before the lock reset below zeroes the tier,
        // otherwise an early exit of the whole position pays no fee
        bool isLocked = pos.lockExpiry > 0 && block.timestamp < pos.lockExpiry;
        uint256 penaltyRate = isLocked ? _penaltyBps(pos.lockTier) : 0;

        pos.principal -= amount;
        totalStaked   -= amount;
        if (pos.principal == 0) {
            pos.lockExpiry = 0;
            pos.lockTier   = LockTier.FLEXIBLE;
        }

        _updateShares(msg.sender);

        // measure what actually lands instead of assuming `amount` - touching the
        // LP costs a DEX round-trip fee, so the user gets the real recovered value
        uint256 beforeBal = IERC20(address(wqie)).balanceOf(address(this));
        strategy.withdrawFunds(amount, address(this));
        uint256 received  = IERC20(address(wqie)).balanceOf(address(this)) - beforeBal;

        uint256 penaltyFee = (received * penaltyRate) / BPS;
        if (penaltyFee > 0) {
            IERC20(address(wqie)).safeTransfer(insuranceFund, penaltyFee);
        }

        uint256 payout = received - penaltyFee;
        wqie.withdraw(payout);
        _sendQIE(msg.sender, payout);

        emit Unstaked(msg.sender, amount, penaltyFee);
    }

    /// @notice Claim all accrued yield, paid in native QIE.
    function claimYield() external nonReentrant {
        _settle(msg.sender);

        StakePosition storage pos = _positions[msg.sender];
        uint256 claimable = pos.pendingYield;
        if (claimable == 0) revert NothingToClaim();

        pos.pendingYield = 0;
        // shares didn't change, just re-baseline the debt
        rewardDebt[msg.sender] = (effectiveShares[msg.sender] * accYieldPerShare) / ACC_PRECISION;

        if (claimable > totalYieldPool) claimable = totalYieldPool; // never overpay the pool
        totalYieldPool -= claimable;

        wqie.withdraw(claimable);
        _sendQIE(msg.sender, claimable);

        emit YieldClaimed(msg.sender, claimable);
    }

    /// @notice Opt into the reputation boost. Requires valid KYC.
    function optInToReputation() external {
        if (!reputationRegistry.isKYCVerified(msg.sender))
            revert ReputationNotOptedIn();

        _settle(msg.sender);
        _positions[msg.sender].reputationOptIn = true;
        _updateShares(msg.sender);
        emit ReputationOptIn(msg.sender);
    }

    /// @notice Refresh effective shares after an off-chain score change.
    function refreshBoost() external {
        _settle(msg.sender);
        _updateShares(msg.sender);
    }

    /// @notice Calibrate anti-whale caps (admin only).
    function setBoostedCaps(uint256 standardCap_, uint256 whaleCap_, uint256 threshold_)
        external onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(standardCap_ > 0 && whaleCap_ >= standardCap_ && threshold_ > whaleCap_,
                "YieldVault: invalid caps");
        standardBoostedCap = standardCap_;
        whaleBoostedCap    = whaleCap_;
        whaleThreshold     = threshold_;
        emit BoostedCapsUpdated(standardCap_, whaleCap_, threshold_);
    }

    /// @notice Receive harvested yield and distribute it across current shares.
    function receiveYield(uint256 amount) external {
        require(
            hasRole(STRATEGY_ROLE, msg.sender) || hasRole(LENDING_POOL_ROLE, msg.sender),
            "YieldVault: caller lacks STRATEGY_ROLE or LENDING_POOL_ROLE"
        );
        if (amount == 0) return;

        IERC20(address(wqie)).safeTransferFrom(msg.sender, address(this), amount);
        totalYieldPool += amount;

        // bumping the accumulator only credits whoever holds shares right now
        uint256 distributable = amount + undistributed;
        if (totalEffectiveShares > 0) {
            accYieldPerShare += (distributable * ACC_PRECISION) / totalEffectiveShares;
            undistributed = 0;
        } else {
            undistributed = distributable;   // nobody staked yet, park it
        }

        if (totalStaked > 0) {
            // rough annualised number for the UI; assumes one harvest/day
            globalBaseApyBps = (amount * 365 * BPS) / totalStaked;
        }

        emit GlobalAPYUpdated(globalBaseApyBps);
        emit YieldReceived(amount);
    }

    // -------------------------------------------------------------------------
    // External - view
    // -------------------------------------------------------------------------

    function getPosition(address user) external view returns (StakePosition memory) {
        return _positions[user];
    }

    /// @notice What the user could claim right now = banked pending + whatever the
    ///         accumulator has accrued since their last settle. The frontend reads
    ///         this because pendingYield alone goes stale between settles.
    function pendingYieldOf(address user) external view returns (uint256) {
        uint256 shares = effectiveShares[user];
        uint256 unsettled = shares > 0
            ? (shares * accYieldPerShare) / ACC_PRECISION - rewardDebt[user]
            : 0;
        return _positions[user].pendingYield + unsettled;
    }

    /// @notice Display-only effective APY: base rate scaled by the user's share
    ///         weighting (shares/principal). Plain staker gets the base back.
    function getEffectiveAPY(address user) external view returns (uint256 apyBps) {
        StakePosition storage pos = _positions[user];
        if (pos.principal == 0) return globalBaseApyBps;
        uint256 shares = _computeShares(user);
        return (globalBaseApyBps * shares) / pos.principal;
    }

    // -------------------------------------------------------------------------
    // Internal - accumulator
    // -------------------------------------------------------------------------

    /// @dev Move accrued-but-unbanked yield into pendingYield. Call this before
    ///      anything that changes a user's shares or the accumulator misreports them.
    function _settle(address user) internal {
        uint256 shares = effectiveShares[user];
        if (shares > 0) {
            uint256 accumulated = (shares * accYieldPerShare) / ACC_PRECISION;
            uint256 pending = accumulated - rewardDebt[user];
            if (pending > 0) _positions[user].pendingYield += pending;
        }
    }

    /// @dev Recompute effective shares and re-baseline rewardDebt. Only safe to
    ///      call straight after _settle, otherwise you drop unbanked yield.
    function _updateShares(address user) internal {
        uint256 newShares = _computeShares(user);
        totalEffectiveShares = totalEffectiveShares - effectiveShares[user] + newShares;
        effectiveShares[user] = newShares;
        rewardDebt[user] = (newShares * accYieldPerShare) / ACC_PRECISION;
    }

    function _computeShares(address user) internal view returns (uint256) {
        StakePosition storage p = _positions[user];
        uint256 principal = p.principal;
        if (principal == 0) return 0;

        uint256 cap     = _boostedCap(principal);
        uint256 boosted = principal < cap ? principal : cap;
        uint256 normal  = principal - boosted;

        uint256 scoreMult = BPS; // 1.0x unless they've opted in AND passed KYC
        if (p.reputationOptIn && reputationRegistry.isKYCVerified(user)) {
            scoreMult = ScoreMultiplier.getMultiplierBps(reputationRegistry.getCreditScore(user));
        }

        // boost only the capped slice (anti-whale); the overflow stays at 1.0x.
        // lock bonus then applies to the whole weighted amount.
        uint256 weighted = (boosted * scoreMult) / BPS + normal;
        uint256 lockMult = BPS + _lockShareBonus(p.lockTier);
        return (weighted * lockMult) / BPS;
    }

    // -------------------------------------------------------------------------
    // Internal - helpers
    // -------------------------------------------------------------------------

    function _boostedCap(uint256 staked) internal view returns (uint256) {
        return staked >= whaleThreshold ? whaleBoostedCap : standardBoostedCap;
    }

    function _lockShareBonus(LockTier tier) internal pure returns (uint256) {
        if (tier == LockTier.SILVER)  return SILVER_SHARE_BONUS;
        if (tier == LockTier.GOLD)    return GOLD_SHARE_BONUS;
        if (tier == LockTier.DIAMOND) return DIAMOND_SHARE_BONUS;
        return 0;
    }

    function _penaltyBps(LockTier tier) internal pure returns (uint256) {
        if (tier == LockTier.SILVER)  return SILVER_PENALTY_BPS;
        if (tier == LockTier.GOLD)    return GOLD_PENALTY_BPS;
        if (tier == LockTier.DIAMOND) return DIAMOND_PENALTY_BPS;
        return 0;
    }

    function _lockExpiry(LockTier tier) internal view returns (uint32) {
        if (tier == LockTier.SILVER)  return uint32(block.timestamp + SILVER_LOCK_DURATION);
        if (tier == LockTier.GOLD)    return uint32(block.timestamp + GOLD_LOCK_DURATION);
        if (tier == LockTier.DIAMOND) return uint32(block.timestamp + DIAMOND_LOCK_DURATION);
        return 0;
    }

    function _sendQIE(address to, uint256 amount) internal {
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "YieldVault: QIE transfer failed");
    }
}
