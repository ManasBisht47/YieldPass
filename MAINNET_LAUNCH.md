# YieldPass — Mainnet Launch Checklist

Verified live on QIE Mainnet (chain 1990, RPC https://rpc1mainnet.qie.digital/):
- WQIE  `0x0087904D95BEe9E5F24dc8852804b547981A9139` ✓
- QUSDC `0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5` ✓
- QIEDex Router `0x08cd2e72e156D8563B4351eb4065C262A9f553Ef` ✓
- QIEDex Factory `0x8E23128a5511223bE6c0d64106e2D4508C08398C` ✓
- WETH  `0x95322ccB3fb8dDefD210805EE18662762a0bc4A2` ✓
- **WQIE/QUSDC pool EXISTS** `0x73a3cCF7da7e473ed2e9994aE764f0E30f4e4DFe`
  (52,333 WQIE + 9,977 QUSDC → QIE ≈ $0.19) — real liquidity, staking will provide here.

These are already hard-coded in the deploy script. Nothing for you to wire.

---

## WHAT YOU PROVIDE

### A. Three wallets (give me private keys; I never commit them)

| Wallet | Role | Fund with |
|---|---|---|
| **Deployer** | Deploys all 8 contracts, becomes initial admin | **~2 QIE** (gas ≈ 0.25 QIE for full deploy, rest is headroom) |
| **Oracle/Keeper** | Pushes price, harvests fees, runs liquidations, **signs reputation scores** | **~1 QIE** (gas only) |
| **Treasury** | Just an address — receives 10% protocol fee | nothing (can even be your deployer/MetaMask) |

> Deployer & Oracle can be brand-new wallets. Treasury can be any address you control.

### B. Test funds — tiny, in YOUR test wallet (e.g. MetaMask)

We smoke-test every operation with minimum amounts:

| Asset | Amount | Tests |
|---|---|---|
| **QIE** | ~5–10 QIE | stake / unstake / claim + the real QIEDex liquidity path |
| **QUSDC** | ~2 QUSDC | seed lending pool + supply/redeem |
| **WETH** | ~0.001 WETH | collateral to test borrow / repay |
| **QIE (gas)** | ~1 QIE | transaction gas |

> Basic stake works at **0.0001 QIE**. But to exercise the *liquidity-provision* path
> (swap + addLiquidity on the real pool) we need a few QIE so the 20% slice isn't dust.

### C. Reputation service keys (you already have testnet ones — confirm they work on mainnet)

- `RECLAIM_APP_ID` + `RECLAIM_APP_SECRET` — from https://dev.reclaimprotocol.org/
- `QIEPASS_PUBLIC_KEY` + `QIEPASS_SECRET_KEY` — QIEPass partner section

### D. Later (after everything is verified working) — optional but strongly recommended

- A **Gnosis Safe multisig address** to take over admin (so no single key controls the protocol).
  Handover is one script: `transfer-admin.ts`.

---

## WHAT I DO (once you hand over A–C)

1. Put your keys/addresses in `contracts/.env` + `web/.env.local` (never committed).
2. **Deploy** the 8 hardened contracts to mainnet — one command, auto-uses the real
   QIEDex/WQIE/QUSDC. Cost ≈ 0.25 QIE gas.
3. **Wire** all roles (scorer, keeper, vault, strategy, lending) + sync ABIs + frontend env.
4. **Calibrate** anti-whale caps to live QIE price (~$0.19 → e.g. 50k QIE = $9.5k cap).
5. **Smoke test, smallest amounts**, in this order:
   - Stake 0.0001 QIE → unstake → claim   (deployRatio = 0, no LP yet)
   - Turn LP on (`setDeployRatio` small, e.g. 5%) → stake ~5 QIE → confirm liquidity
     landed in the QIEDex pool → unstake → confirm it pulls back out
   - Supply 1 QUSDC → borrow ~0.05 QUSDC against 0.001 WETH → repay → redeem
   - Liquidation bot dry-run against a deliberately thin position
6. **Start keeper bots** (price / harvest / liquidation) via pm2.
7. Hand admin to your multisig (step D) and rotate any keys that touched `.env`.

Audit happens **after** this, once every operation is proven on mainnet — as you decided.

---

## Quick reference — minimum test amounts

| Operation | Minimum that works |
|---|---|
| Stake (no LP) | 0.0001 QIE |
| Stake (with LP) | ~2–5 QIE (so 20% slice swaps cleanly) |
| Supply QUSDC | 0.000001 QUSDC (1 unit) — use ~1 for realism |
| Borrow | needs WETH collateral; 0.001 WETH ≈ $1.65 → borrow up to ~$1 |
| Gas per tx | ~0.001–0.005 QIE |
