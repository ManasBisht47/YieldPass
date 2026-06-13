// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/funds/IInsuranceFund.sol";

// InsuranceFund - backstop reserve. Gets topped up with 5% of every harvest
// (and early-exit penalties) and is there to cover IL / shortfalls so stakers
// don't eat them. Only the strategy can pay in, only DISBURSER_ROLE can pay out.
contract InsuranceFund is AccessControl, IInsuranceFund {
    using SafeERC20 for IERC20;

    // -------------------------------------------------------------------------
    // Roles
    // -------------------------------------------------------------------------

    bytes32 public constant DEPOSITOR_ROLE  = keccak256("DEPOSITOR_ROLE"); // strategy
    bytes32 public constant DISBURSER_ROLE  = keccak256("DISBURSER_ROLE"); // vault / admin

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    // reserve token - set at deploy (QUSDC on the lending side, WQIE on staking)
    IERC20 private immutable _qusdc;

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address admin, address qusdc_) {
        if (admin == address(0) || qusdc_ == address(0)) revert ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _qusdc = IERC20(qusdc_);
    }

    // -------------------------------------------------------------------------
    // External - state-changing
    // -------------------------------------------------------------------------

    /// @inheritdoc IInsuranceFund
    function deposit(uint256 amount) external onlyRole(DEPOSITOR_ROLE) {
        if (amount == 0) revert ZeroAmount();
        _qusdc.safeTransferFrom(msg.sender, address(this), amount);
        emit FundsDeposited(msg.sender, amount);
    }

    /// @inheritdoc IInsuranceFund
    function disburse(
        address recipient,
        uint256 amount,
        string calldata reason
    ) external onlyRole(DISBURSER_ROLE) {
        if (recipient == address(0)) revert ZeroAddress();
        if (amount == 0)             revert ZeroAmount();

        uint256 available = _qusdc.balanceOf(address(this));
        if (amount > available) revert InsufficientBalance(amount, available);

        _qusdc.safeTransfer(recipient, amount);
        emit FundsDisbursed(recipient, amount, reason);
    }

    // -------------------------------------------------------------------------
    // External - view
    // -------------------------------------------------------------------------

    /// @inheritdoc IInsuranceFund
    function balance() external view returns (uint256) {
        return _qusdc.balanceOf(address(this));
    }

    /// @inheritdoc IInsuranceFund
    function qusdc() external view returns (address) {
        return address(_qusdc);
    }
}
