# YieldPass

Reputation-based yield on QIE. Stake native QIE, earn from real QIEDex liquidity, and the more you build on-chain trust, the better your terms get — higher yield weighting on staking, better LTV and cheaper borrow rates on lending.

Live on QIE Mainnet (chain 1990).

---

## Why we built this

Most DeFi treats everyone the same. A first-day wallet and someone who's been honest with the protocol for months get the exact same rate. That's safe, but it leaves a lot on the table — there's no reason to behave well because good behaviour earns you nothing.

We wanted to flip that. YieldPass reads an on-chain reputation/credit score (gated by KYC + an explicit opt-in) and uses it to weight your share of the yield pool and to unlock better lending terms. No score? You still earn the base rate, nothing taken away. Build a score, opt in, and your capital just works harder.

The tricky part isn't the boost — it's making sure nobody can game it. A naive "reputation = more yield" design gets drained by whales and latecomers in a week. Most of the engineering effort went into the anti-abuse side, which is the part we're actually proud of.

## The two products

**Staking.** You stake native QIE in a single transaction. Under the hood it gets wrapped to WQIE and a portion (20%) is auto-deposited into the QIEDex WQIE/QUSDC pool as real liquidity — so the yield is actual trading-fee revenue, not a number we made up. The other 80% stays as liquid reserve so small unstakes return 1:1 instantly. Yield is distributed with a MasterChef-style accumulator (more on that below).

**Lending.** Supply QUSDC to earn interest, or borrow against collateral. Rates come from a jump-rate interest model (2% base, climbing with utilisation). Your reputation tier gives you a better loan-to-value ladder (60% → 75%) and a borrow-rate discount (up to 12%). High-score borrowers also get a short grace window before liquidation instead of getting instantly wiped.

## The interesting engineering

### Milking-proof yield (the bug we caught ourselves)

Our first vault used a shared yield pool with first-come-first-served accrual. While auditing on mainnet we realised a large wallet could stake right before a harvest and skim yield that earlier stakers had actually earned. It wasn't theft from the treasury — the treasury's isolated — but it was unfair distribution, which is just as bad for a yield product.

We rewrote the vault around a **MasterChef accumulator** (`accYieldPerShare`). Every staker only earns yield distributed *after* they join, weighted by their effective shares. We proved the fix on mainnet: a latecomer staking 5× the existing pool claimed exactly zero of the past yield. That's the behaviour you want.

### Effective shares

Your weight in the pool isn't just your principal. It's:

```
effective = (capped_principal × score_multiplier) + uncapped_principal, then × lock_bonus
```

- **Score multiplier** (1.0× → 1.5×) only applies if you've passed KYC and opted in.
- **Anti-whale cap** — the boost only applies up to a cap; stake above that earns base weighting. Whales can't buy the whole pool.
- **Lock bonus** rewards longer commitment.

### Treasury can't be drained

Protocol fees are swept to a fixed treasury address every harvest. Borrow/redeem accounting uses `balanceOf − protocolFeeAccrued` so fees and user funds never get confused, and the fee-withdrawal function is admin-only and hardcoded to the treasury. We went looking for a drain path during the audit and didn't find one.

### Price oracle with guardrails

The oracle updater key can only move the price ±20% per update (a compromised keeper can't print a fake price), while an admin can force-set in a real emergency. Borrow and liquidation both refuse to run if the price is older than 3 hours, so the protocol freezes safely instead of acting on stale data.

## Stack

- **Contracts** — Solidity 0.8.20, Hardhat (hardhat-deploy)
- **Frontend** — Next.js (App Router), wagmi + viem, Tailwind
- **Keepers** — TypeScript bots for price sync (CoinGecko), harvest, and liquidations
- **Chain** — QIE Mainnet, chain ID 1990, ~1–2s finality

Monorepo, three packages: `contracts`, `web`, `keeper`.

## Deployed contracts (QIE Mainnet)

| Contract | Address |
|---|---|
| YieldVault (accumulator) | `0x7ea4E80BeD86d19AacaFc2BB5034F80FFd40C032` |
| YieldStrategy | `0x67239F1Da1c6c9F615C7A5b472a2a522EEC0271f` |
| LendingPool | `0x38E5B71fA348BC4b702BFbD61780B1003e6AD57C` |
| PriceOracle | `0x98138ae95a7302DE36105fE801e033EF186384a6` |
| InterestRateModel | `0xA0b3f2818190b88396EcE892C08295cBA16FCdEB` |
| ReputationRegistry | `0x03a672E611ECa68a6A3D39014898667Fb7B93907` |
| NullifierRegistry | `0xFF67e614A49E6cde64951b7b879C8Beb84718D9c` |
| InsuranceFund | `0xb19c1D8bF4ec7657D59061006Be2166ef754A3c9` |

Tokens: WQIE `0x0087904D95BEe9E5F24dc8852804b547981A9139`, QUSDC `0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5`. Staking liquidity goes into the live QIEDex WQIE/QUSDC pool.

Explorer: https://mainnet.qie.digital/

## Running it locally

You'll need Node 18+ and a wallet with a little QIE for gas.

```bash
npm install

# frontend
cd packages/web
cp .env.local.example .env.local   # fill in addresses (defaults point at mainnet)
npm run dev                          # http://localhost:3000

# contracts (if you want to redeploy)
cd packages/contracts
npx hardhat deploy --network qie-mainnet --tags Launch
```

The keepers (`packages/keeper`) keep the oracle fresh and run harvests. For a demo the price keeper is the one to have running — otherwise the on-chain price drifts from the live feed:

```bash
cd packages/keeper
npm run price-keeper
```

## What works, and what's honest about it

Staking is the mature path and it's fully working on mainnet — stake, the QIEDex liquidity trigger, unstake, claim, and the reputation-weighted distribution are all verified with real (tiny) transactions on chain. Lending supply and redeem work too.

The one gap we'll call out plainly: the **borrow/repay** path is statically reviewed and deployed but we haven't run it end-to-end on mainnet yet (we couldn't get the test collateral token in time for the deadline). The guards are all there — flash-loan protection, LTV checks, the fresh-price requirement — it just hasn't had its live smoke test. Didn't want to claim otherwise.

Hardening still on the list for a real public launch (not needed for the demo): moving admin to a multisig, daemonising the keepers, and a third-party audit.

## Layout

```
packages/
  contracts/   Solidity + Hardhat deploy scripts
  web/         Next.js app
  keeper/      price / harvest / liquidation bots
shared/        ABIs shared between web and keeper
```
