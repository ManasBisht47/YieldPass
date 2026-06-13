# YieldPass - Operations Runbook

## Processes (production)

Three keeper processes must run 24/7. Use pm2 on a server (never a laptop):

```bash
cd packages/keeper
npm i -g pm2 ts-node
pm2 start ecosystem.config.js
pm2 save && pm2 startup        # survive reboots
pm2 logs                       # tail everything
```

| Process | What it does | If it dies |
|---|---|---|
| `yp-price-keeper` | Pushes ETH/USD to PriceOracle every 5 min (±0.5% drift or 1h heartbeat) | After 3h staleness, LendingPool borrow/liquidate revert (fail-safe) - lending freezes but no mispricing |
| `yp-harvest` | Daily `harvestAndDistribute()` - realises QIEDex LP fees, splits 85/10/5 | APY stops updating; stakers' accrual continues against existing yield pool |
| `yp-liquidation-bot` | Scans borrowers every 5 min, liquidates HF < 1.0 | Underwater positions persist - pool absorbs more risk per hour it's down |

The liquidation bot wallet must hold QUSDC working capital (it repays debt,
receives collateral + 5% bonus).

## One-shot commands

```bash
npm run price-sync                       # force one oracle sync now
npm run simulate                         # testnet: inject yield at TARGET_APY_BPS
npx ts-node src/liquidation-bot.ts       # one liquidation scan
npx ts-node src/seed-vault.ts 0.5        # stake QIE from funder
npx ts-node src/fund-lending.ts          # seed lending pool supply
```

## Mainnet launch checklist

1. **Deploy**: `PRICE_UPDATER_ADDRESS=0x<priceBot> npx hardhat deploy --network qie-mainnet --tags Hardened`
   (uses canonical WQIE/QUSDC/QIEDex router automatically)
2. **Calibrate caps** to live QIE price: `YieldVaultQIE2.setBoostedCaps(std, whale, threshold)`
3. **Enable LP deployment**: `YieldStrategyQIE2.setDeployRatio(2000)` (20%) - start small, raise gradually
4. **Set slippage** if pool is thin: `setSlippage(...)` (default 100 = 1%)
5. **Sync oracle** to market: `npx ts-node src/update-price.ts`
6. **Transfer admin to multisig** (after everything verified):
   ```bash
   NEW_ADMIN=0x<GnosisSafe> npx hardhat run scripts/transfer-admin.ts --network qie-mainnet
   # verify the Safe can execute an admin call, then:
   NEW_ADMIN=0x<GnosisSafe> RENOUNCE=1 npx hardhat run scripts/transfer-admin.ts --network qie-mainnet
   ```
7. **Rotate every key** that ever lived in a `.env` file. Use a secrets manager.
8. **Start pm2** processes on the server, `pm2 save`.
9. Smoke test with small amounts: stake → claim → unstake; supply → borrow → repay → redeem.
10. External audit before raising deposit caps / marketing push.

## Security model (post-hardening)

- **Oracle**: keeper key can only move price ±20% per update (`UPDATER_ROLE`);
  unbounded `forceSetPrice` is admin (multisig) only. LendingPool refuses to
  borrow/liquidate on a price older than 3 hours.
- **Collateral**: WETH sits in LendingPool; no admin function can withdraw user
  collateral. `withdrawProtocolFee` only moves accrued protocol interest share.
- **Strategy swaps**: minOut enforced from on-chain quote × (1 − slippageBps);
  a sandwiched pool reverts the tx instead of eating the loss.
- **Vault**: native QIE only enters via `stake()`; `receive()` rejects everything
  except WQIE unwrapping. ReentrancyGuard on all state-changing paths.
- **Admin**: single EOA on testnet → Gnosis Safe on mainnet via transfer-admin.ts.
