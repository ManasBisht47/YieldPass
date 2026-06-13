// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../interfaces/core/IYieldStrategy.sol";
import "../interfaces/core/IYieldVault.sol";
import "../interfaces/funds/IInsuranceFund.sol";
import "../interfaces/external/IUniswapV2Router02.sol";
import "../interfaces/external/IUniswapV2Factory.sol";
import "../interfaces/external/IUniswapV2Pair.sol";
import "../libraries/APYMath.sol";

// YieldStrategy — handles where staked capital actually sits.
//
// Kept token-generic on purpose so the same contract works on testnet (stub
// router) and mainnet (real QIEDex): stakingToken is what the vault sends in
// (WQIE), pairToken is the other LP leg (QUSDC), and everything is accounted in
// stakingToken.
//
// Split per deposit: deployRatio% goes into the QIEDex LP, the rest stays as
// liquid reserve so most unstakes don't have to touch the pool. Harvested LP
// fees get split 85/10/5 between stakers / treasury / insurance.
//
// Every swap quotes getAmountsOut and bounds minOut by slippageBps so a
// sandwiched pool can't bleed us on harvest.
contract YieldStrategy is AccessControl, ReentrancyGuard, IYieldStrategy {
    using SafeERC20 for IERC20;
    using APYMath for uint256;

    // -------------------------------------------------------------------------
    // Roles
    // -------------------------------------------------------------------------

    bytes32 public constant VAULT_ROLE   = keccak256("VAULT_ROLE");
    bytes32 public constant KEEPER_ROLE  = keccak256("KEEPER_ROLE");

    // -------------------------------------------------------------------------
    // Immutables
    // -------------------------------------------------------------------------

    IERC20          public immutable stakingToken;   // WQIE — what we account in
    IERC20          public immutable pairToken;       // QUSDC — other LP leg
    IUniswapV2Router02 public immutable router;
    IUniswapV2Factory  public immutable factory;
    IInsuranceFund  public immutable insuranceFund;
    address         public immutable treasury;

    // not immutable: vault depends on strategy and vice-versa, so it's wired in
    // after both are deployed
    address         public vault;

    // -------------------------------------------------------------------------
    // Fee split (in bps, must sum to 10000)
    // -------------------------------------------------------------------------

    uint256 public constant STAKER_SHARE_BPS    = 8_500; // 85 %
    uint256 public constant PROTOCOL_FEE_BPS    = 1_000; // 10 %
    uint256 public constant INSURANCE_FEE_BPS   =   500; //  5 %
    uint256 public constant MAX_DEPLOY_RATIO_BPS = 5_000; // 50 % ceiling
    uint256 public constant MAX_SLIPPAGE_BPS     = 1_000; // 10 % ceiling

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    uint256 public deployRatioBps = 2_000; // 20 % default
    uint256 public slippageBps    =   100; // 1 % default swap tolerance

    // Tracks stakingToken deposited into LP so we can measure fee accrual.
    uint256 private _tokenInLp;

    event SlippageUpdated(uint256 oldBps, uint256 newBps);
    event VaultUpdated(address indexed newVault);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(
        address admin_,
        address vault_,
        address keeper_,
        address stakingToken_,
        address pairToken_,
        address router_,
        address factory_,
        address insuranceFund_,
        address treasury_
    ) {
        if (
            admin_ == address(0)  || keeper_ == address(0)  ||
            stakingToken_ == address(0) || pairToken_ == address(0) ||
            router_ == address(0) || factory_ == address(0) ||
            insuranceFund_ == address(0) || treasury_ == address(0)
        ) revert ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(VAULT_ROLE,         vault_);
        _grantRole(KEEPER_ROLE,        keeper_);

        stakingToken  = IERC20(stakingToken_);
        pairToken     = IERC20(pairToken_);
        router        = IUniswapV2Router02(router_);
        factory       = IUniswapV2Factory(factory_);
        insuranceFund = IInsuranceFund(insuranceFund_);
        treasury      = treasury_;
        vault         = vault_;
    }

    // -------------------------------------------------------------------------
    // Admin
    // -------------------------------------------------------------------------

    function setVault(address newVault) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newVault == address(0)) revert ZeroAddress();
        vault = newVault;
        _grantRole(VAULT_ROLE, newVault);
        emit VaultUpdated(newVault);
    }

    /// @notice Max acceptable swap slippage in bps (protects harvests from MEV).
    function setSlippage(uint256 newSlippageBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newSlippageBps <= MAX_SLIPPAGE_BPS, "YieldStrategy: slippage too high");
        uint256 old = slippageBps;
        slippageBps = newSlippageBps;
        emit SlippageUpdated(old, newSlippageBps);
    }

    /// @inheritdoc IYieldStrategy
    function setDeployRatio(uint256 newRatioBps)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (newRatioBps > MAX_DEPLOY_RATIO_BPS)
            revert DeployRatioTooHigh(newRatioBps);

        uint256 old = deployRatioBps;
        deployRatioBps = newRatioBps;
        emit DeployRatioUpdated(old, newRatioBps);
    }

    /// @inheritdoc IYieldStrategy
    function emergencyExit() external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        uint256 lpBalance = _lpPair().balanceOf(address(this));
        if (lpBalance > 0) {
            _removeLiquidity(type(uint256).max);
        }
        uint256 recovered = stakingToken.balanceOf(address(this));
        if (recovered > 0) {
            stakingToken.safeTransfer(vault, recovered);
        }
        emit EmergencyExited(recovered);
    }

    // -------------------------------------------------------------------------
    // External — vault interactions
    // -------------------------------------------------------------------------

    /// @inheritdoc IYieldStrategy
    function deployFunds(uint256 amount) external onlyRole(VAULT_ROLE) nonReentrant {
        if (amount == 0) revert ZeroAmount();

        stakingToken.safeTransferFrom(msg.sender, address(this), amount);

        uint256 toLiquidity = (amount * deployRatioBps) / 10_000;
        uint256 toReserve   = amount - toLiquidity;

        if (toLiquidity > 0) {
            _addLiquidity(toLiquidity);
        }

        emit FundsDeployed(toReserve, toLiquidity);
    }

    /// @inheritdoc IYieldStrategy
    function withdrawFunds(uint256 amount, address to)
        external
        onlyRole(VAULT_ROLE)
        nonReentrant
    {
        if (amount == 0)       revert ZeroAmount();
        if (to == address(0))  revert ZeroAddress();

        uint256 reserve = stakingToken.balanceOf(address(this));

        if (amount <= reserve) {
            // common case: reserve covers it, exact 1:1, no DEX cost
            stakingToken.safeTransfer(to, amount);
            emit FundsWithdrawn(amount, to);
        } else {
            // reserve isn't enough, so pull the rest out of the LP. removing
            // exactly the shortfall comes up short because the pairToken half
            // gets swapped back and eats a swap fee — so over-remove ~2% (+ a
            // dust amount) to cover it when there's LP headroom. leftover stays
            // in reserve.
            uint256 shortfall = amount - reserve;
            _removeLiquidity(shortfall + shortfall / 50 + 1e12);

            // if the fee gap still leaves us short, pay what we actually have
            // rather than reverting and trapping the user's stake
            uint256 available = stakingToken.balanceOf(address(this));
            uint256 payout    = available < amount ? available : amount;
            stakingToken.safeTransfer(to, payout);
            emit FundsWithdrawn(payout, to);
        }
    }

    // -------------------------------------------------------------------------
    // External — keeper
    // -------------------------------------------------------------------------

    /// @inheritdoc IYieldStrategy
    function harvestAndDistribute() external onlyRole(KEEPER_ROLE) nonReentrant {
        uint256 rawYield = _harvestLPFees();
        if (rawYield == 0) return;
        _distributeYield(rawYield);
    }

    /// @notice Distribute stakingToken already sitting in this contract. Used for
    ///         testnet yield simulation and the occasional manual top-up.
    function injectYield(uint256 amount) external onlyRole(KEEPER_ROLE) nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (vault == address(0)) revert ZeroAddress();
        if (stakingToken.balanceOf(address(this)) < amount) revert NotEnoughLiquidity();
        _distributeYield(amount);
    }

    // -------------------------------------------------------------------------
    // External — view
    // -------------------------------------------------------------------------

    /// @inheritdoc IYieldStrategy
    function totalManagedAssets() external view returns (uint256) {
        return stakingToken.balanceOf(address(this)) + _estimateLPValue();
    }

    /// @inheritdoc IYieldStrategy
    function reserveBalance() external view returns (uint256) {
        return stakingToken.balanceOf(address(this));
    }

    /// @inheritdoc IYieldStrategy
    function lpTokenBalance() external view returns (uint256) {
        return _lpPair().balanceOf(address(this));
    }

    // -------------------------------------------------------------------------
    // Internal — yield distribution
    // -------------------------------------------------------------------------

    function _distributeYield(uint256 rawYield) internal {
        (uint256 toStakers, uint256 toProtocol, uint256 toInsurance) =
            APYMath.splitYield(rawYield, PROTOCOL_FEE_BPS, INSURANCE_FEE_BPS);

        if (toProtocol > 0) {
            stakingToken.safeTransfer(treasury, toProtocol);
        }
        if (toInsurance > 0) {
            stakingToken.safeIncreaseAllowance(address(insuranceFund), toInsurance);
            insuranceFund.deposit(toInsurance);
        }
        if (toStakers > 0 && vault != address(0)) {
            stakingToken.safeIncreaseAllowance(vault, toStakers);
            IYieldVault(vault).receiveYield(toStakers);
        }

        emit YieldHarvested(rawYield, toStakers, toProtocol, toInsurance);
    }

    // -------------------------------------------------------------------------
    // Internal — QIEDex interactions (slippage-protected)
    // -------------------------------------------------------------------------

    /// @dev minOut = on-chain quote shaved by slippageBps.
    function _minOut(uint256 amountIn, address[] memory path) internal view returns (uint256) {
        uint256[] memory quoted = router.getAmountsOut(amountIn, path);
        return (quoted[quoted.length - 1] * (10_000 - slippageBps)) / 10_000;
    }

    function _addLiquidity(uint256 tokenAmount) internal {
        // classic zap: swap half to pairToken, then LP the two halves
        uint256 half = tokenAmount / 2;

        stakingToken.safeIncreaseAllowance(address(router), tokenAmount);

        address[] memory path = new address[](2);
        path[0] = address(stakingToken);
        path[1] = address(pairToken);

        uint256[] memory amounts = router.swapExactTokensForTokens(
            half,
            _minOut(half, path),
            path,
            address(this),
            block.timestamp + 300
        );

        uint256 pairReceived = amounts[1];
        uint256 tokenForLp   = tokenAmount - half;

        pairToken.safeIncreaseAllowance(address(router), pairReceived);

        // min amounts bounded by slippage, same MEV reasoning as the swap above
        router.addLiquidity(
            address(stakingToken),
            address(pairToken),
            tokenForLp,
            pairReceived,
            (tokenForLp   * (10_000 - slippageBps)) / 10_000,
            (pairReceived * (10_000 - slippageBps)) / 10_000,
            address(this),
            block.timestamp + 300
        );

        _tokenInLp += tokenForLp;
    }

    function _removeLiquidity(uint256 tokenNeeded) internal {
        IUniswapV2Pair pair = _lpPair();
        uint256 lpBalance   = pair.balanceOf(address(this));
        if (lpBalance == 0) return;

        uint256 lpToBurn = tokenNeeded == type(uint256).max
            ? lpBalance
            : _lpTokensForAmount(tokenNeeded, lpBalance);

        if (lpToBurn > lpBalance) lpToBurn = lpBalance;

        pair.approve(address(router), lpToBurn);

        (uint256 tokenOut, uint256 pairOut) = router.removeLiquidity(
            address(stakingToken),
            address(pairToken),
            lpToBurn,
            0,
            0,
            address(this),
            block.timestamp + 300
        );

        // convert the pairToken leg back so the contract only ever holds WQIE
        if (pairOut > 0) {
            address[] memory path = new address[](2);
            path[0] = address(pairToken);
            path[1] = address(stakingToken);
            pairToken.safeIncreaseAllowance(address(router), pairOut);
            router.swapExactTokensForTokens(
                pairOut,
                _minOut(pairOut, path),
                path,
                address(this),
                block.timestamp + 300
            );
        }

        if (_tokenInLp > tokenOut) {
            _tokenInLp -= tokenOut;
        } else {
            _tokenInLp = 0;
        }
    }

    /// @dev Fees = how much the LP position is worth now vs what we put in.
    function _harvestLPFees() internal returns (uint256 fees) {
        uint256 currentLPValue = _estimateLPValue();
        if (currentLPValue <= _tokenInLp) return 0;

        uint256 unrealised = currentLPValue - _tokenInLp;

        // actually pull the gain out as tokens — an accounting number alone
        // can't be handed to stakers
        uint256 before = stakingToken.balanceOf(address(this));
        _removeLiquidity(unrealised);
        uint256 realised = stakingToken.balanceOf(address(this)) - before;

        _tokenInLp = _estimateLPValue(); // reset cost basis after the partial pull
        return realised;
    }

    // -------------------------------------------------------------------------
    // Internal — helpers
    // -------------------------------------------------------------------------

    function _lpPair() internal view returns (IUniswapV2Pair) {
        address pair = factory.getPair(address(stakingToken), address(pairToken));
        return IUniswapV2Pair(pair);
    }

    function _estimateLPValue() internal view returns (uint256 tokenValue) {
        IUniswapV2Pair pair = _lpPair();
        if (address(pair) == address(0)) return 0;
        uint256 lpBalance = pair.balanceOf(address(this));
        if (lpBalance == 0) return 0;

        uint256 totalSupply = pair.totalSupply();
        (uint112 r0, uint112 r1,) = pair.getReserves();

        // token0/token1 ordering isn't guaranteed, pick the WQIE side
        (uint256 tokenReserve,) = pair.token0() == address(stakingToken)
            ? (uint256(r0), uint256(r1))
            : (uint256(r1), uint256(r0));

        // our share of the WQIE reserve, x2 for both legs (assumes balanced pool)
        tokenValue = (2 * tokenReserve * lpBalance) / totalSupply;
    }

    function _lpTokensForAmount(
        uint256 tokenNeeded,
        uint256 lpBalance
    ) internal view returns (uint256) {
        uint256 totalValue = _estimateLPValue();
        if (totalValue == 0) return lpBalance;
        return (lpBalance * tokenNeeded) / totalValue;
    }
}
