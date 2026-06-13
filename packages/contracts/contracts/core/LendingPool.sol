// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "../interfaces/registries/IReputationRegistry.sol";
import "./PriceOracle.sol";
import "./InterestRateModel.sol";

// LendingPool - two-sided QUSDC market.
//
// Supply side: drop in QUSDC, earn a cut of borrower interest (MasterChef
// accInterestPerShare, same trick as the vault). Borrow side: put up WETH, draw
// QUSDC. Reputation score moves your LTV (60->75%) and shaves your borrow rate
// (up to -12%); 800+ also gets a 2h grace window before liquidation instead of
// an instant wipe.
//
// Rate comes from InterestRateModel (jump rate). Interest splits 20% treasury /
// 80% suppliers. Util is capped at 90% so suppliers can always pull out.
//
// Couple of guards worth flagging: flash-loan borrowers can't borrow twice in
// one block, and borrow/liquidate refuse to run on a stale oracle price (see
// MAX_PRICE_AGE) so a dead price keeper can't get loans mispriced.
contract LendingPool is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // -------------------------------------------------------------------------
    // Roles
    // -------------------------------------------------------------------------

    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    uint256 public constant PROTOCOL_FEE_BPS      = 2_000;  // 20 % of interest → treasury
    uint256 public constant LIQ_BONUS_BPS          =   500;  // 5 % bonus to liquidator
    uint256 public constant LIQ_BUFFER_BPS         =   800;  // +8 % above max LTV triggers liq.
    uint256 public constant MAX_UTIL_BPS           = 9_000;  // 90 % utilisation cap
    uint256 public constant GRACE_PERIOD           = 2 hours;
    // Borrow/liquidate refuse to act on a price older than this - protects
    // against a dead oracle keeper leaving loans mispriced.
    uint256 public constant MAX_PRICE_AGE          = 3 hours;
    uint256 public constant GRACE_SCORE_THRESHOLD  =   800;
    uint256 public constant SECONDS_PER_YEAR       = 365 days;
    uint256 public constant ACC_PRECISION          = 1e12;   // MasterChef accumulator precision

    // Reputation → borrow-rate discount (applied as % reduction of the rate)
    uint256 private constant DISC_NONE     = 0;
    uint256 private constant DISC_BRONZE   =  300;  // -3 %
    uint256 private constant DISC_SILVER   =  600;  // -6 %
    uint256 private constant DISC_GOLD     =  900;  // -9 %
    uint256 private constant DISC_PLATINUM = 1_200; // -12 %

    // -------------------------------------------------------------------------
    // Immutables
    // -------------------------------------------------------------------------

    IERC20              public immutable weth;
    IERC20              public immutable qusdc;
    IReputationRegistry public immutable reputationRegistry;
    PriceOracle         public immutable oracle;
    InterestRateModel   public immutable irm;
    address             public immutable treasury;

    // -------------------------------------------------------------------------
    // Supply-side state (MasterChef pattern)
    // -------------------------------------------------------------------------

    uint256 public totalSupplied;          // total QUSDC deposited (available + lent out)
    uint256 public accInterestPerShare;    // accumulated interest per supplied unit (×ACC_PRECISION)
    uint256 public protocolFeeAccrued;     // treasury balance (separates from supplier liquidity)

    struct SupplyPosition {
        uint256 amount;
        uint256 rewardDebt;    // accInterestPerShare × amount / ACC_PRECISION at last settle
        uint256 pendingYield;  // settled but unclaimed yield
    }
    mapping(address => SupplyPosition) public suppliers;

    // -------------------------------------------------------------------------
    // Borrow-side state
    // -------------------------------------------------------------------------

    uint256 public totalBorrowed;

    struct BorrowerPosition {
        uint256 collateral;     // WETH (18 dec)
        uint256 principal;      // QUSDC borrowed (6 dec)
        uint256 interestOwed;   // QUSDC interest accrued (6 dec)
        uint256 lastAccrual;    // timestamp of last accrual
        uint256 borrowBlock;    // block number when position was opened (flash-loan guard)
    }
    mapping(address => BorrowerPosition) public borrowers;

    // Grace period tracking (score 800+ only)
    mapping(address => uint256) public graceExpiry;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event Supplied(address indexed user, uint256 amount);
    event Redeemed(address indexed user, uint256 amount);
    event SupplierYieldClaimed(address indexed user, uint256 amount);
    event Borrowed(address indexed user, uint256 collateral, uint256 amount, uint256 ltvBps, uint256 borrowRateBps);
    event Repaid(address indexed user, uint256 principal, uint256 interest, uint256 supplierYield, uint256 protocolFee);
    event CollateralAdded(address indexed user, uint256 amount);
    event CollateralWithdrawn(address indexed user, uint256 amount);
    event LiquidationGraceStarted(address indexed borrower, uint256 deadline);
    event Liquidated(address indexed borrower, address indexed liquidator, uint256 debtRepaid, uint256 collateralSeized);
    event ProtocolFeeWithdrawn(uint256 amount);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error ZeroAmount();
    error ZeroAddress();
    error ExceedsMaxLtv();
    error StalePrice(uint256 ageSeconds);
    error NotLiquidatable();
    error InsufficientPoolLiquidity();
    error UtilizationTooHigh();
    error NoActivePosition();
    error NoActiveSupply();
    error CollateralLocked();
    error InsufficientCollateral();
    error FlashLoanBlocked();
    error GracePeriodActive(uint256 deadline);
    error NothingToClaim();
    error InsufficientSupplyBalance();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(
        address admin_,
        address keeper_,
        address weth_,
        address qusdc_,
        address reputationRegistry_,
        address oracle_,
        address irm_,
        address treasury_
    ) {
        if (
            admin_ == address(0) || keeper_ == address(0) ||
            weth_ == address(0) || qusdc_ == address(0) ||
            reputationRegistry_ == address(0) || oracle_ == address(0) ||
            irm_ == address(0) || treasury_ == address(0)
        ) revert ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(KEEPER_ROLE,        keeper_);

        weth               = IERC20(weth_);
        qusdc              = IERC20(qusdc_);
        reputationRegistry = IReputationRegistry(reputationRegistry_);
        oracle             = PriceOracle(oracle_);
        irm                = InterestRateModel(irm_);
        treasury           = treasury_;
    }

    // =========================================================================
    // SUPPLY SIDE
    // =========================================================================

    /// @notice Deposit QUSDC into the lending pool to earn interest from borrowers.
    function supply(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();

        SupplyPosition storage pos = suppliers[msg.sender];

        // bank what they've earned before their balance (and thus their share) moves
        _settleSupplierYield(pos);

        qusdc.safeTransferFrom(msg.sender, address(this), amount);
        pos.amount    += amount;
        totalSupplied += amount;

        pos.rewardDebt = (pos.amount * accInterestPerShare) / ACC_PRECISION;

        emit Supplied(msg.sender, amount);
    }

    /// @notice Withdraw previously supplied QUSDC.
    function redeem(uint256 amount) external nonReentrant whenNotPaused {
        SupplyPosition storage pos = suppliers[msg.sender];
        if (pos.amount < amount) revert InsufficientSupplyBalance();
        if (amount == 0) revert ZeroAmount();

        _settleSupplierYield(pos);

        // block a redeem that would shove utilisation past the cap and strand
        // the remaining suppliers behind borrowed-out liquidity
        uint256 newSupply = totalSupplied - amount;
        if (newSupply > 0) {
            if ((totalBorrowed * 10_000) / newSupply > MAX_UTIL_BPS) revert UtilizationTooHigh();
        } else if (totalBorrowed > 0) {
            revert UtilizationTooHigh();
        }

        pos.amount    -= amount;
        totalSupplied -= amount;
        pos.rewardDebt = (pos.amount * accInterestPerShare) / ACC_PRECISION;

        // protocol fees sit in the same token balance but aren't suppliers' to take
        uint256 liquidBalance = qusdc.balanceOf(address(this)) - protocolFeeAccrued;
        if (liquidBalance < amount) revert InsufficientPoolLiquidity();

        qusdc.safeTransfer(msg.sender, amount);
        emit Redeemed(msg.sender, amount);
    }

    /// @notice Claim accumulated yield earned from borrower interest.
    function claimSupplierYield() external nonReentrant {
        SupplyPosition storage pos = suppliers[msg.sender];

        _settleSupplierYield(pos);
        pos.rewardDebt = (pos.amount * accInterestPerShare) / ACC_PRECISION;

        uint256 claimable = pos.pendingYield;
        if (claimable == 0) revert NothingToClaim();

        pos.pendingYield = 0;
        qusdc.safeTransfer(msg.sender, claimable);
        emit SupplierYieldClaimed(msg.sender, claimable);
    }

    // =========================================================================
    // BORROW SIDE
    // =========================================================================

    /// @notice Deposit WETH collateral and borrow QUSDC in one call.
    function borrow(uint256 collateralAmount, uint256 borrowAmount)
        external
        nonReentrant
        whenNotPaused
    {
        if (collateralAmount == 0 || borrowAmount == 0) revert ZeroAmount();

        BorrowerPosition storage pos = borrowers[msg.sender];

        // no borrow-then-borrow in the same block (flash-loan attempts)
        if (pos.borrowBlock == block.number && pos.principal > 0) revert FlashLoanBlocked();

        // settle existing debt at the old principal before adding to it
        _accrueUserInterest(msg.sender);

        weth.safeTransferFrom(msg.sender, address(this), collateralAmount);
        pos.collateral  += collateralAmount;
        pos.principal   += borrowAmount;
        totalBorrowed   += borrowAmount;
        pos.borrowBlock  = block.number;
        if (pos.lastAccrual == 0) pos.lastAccrual = block.timestamp;

        _requireFreshPrice();

        uint256 maxLtv      = _maxLtvBps(msg.sender);
        uint256 currentLtv  = _currentLtvBps(msg.sender);
        if (currentLtv > maxLtv) revert ExceedsMaxLtv();

        if (totalSupplied > 0) {
            if ((totalBorrowed * 10_000) / totalSupplied > MAX_UTIL_BPS) revert UtilizationTooHigh();
        }

        // don't lend out the treasury's accrued fees
        uint256 available = qusdc.balanceOf(address(this)) - protocolFeeAccrued;
        if (available < borrowAmount) revert InsufficientPoolLiquidity();

        uint256 rateBps = _personalBorrowRateBps(msg.sender);
        qusdc.safeTransfer(msg.sender, borrowAmount);

        emit Borrowed(msg.sender, collateralAmount, borrowAmount, currentLtv, rateBps);
    }

    /// @notice Repay outstanding QUSDC debt (principal + interest).
    ///         Pass `type(uint256).max` to repay the full balance.
    function repay(uint256 amount) external nonReentrant {
        BorrowerPosition storage pos = borrowers[msg.sender];
        if (pos.principal == 0) revert NoActivePosition();

        _accrueUserInterest(msg.sender);

        uint256 totalOwed = pos.principal + pos.interestOwed;
        if (amount > totalOwed) amount = totalOwed;

        // interest comes off first, principal only once interest is cleared
        uint256 interestPaid;
        uint256 principalPaid;

        if (amount <= pos.interestOwed) {
            interestPaid         = amount;
            pos.interestOwed    -= amount;
        } else {
            interestPaid         = pos.interestOwed;
            principalPaid        = amount - pos.interestOwed;
            pos.interestOwed     = 0;
            pos.principal       -= principalPaid;
            totalBorrowed       -= principalPaid;
        }

        // 20% to treasury, the rest spread across suppliers via the accumulator
        uint256 fee          = (interestPaid * PROTOCOL_FEE_BPS) / 10_000;
        uint256 supplierShare = interestPaid - fee;
        protocolFeeAccrued  += fee;

        if (totalSupplied > 0 && supplierShare > 0) {
            accInterestPerShare += (supplierShare * ACC_PRECISION) / totalSupplied;
        }

        if (pos.principal == 0 && pos.interestOwed == 0) {
            delete graceExpiry[msg.sender];
        }

        qusdc.safeTransferFrom(msg.sender, address(this), amount);
        emit Repaid(msg.sender, principalPaid, interestPaid, supplierShare, fee);
    }

    /// @notice Add more WETH collateral to an existing (or new) position.
    function addCollateral(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        weth.safeTransferFrom(msg.sender, address(this), amount);
        borrowers[msg.sender].collateral += amount;
        emit CollateralAdded(msg.sender, amount);
    }

    /// @notice Withdraw collateral that is not locked by outstanding debt.
    function withdrawCollateral(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        BorrowerPosition storage pos = borrowers[msg.sender];
        if (pos.collateral < amount) revert InsufficientCollateral();

        _accrueUserInterest(msg.sender);

        pos.collateral -= amount;

        // re-check LTV after the reduction; can't pull collateral that's backing debt
        if (pos.principal > 0) {
            if (_currentLtvBps(msg.sender) > _maxLtvBps(msg.sender)) revert CollateralLocked();
        }

        weth.safeTransfer(msg.sender, amount);
        emit CollateralWithdrawn(msg.sender, amount);
    }

    // =========================================================================
    // LIQUIDATION
    // =========================================================================

    /// @notice Liquidate an underwater position: caller repays the debt, walks away
    ///         with the collateral + a 5% bonus. 800+ borrowers get one 2h grace
    ///         window first (the call reverts and arms the timer).
    function liquidate(address borrower) external nonReentrant {
        _requireFreshPrice();
        BorrowerPosition storage pos = borrowers[borrower];
        if (pos.principal == 0) revert NoActivePosition();

        _accrueUserInterest(borrower);

        uint256 liqThreshold = _maxLtvBps(borrower) + LIQ_BUFFER_BPS;
        if (_currentLtvBps(borrower) <= liqThreshold) revert NotLiquidatable();

        // high-rep borrowers get warned once: first call arms the timer and
        // reverts, only a later call (after it expires) actually liquidates
        uint16 score = reputationRegistry.getCreditScore(borrower);
        if (score >= GRACE_SCORE_THRESHOLD) {
            if (graceExpiry[borrower] == 0) {
                graceExpiry[borrower] = block.timestamp + GRACE_PERIOD;
                emit LiquidationGraceStarted(borrower, graceExpiry[borrower]);
                revert GracePeriodActive(graceExpiry[borrower]);
            }
            if (block.timestamp < graceExpiry[borrower]) {
                revert GracePeriodActive(graceExpiry[borrower]);
            }
        }

        uint256 totalOwed    = pos.principal + pos.interestOwed;
        uint256 debtInWeth   = _qusdcToWeth(totalOwed);
        uint256 seize        = debtInWeth + (debtInWeth * LIQ_BONUS_BPS) / 10_000;
        if (seize > pos.collateral) seize = pos.collateral; // can't seize more than posted

        // same interest split as repay()
        uint256 fee          = (pos.interestOwed * PROTOCOL_FEE_BPS) / 10_000;
        uint256 supplierShare = pos.interestOwed - fee;
        protocolFeeAccrued  += fee;
        if (totalSupplied > 0 && supplierShare > 0) {
            accInterestPerShare += (supplierShare * ACC_PRECISION) / totalSupplied;
        }

        totalBorrowed      -= pos.principal;
        uint256 colLeft     = pos.collateral - seize;
        delete borrowers[borrower];
        delete graceExpiry[borrower];

        qusdc.safeTransferFrom(msg.sender, address(this), totalOwed);
        weth.safeTransfer(msg.sender, seize);
        if (colLeft > 0) weth.safeTransfer(borrower, colLeft);

        emit Liquidated(borrower, msg.sender, totalOwed, seize);
    }

    // =========================================================================
    // ADMIN
    // =========================================================================

    /// @notice Transfer accrued protocol fees to treasury.
    function withdrawProtocolFee() external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 fee = protocolFeeAccrued;
        if (fee == 0) return;
        protocolFeeAccrued = 0;
        qusdc.safeTransfer(treasury, fee);
        emit ProtocolFeeWithdrawn(fee);
    }

    function pause()   external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    // =========================================================================
    // VIEW
    // =========================================================================

    /// @return utilBps Current pool utilisation in bps (e.g. 8000 = 80 %).
    function getUtilizationBps() external view returns (uint256 utilBps) {
        if (totalSupplied == 0) return 0;
        return (totalBorrowed * 10_000) / totalSupplied;
    }

    /// @return borrowRateBps Current annual borrow rate in bps.
    function getCurrentBorrowRateBps() external view returns (uint256 borrowRateBps) {
        uint256 util = totalSupplied == 0 ? 0 : (totalBorrowed * 10_000) / totalSupplied;
        return irm.getBorrowRateBps(util);
    }

    /// @return supplyRateBps Current annual supply APY in bps (what suppliers earn).
    function getCurrentSupplyRateBps() external view returns (uint256 supplyRateBps) {
        uint256 util = totalSupplied == 0 ? 0 : (totalBorrowed * 10_000) / totalSupplied;
        return irm.getSupplyRateBps(util, PROTOCOL_FEE_BPS);
    }

    /// @return personalBorrowRateBps Effective borrow rate for a specific user (after reputation discount).
    function getPersonalBorrowRateBps(address user) external view returns (uint256) {
        return _personalBorrowRateBps(user);
    }

    /// @return amount         QUSDC supplied.
    /// @return pendingYield   Claimable supplier yield (includes unsettled portion).
    function getSupplierPosition(address user) external view returns (
        uint256 amount,
        uint256 pendingYield
    ) {
        SupplyPosition memory pos = suppliers[user];
        amount = pos.amount;
        uint256 newPending = pos.amount == 0 ? 0
            : (pos.amount * accInterestPerShare) / ACC_PRECISION - pos.rewardDebt;
        pendingYield = pos.pendingYield + newPending;
    }

    /// @notice Full borrower position snapshot with health metrics.
    function getBorrowerPosition(address user) external view returns (
        uint256 collateral,
        uint256 principal,
        uint256 interestOwed,
        uint256 currentLtvBps,
        uint256 maxLtvBps,
        uint256 liqThresholdBps,
        uint256 healthFactorBps,
        bool    isLiquidatable
    ) {
        collateral      = borrowers[user].collateral;
        principal       = borrowers[user].principal;
        interestOwed    = borrowers[user].interestOwed + _viewPendingInterest(user);
        maxLtvBps       = _maxLtvBps(user);
        liqThresholdBps = maxLtvBps + LIQ_BUFFER_BPS;

        if (collateral > 0 && principal > 0) {
            uint256 colValue = _wethToQusdc(collateral);
            currentLtvBps   = colValue > 0
                ? ((principal + interestOwed) * 10_000) / colValue
                : type(uint256).max;
            healthFactorBps = currentLtvBps > 0
                ? (liqThresholdBps * 10_000) / currentLtvBps
                : type(uint256).max;
            isLiquidatable  = currentLtvBps > liqThresholdBps;
        } else {
            healthFactorBps = type(uint256).max;
        }
    }

    /// @dev View-only pending interest accrual (does not write state).
    function _viewPendingInterest(address user) internal view returns (uint256) {
        BorrowerPosition memory pos = borrowers[user];
        if (pos.principal == 0 || pos.lastAccrual == 0) return 0;
        uint256 elapsed = block.timestamp - pos.lastAccrual;
        if (elapsed == 0) return 0;
        uint256 util    = totalSupplied > 0 ? (totalBorrowed * 10_000) / totalSupplied : 0;
        uint256 rate    = irm.getBorrowRateBps(util)
                          * (10_000 - _discountBps(reputationRegistry.getCreditScore(user)))
                          / 10_000;
        return (pos.principal * rate * elapsed) / (SECONDS_PER_YEAR * 10_000);
    }

    /// @notice Preview maximum QUSDC borrowable against a given WETH amount.
    function getMaxBorrow(address user, uint256 collateralAmount)
        external
        view
        returns (uint256 maxQusdc)
    {
        uint256 colValue = _wethToQusdc(collateralAmount);
        return (colValue * _maxLtvBps(user)) / 10_000;
    }

    // =========================================================================
    // INTERNAL
    // =========================================================================

    /// @dev Accrue per-user interest using their personal (discounted) rate.
    function _accrueUserInterest(address user) internal {
        BorrowerPosition storage pos = borrowers[user];
        if (pos.principal == 0 || pos.lastAccrual == 0) return;

        uint256 elapsed = block.timestamp - pos.lastAccrual;
        if (elapsed == 0) return;

        uint256 rateBps   = _personalBorrowRateBps(user);
        uint256 interest  = (pos.principal * rateBps * elapsed) / (SECONDS_PER_YEAR * 10_000);
        pos.interestOwed += interest;
        pos.lastAccrual   = block.timestamp;
    }

    /// @dev Settle unsettled supplier yield into pendingYield.
    function _settleSupplierYield(SupplyPosition storage pos) internal {
        if (pos.amount == 0) return;
        uint256 newYield = (pos.amount * accInterestPerShare) / ACC_PRECISION - pos.rewardDebt;
        if (newYield > 0) pos.pendingYield += newYield;
    }

    /// @dev Effective borrow rate for a user: jump-rate × (1 - reputationDiscount).
    function _personalBorrowRateBps(address user) internal view returns (uint256) {
        uint256 util    = totalSupplied > 0 ? (totalBorrowed * 10_000) / totalSupplied : 0;
        uint256 baseRate = irm.getBorrowRateBps(util);
        uint256 disc     = _discountBps(reputationRegistry.getCreditScore(user));
        return baseRate * (10_000 - disc) / 10_000;
    }

    function _discountBps(uint16 score) internal pure returns (uint256) {
        if (score > 800) return DISC_PLATINUM;
        if (score > 600) return DISC_GOLD;
        if (score > 400) return DISC_SILVER;
        if (score > 200) return DISC_BRONZE;
        return DISC_NONE;
    }

    function _maxLtvBps(address user) internal view returns (uint256) {
        uint16 score = reputationRegistry.getCreditScore(user);
        if (score > 800) return 7_500;  // 75 %
        if (score > 600) return 7_200;  // 72 %
        if (score > 400) return 6_800;  // 68 %
        if (score > 200) return 6_400;  // 64 %
        return 6_000;                    // 60 %
    }

    function _currentLtvBps(address user) internal view returns (uint256) {
        BorrowerPosition memory pos = borrowers[user];
        if (pos.collateral == 0) return 0;
        uint256 colValue  = _wethToQusdc(pos.collateral);
        if (colValue == 0) return type(uint256).max;
        uint256 totalDebt = pos.principal + pos.interestOwed;
        return (totalDebt * 10_000) / colValue;
    }

    /// @dev Reverts when the oracle hasn't been updated within MAX_PRICE_AGE.
    function _requireFreshPrice() internal view {
        uint256 age = block.timestamp - oracle.updatedAt();
        if (age > MAX_PRICE_AGE) revert StalePrice(age);
    }

    /// @dev WETH (18 dec) → QUSDC (6 dec).  Oracle price has 8 decimals.
    ///      wethAmt × price / 1e20 = QUSDC (6 dec).
    function _wethToQusdc(uint256 wethAmt) internal view returns (uint256) {
        return (wethAmt * oracle.getPrice()) / 1e20;
    }

    function _qusdcToWeth(uint256 qusdcAmt) internal view returns (uint256) {
        return (qusdcAmt * 1e20) / oracle.getPrice();
    }
}
