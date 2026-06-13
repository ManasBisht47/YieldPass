// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title  IUniswapV2Router02
/// @notice Minimal interface for the QIEDex Router.
///         Address: 0x08cd2e72e156D8563B4351eb4065C262A9f553Ef
interface IUniswapV2Router02 {
    function factory() external view returns (address);
    function WETH()    external view returns (address);  // = WQIE on QIEDex

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity);

    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB);

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts);
}
