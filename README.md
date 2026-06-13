# YieldPass

Reputation-based yield on QIE. You stake native QIE and earn from real QIEDex
trading fees, and the more on-chain trust you build the better your terms get:
a bigger slice of the staking pool, higher LTV and cheaper rates on lending.

Live on QIE mainnet (chain 1990).

## why i built it

Most DeFi treats a brand new wallet and one that's behaved well for months
exactly the same. It's safe but there's no reason to be a good actor.

YieldPass reads an on-chain credit score (you pass KYC and opt in first) and uses
it to weight your share of the yield and to unlock better lending terms. No score
still earns the base rate, nothing taken away. Build a score and your capital just
works a bit harder.

The hard part isn't the boost, it's stopping people from gaming it. A naive
"reputation = more yield" design gets drained by whales and latecomers in a week,
so most of the work went into the anti-abuse side.

## two products

**Staking.** Stake native QIE in one transaction. Under the hood it wraps to WQIE
and 20% goes into the QIEDex WQIE/QUSDC pool as real liquidity, so the yield is
actual trading fees, not an emissions number. The rest stays as liquid reserve so
small unstakes are instant. Rewards are split with a MasterChef-style accumulator
(more on why below).

**Lending.** Supply QUSDC to earn interest, or borrow against WETH. Rates come
from a jump-rate model (2% base, climbs with utilisation). Your score moves your
LTV ladder (60 -> 75%) and gives a borrow-rate discount (up to 12%). High-score
borrowers also get a short grace window before liquidation instead of an instant
wipe.

## the parts i'm actually happy with

**Milking-proof yield.** The first vault used a shared pool with first-come
accrual. Testing on mainnet I noticed a big wallet could stake right before a
harvest and skim yield the earlier stakers had earned. Rewrote it around a
MasterChef accumulator so you only ever earn yield distributed after you joined.
Checked it on mainnet: a latecomer staking 5x the pool claimed zero of the past
yield.

**Effective shares.** Your weight isn't raw principal, it's
`principal -> score multiplier on the capped slice -> lock multiplier`. The score
boost only applies up to an anti-whale cap, so one whale can't buy the whole pool.

**Treasury can't be drained.** Fees are swept to a fixed treasury each harvest,
borrow/redeem accounting uses `balanceOf - protocolFeeAccrued`, and the fee
withdrawal is admin-only and hardcoded to the treasury.

**Oracle with guardrails.** The keeper key can only move the price +/-20% per
update, admin can force-set in an emergency, and borrow/liquidation refuse to run
on a price older than 3 hours so a dead keeper freezes things safely instead of
acting on stale data.

## stack

- contracts: Solidity 0.8.20, Hardhat
- web: Next.js (app router), wagmi + viem, Tailwind
- keeper: small TypeScript bots for price sync, harvest, liquidation
- chain: QIE mainnet, ~1-2s finality

Monorepo with three packages: `contracts`, `web`, `keeper`.

## deployed (QIE mainnet)

| Contract | Address |
|---|---|
| YieldVault | `0x7ea4E80BeD86d19AacaFc2BB5034F80FFd40C032` |
| YieldStrategy | `0x67239F1Da1c6c9F615C7A5b472a2a522EEC0271f` |
| LendingPool | `0x38E5B71fA348BC4b702BFbD61780B1003e6AD57C` |
| PriceOracle | `0x98138ae95a7302DE36105fE801e033EF186384a6` |
| InterestRateModel | `0xA0b3f2818190b88396EcE892C08295cBA16FCdEB` |
| ReputationRegistry | `0x03a672E611ECa68a6A3D39014898667Fb7B93907` |
| NullifierRegistry | `0xFF67e614A49E6cde64951b7b879C8Beb84718D9c` |
| InsuranceFund | `0xb19c1D8bF4ec7657D59061006Be2166ef754A3c9` |

Tokens: WQIE `0x0087904D95BEe9E5F24dc8852804b547981A9139`, QUSDC
`0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5`. Explorer: https://mainnet.qie.digital/

## running locally

```bash
npm install

cd packages/web
cp .env.example .env.local   # fill in the values
npm run dev                   # http://localhost:3000
```

If you need a fresh oracle price while developing:

```bash
cd packages/keeper && npm run price-keeper
```

## what works, and what doesn't yet

Staking is the solid path and it's fully working on mainnet: stake, the QIEDex
liquidity trigger, unstake, claim, and the reputation-weighted split are all
verified with real (tiny) transactions. Lending supply and redeem work too.

The honest gap: borrow/repay is built and reviewed but I haven't run it end to end
on mainnet yet, couldn't get test WETH together in time. The guards are all there
(flash-loan block, LTV checks, stale-price freeze), it just hasn't had its live
smoke test.

KYC currently goes through the QIEPass sandbox, so new users verify with a testnet
DID. Everything else (staking, lending, scores) is on mainnet.

See `TODO.md` for the running list.

## layout

```
packages/
  contracts/   Solidity + Hardhat deploy scripts
  web/         Next.js app
  keeper/      price / harvest / liquidation bots
shared/        ABIs shared between web and keeper
```
