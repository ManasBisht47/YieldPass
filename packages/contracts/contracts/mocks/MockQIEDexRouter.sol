// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/external/IUniswapV2Router02.sol";

/// @notice Minimal DEX router test double. Returns fixed amounts for unit tests.
contract MockQIEDexRouter is IUniswapV2Router02 {
    address private immutable _wqie;
    address private immutable _factory;

    constructor(address wqie_, address factory_) {
        _wqie    = wqie_;
        _factory = factory_;
    }

    function factory() external view override returns (address) { return _factory; }
    function WETH()    external view override returns (address) { return _wqie; }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256,
        uint256,
        address to,
        uint256
    ) external override returns (uint256, uint256, uint256 liquidity) {
        IERC20(tokenA).transferFrom(msg.sender, address(this), amountADesired);
        IERC20(tokenB).transferFrom(msg.sender, address(this), amountBDesired);
        // Return a fixed LP amount for test assertions.
        liquidity = amountADesired;
        return (amountADesired, amountBDesired, liquidity);
    }

    function removeLiquidity(
        address tokenA,
        address,
        uint256 liquidity,
        uint256,
        uint256,
        address to,
        uint256
    ) external override returns (uint256 amountA, uint256 amountB) {
        amountA = liquidity;
        amountB = 0;
        IERC20(tokenA).transfer(to, amountA);
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256,
        address[] calldata path,
        address to,
        uint256
    ) external override returns (uint256[] memory amounts) {
        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = amountIn; // 1:1 for testing
        IERC20(path[1]).transfer(to, amountIn);
    }

    function getAmountsOut(uint256 amountIn, address[] calldata)
        external
        pure
        override
        returns (uint256[] memory amounts)
    {
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = amountIn;
    }
}
