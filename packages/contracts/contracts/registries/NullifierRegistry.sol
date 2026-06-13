// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "../interfaces/registries/INullifierRegistry.sol";

// NullifierRegistry — append-only "this child wallet belongs to that master"
// ledger. Once a child is locked it can never move, which is what stops someone
// recycling the same wallet to farm reputation across multiple masters.
//
// Deploy this before ReputationRegistry, then give ReputationRegistry the
// REGISTRAR_ROLE so it's the only thing that can write here.
contract NullifierRegistry is AccessControl, INullifierRegistry {
    // -------------------------------------------------------------------------
    // Roles
    // -------------------------------------------------------------------------

    // only ReputationRegistry should ever hold this
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    // child => master it's bound to. zero address = never registered.
    mapping(address => address) private _lockedTo;

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // -------------------------------------------------------------------------
    // External — state-changing
    // -------------------------------------------------------------------------

    /// @inheritdoc INullifierRegistry
    function registerNullifier(
        address childWallet,
        address masterWallet
    ) external onlyRole(REGISTRAR_ROLE) {
        if (childWallet == address(0) || masterWallet == address(0))
            revert ZeroAddress();

        if (childWallet == masterWallet)
            revert CannotLinkToSelf();

        address existing = _lockedTo[childWallet];
        if (existing != address(0))
            revert WalletAlreadyLocked(childWallet, existing);

        // chainid in the hash so a lock on one chain can't be replayed on another
        bytes32 nullifier = keccak256(
            abi.encodePacked(childWallet, masterWallet, block.chainid)
        );

        _lockedTo[childWallet] = masterWallet;

        emit WalletLocked(childWallet, masterWallet, nullifier);
    }

    // -------------------------------------------------------------------------
    // External — view
    // -------------------------------------------------------------------------

    /// @inheritdoc INullifierRegistry
    function getLockStatus(address wallet)
        external
        view
        returns (bool locked, address master)
    {
        master = _lockedTo[wallet];
        locked = master != address(0);
    }

    /// @inheritdoc INullifierRegistry
    function isLocked(address wallet) external view returns (bool) {
        return _lockedTo[wallet] != address(0);
    }
}
