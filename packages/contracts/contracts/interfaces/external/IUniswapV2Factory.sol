// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title  IUniswapV2Factory
/// @notice Minimal interface for the QIEDex Factory.
///         Address: 0x8E23128a5511223bE6c0d64106e2D4508C08398C
interface IUniswapV2Factory {
    function getPair(address tokenA, address tokenB)
        external
        view
        returns (address pair);

    function createPair(address tokenA, address tokenB)
        external
        returns (address pair);
}
