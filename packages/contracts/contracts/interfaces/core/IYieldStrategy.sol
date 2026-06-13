// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title  IYieldStrategy
/// @notice Interface for the capital deployment strategy.
///         Receives staked QUSDC, deploys a portion to QIEDex WQIE/QUSDC LP,
///         harvests LP fees, and distributes yield back to the vault.
interface IYieldStrategy {
    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event FundsDeployed(uint256 toReserve, uint256 toLiquidity);
    event FundsWithdrawn(uint256 amount, address indexed to);
    event YieldHarvested(uint256 rawYield, uint256 toStakers, uint256 toProtocol, uint256 toInsurance);
    event DeployRatioUpdated(uint256 oldBps, uint256 newBps);
    event EmergencyExited(uint256 qusdcRecovered);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error ZeroAmount();
    error ZeroAddress();
    error DeployRatioTooHigh(uint256 bps);
    error SlippageTooHigh();
    error NotEnoughLiquidity();

    // -------------------------------------------------------------------------
    // State-changing
    // -------------------------------------------------------------------------

    /// @notice Receives QUSDC from YieldVault and deploys according to
    ///         the current deploy ratio (default 20 % LP, 80 % reserve).
    function deployFunds(uint256 amount) external;

    /// @notice Withdraws `amount` QUSDC back to YieldVault for unstaking.
    ///         Pulls first from reserve; removes LP if reserve is insufficient.
    function withdrawFunds(uint256 amount, address to) external;

    /// @notice Harvests accrued LP fees and distributes to stakers,
    ///         protocol treasury, and insurance fund.
    ///         Called daily by the keeper.
    function harvestAndDistribute() external;

    /// @notice Emergency: remove all LP and return QUSDC to vault.
    ///         Callable only by admin.
    function emergencyExit() external;

    /// @notice Updates the fraction of deposits sent to QIEDex LP.
    /// @param newRatioBps  New ratio in basis points (max 5000 = 50 %).
    function setDeployRatio(uint256 newRatioBps) external;

    // -------------------------------------------------------------------------
    // View
    // -------------------------------------------------------------------------

    /// @notice Total QUSDC under management (reserve + LP value estimate).
    function totalManagedAssets() external view returns (uint256);

    /// @notice QUSDC held in the idle reserve (not deployed to LP).
    function reserveBalance() external view returns (uint256);

    /// @notice LP tokens currently held in this contract.
    function lpTokenBalance() external view returns (uint256);

    /// @notice Current deploy ratio in basis points.
    function deployRatioBps() external view returns (uint256);
}
