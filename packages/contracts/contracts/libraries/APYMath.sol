// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// APYMath - small pure helpers for the vault/strategy. APY is always in bps
// (100 = 1%). Amounts are whatever token the caller passes; the math is decimal-
// agnostic so it works for both 18-dec WQIE and 6-dec QUSDC.
library APYMath {
    uint256 internal constant SECONDS_PER_YEAR = 365 days;
    uint256 internal constant BPS_DENOMINATOR  = 10_000;

    /// @notice Simple (non-compounding) yield for a principal over `elapsed` seconds.
    function accruedYield(
        uint256 principal,
        uint256 apyBps,
        uint256 elapsed
    ) internal pure returns (uint256 yield) {
        yield = (principal * apyBps * elapsed) / (BPS_DENOMINATOR * SECONDS_PER_YEAR);
    }

    /// @notice Portion of `staked` that's eligible for the boost. Anything over the
    ///         cap only earns base - this is the anti-whale lever. Whales (stake
    ///         past whaleThreshold) get a slightly higher cap, not an unlimited one.
    function boostedPrincipal(
        uint256 staked,
        uint256 standardCap,
        uint256 whaleCap,
        uint256 whaleThreshold
    ) internal pure returns (uint256 capped) {
        uint256 cap = staked >= whaleThreshold ? whaleCap : standardCap;
        capped = staked < cap ? staked : cap;
    }

    /// @notice Carve raw yield into protocol fee, insurance fee, and whatever's
    ///         left for stakers. Stakers get the remainder so the three always
    ///         sum back to rawYield with no dust lost.
    function splitYield(
        uint256 rawYield,
        uint256 protocolFeeBps,
        uint256 insuranceFeeBps
    ) internal pure returns (
        uint256 toStakers,
        uint256 toProtocol,
        uint256 toInsurance
    ) {
        toProtocol  = (rawYield * protocolFeeBps)  / BPS_DENOMINATOR;
        toInsurance = (rawYield * insuranceFeeBps) / BPS_DENOMINATOR;
        toStakers   = rawYield - toProtocol - toInsurance;
    }
}
