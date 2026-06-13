// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title  INullifierRegistry
/// @notice Interface for the global child-wallet lock registry.
///         Once a child wallet is registered, it is permanently locked
///         and cannot be reused to boost any other master wallet's score.
interface INullifierRegistry {
    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted when a child wallet is permanently locked to a master.
    /// @param childWallet   The wallet being locked.
    /// @param masterWallet  The master wallet it is locked to.
    /// @param nullifier     keccak256(child || master || chainid) commitment.
    event WalletLocked(
        address indexed childWallet,
        address indexed masterWallet,
        bytes32 indexed nullifier
    );

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    /// @notice Thrown when a child wallet has already been locked.
    error WalletAlreadyLocked(address childWallet, address existingMaster);

    /// @notice Thrown when a zero address is supplied.
    error ZeroAddress();

    /// @notice Thrown when child and master are the same address.
    error CannotLinkToSelf();

    // -------------------------------------------------------------------------
    // State-changing functions
    // -------------------------------------------------------------------------

    /// @notice Permanently locks `childWallet` to `masterWallet`.
    ///         Can only be called by an account with REGISTRAR_ROLE.
    /// @param childWallet  Address being locked.
    /// @param masterWallet Address it is linked to.
    function registerNullifier(address childWallet, address masterWallet) external;

    // -------------------------------------------------------------------------
    // View functions
    // -------------------------------------------------------------------------

    /// @notice Returns the lock status and linked master for `wallet`.
    /// @param wallet       Address to query.
    /// @return isLocked    True if the wallet has been registered as a child.
    /// @return masterWallet The master wallet it is locked to (address(0) if not locked).
    function getLockStatus(address wallet)
        external
        view
        returns (bool isLocked, address masterWallet);

    /// @notice Convenience function — returns true if `wallet` is locked.
    function isLocked(address wallet) external view returns (bool);
}
