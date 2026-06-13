// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Testnet stand-in for the QIEDex router+factory addresses.
///         QIEDex only exists on mainnet; with deployRatio = 0 the strategy
///         never trades, but view paths still query the factory. This stub
///         returns the zero pair so LP value reads cleanly as 0.
contract MockDexStub {
    function getPair(address, address) external pure returns (address) {
        return address(0);
    }
}
