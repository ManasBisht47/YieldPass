// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ScoreMultiplier - maps a 0-1000 credit score to a share multiplier (bps,
// 10000 = 1.0x). Five flat bands; capped at 1.5x on purpose so the boost stays
// fundable from real fee revenue rather than promising yield we can't pay.
library ScoreMultiplier {
    uint256 internal constant BPS_DENOMINATOR = 10_000;

    function getMultiplierBps(uint16 score) internal pure returns (uint256) {
        if (score <= 200) return 10_000; // no boost
        if (score <= 400) return 11_000; // 1.1x
        if (score <= 600) return 12_000; // 1.2x
        if (score <= 800) return 13_500; // 1.35x
        return 15_000;                    // 1.5x, top band
    }

    function applyMultiplier(
        uint256 baseApyBps,
        uint16  score
    ) internal pure returns (uint256 boostedApyBps) {
        boostedApyBps = (baseApyBps * getMultiplierBps(score)) / BPS_DENOMINATOR;
    }
}
