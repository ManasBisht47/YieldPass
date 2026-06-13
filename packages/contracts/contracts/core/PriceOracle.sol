// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

// PriceOracle — ETH/USD, stored at 8 decimals like Chainlink.
//
// Two ways to write it. The keeper bot (UPDATER_ROLE) goes through setPrice(),
// which is capped at ±20% per update — if that key leaks, an attacker can nudge
// the price but not teleport it. The admin/multisig can forceSetPrice() with no
// cap, which is the escape hatch for when the keeper's been down through a real
// >20% move and the bounded path would reject the true price.
//
// Consumers should still sanity-check updatedAt themselves (LendingPool does).
contract PriceOracle is AccessControl {

    bytes32 public constant UPDATER_ROLE = keccak256("UPDATER_ROLE");

    /// @notice Max relative change per keeper update (bps). 2000 = ±20 %.
    uint256 public constant MAX_DEVIATION_BPS = 2_000;

    uint256 public ethUsdPrice;   // 8 decimals
    uint256 public updatedAt;

    event PriceUpdated(uint256 price, uint256 timestamp, bool forced);

    error ZeroPrice();
    error DeviationTooLarge(uint256 oldPrice, uint256 newPrice);

    constructor(address admin_, uint256 initialPrice_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(UPDATER_ROLE, admin_);
        ethUsdPrice = initialPrice_;
        updatedAt   = block.timestamp;
    }

    /// @notice Keeper path — bounded to ±20 % per update.
    function setPrice(uint256 price_) external onlyRole(UPDATER_ROLE) {
        if (price_ == 0) revert ZeroPrice();

        uint256 old = ethUsdPrice;
        if (old > 0) {
            uint256 delta = price_ > old ? price_ - old : old - price_;
            if ((delta * 10_000) / old > MAX_DEVIATION_BPS)
                revert DeviationTooLarge(old, price_);
        }

        ethUsdPrice = price_;
        updatedAt   = block.timestamp;
        emit PriceUpdated(price_, block.timestamp, false);
    }

    /// @notice Admin recovery path — unbounded (multisig only on mainnet).
    function forceSetPrice(uint256 price_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (price_ == 0) revert ZeroPrice();
        ethUsdPrice = price_;
        updatedAt   = block.timestamp;
        emit PriceUpdated(price_, block.timestamp, true);
    }

    /// @return price  ETH/USD with 8 decimals
    function getPrice() external view returns (uint256 price) {
        require(ethUsdPrice > 0, "price not set");
        return ethUsdPrice;
    }
}
