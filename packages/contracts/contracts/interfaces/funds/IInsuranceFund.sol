// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title  IInsuranceFund
/// @notice Interface for the protocol safety reserve.
///         Receives 5 % of every yield harvest and covers losses
///         caused by impermanent loss or unexpected shortfalls
///         in the YieldStrategy.
interface IInsuranceFund {
    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event FundsDeposited(address indexed from, uint256 amount);
    event FundsDisbursed(address indexed to,   uint256 amount, string reason);
    event TargetRatioUpdated(uint256 oldBps, uint256 newBps);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error InsufficientBalance(uint256 requested, uint256 available);
    error ZeroAmount();
    error ZeroAddress();

    // -------------------------------------------------------------------------
    // State-changing
    // -------------------------------------------------------------------------

    /// @notice Accepts QUSDC from YieldStrategy as periodic insurance deposit.
    function deposit(uint256 amount) external;

    /// @notice Sends `amount` QUSDC to `recipient` to cover a loss event.
    ///         Only callable by DISBURSER_ROLE.
    function disburse(address recipient, uint256 amount, string calldata reason) external;

    // -------------------------------------------------------------------------
    // View
    // -------------------------------------------------------------------------

    /// @notice Returns the current QUSDC balance held by the fund.
    function balance() external view returns (uint256);

    /// @notice Address of the QUSDC token contract.
    function qusdc() external view returns (address);
}
