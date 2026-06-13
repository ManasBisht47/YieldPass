// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// InterestRateModel — standard jump-rate curve. Cheap to borrow while the pool
// is under-used, then the rate ramps hard past the 80% kink to pull utilisation
// back down. Everything's in annual bps (100 bps = 1%).
//
// Quick sanity numbers I checked against while tuning the constants:
//   0%  util -> ~2% borrow
//   80% util -> ~14% borrow   (where we want it to sit)
//   100% util -> ~44% borrow  (deliberately ugly)
contract InterestRateModel {

    uint256 public constant BASE_RATE_BPS         =   200;  // 2%
    uint256 public constant MULTIPLIER_BPS        = 1_500;  // 15 % slope below kink
    uint256 public constant JUMP_MULTIPLIER_BPS   = 15_000; // 150 % slope above kink
    uint256 public constant KINK_BPS              = 8_000;  // 80 % optimal util
    uint256 public constant SECONDS_PER_YEAR      = 365 days;

    // -------------------------------------------------------------------------
    // External view helpers
    // -------------------------------------------------------------------------

    /// @param utilBps  Utilisation in bps (totalBorrowed * 10_000 / totalSupply).
    /// @return borrowRateBps  Annual borrow rate in bps.
    function getBorrowRateBps(uint256 utilBps) external pure returns (uint256 borrowRateBps) {
        if (utilBps > 10_000) utilBps = 10_000;

        if (utilBps <= KINK_BPS) {
            borrowRateBps = BASE_RATE_BPS + (utilBps * MULTIPLIER_BPS) / 10_000;
        } else {
            uint256 normalSlope = BASE_RATE_BPS + (KINK_BPS * MULTIPLIER_BPS) / 10_000;
            uint256 excess      = utilBps - KINK_BPS;
            borrowRateBps       = normalSlope + (excess * JUMP_MULTIPLIER_BPS) / 10_000;
        }
    }

    /// @notice Supply rate = borrowRate * utilisation * (1 - protocolFee).
    /// @param utilBps       Utilisation in bps.
    /// @param protocolFeeBps Protocol fee taken from interest (e.g. 2000 = 20 %).
    /// @return supplyRateBps Annual supply APY in bps (what suppliers earn).
    function getSupplyRateBps(
        uint256 utilBps,
        uint256 protocolFeeBps
    ) external pure returns (uint256 supplyRateBps) {
        if (utilBps > 10_000) utilBps = 10_000;

        uint256 borrowRate = 0;
        if (utilBps <= KINK_BPS) {
            borrowRate = BASE_RATE_BPS + (utilBps * MULTIPLIER_BPS) / 10_000;
        } else {
            uint256 normalSlope = BASE_RATE_BPS + (KINK_BPS * MULTIPLIER_BPS) / 10_000;
            uint256 excess      = utilBps - KINK_BPS;
            borrowRate          = normalSlope + (excess * JUMP_MULTIPLIER_BPS) / 10_000;
        }

        // supplyRate = borrowRate * util * (1 - protocolFee)
        supplyRateBps = (borrowRate * utilBps * (10_000 - protocolFeeBps)) / (10_000 * 10_000);
    }

    /// @notice Per-second borrow rate (WAD: 1e18 = 100 %).
    ///         Useful for block-level accrual in lending contracts.
    function getBorrowRatePerSecond(uint256 utilBps) external pure returns (uint256) {
        uint256 annualBps = 0;
        if (utilBps > 10_000) utilBps = 10_000;

        if (utilBps <= KINK_BPS) {
            annualBps = BASE_RATE_BPS + (utilBps * MULTIPLIER_BPS) / 10_000;
        } else {
            uint256 normalSlope = BASE_RATE_BPS + (KINK_BPS * MULTIPLIER_BPS) / 10_000;
            annualBps           = normalSlope + ((utilBps - KINK_BPS) * JUMP_MULTIPLIER_BPS) / 10_000;
        }

        // Convert annualBps to per-second WAD: annualBps / 10_000 / SECONDS_PER_YEAR * 1e18
        return (annualBps * 1e18) / (10_000 * SECONDS_PER_YEAR);
    }
}
