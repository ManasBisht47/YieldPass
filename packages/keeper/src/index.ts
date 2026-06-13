import "dotenv/config";
import cron from "node-cron";
import { runHarvest, runSimulate, readHealth } from "./keeper";
import { syncPrice } from "./price-keeper";

const MODE_ONCE       = process.argv.includes("--once");
const MODE_SIMULATE   = process.argv.includes("--simulate");
const MODE_PRICE_ONLY = process.argv.includes("--price-only");
const CRON_EXPR     = process.env.HARVEST_CRON ?? "0 0 * * *";
const PRICE_CRON    = process.env.PRICE_CRON   ?? "*/5 * * * *"; // every 5 minutes

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function tick() {
  log("──── Keeper tick ────────────────────────────────");

  const health = await readHealth();
  log(`  totalStaked:   ${(Number(health.totalStaked) / 1e18).toFixed(4)} QIE`);
  log(`  totalYieldPool: ${(Number(health.totalYieldPool) / 1e18).toFixed(4)} QIE`);
  log(`  globalBaseAPY:  ${(Number(health.globalBaseApyBps) / 100).toFixed(2)} %`);
  log(`  strategyReserve: ${(Number(health.reserveBalance) / 1e18).toFixed(4)} QIE`);

  if (MODE_SIMULATE) {
    log("Mode: SIMULATE - injecting mock yield via injectYield()");
    await runSimulate();
  } else {
    log("Mode: HARVEST - calling harvestAndDistribute()");
    await runHarvest();
  }
}

if (MODE_PRICE_ONLY) {
  // Price-sync daemon only - ideal for testnet where harvest has no real LP fees
  log(`Price keeper started - cron: "${PRICE_CRON}" (>0.5% drift or 1h staleness triggers update)`);
  cron.schedule(PRICE_CRON, () => {
    syncPrice().catch(err => log(`PRICE ERROR: ${err.message}`));
  }, { timezone: "UTC" });
  syncPrice().catch(err => log(`Startup price sync error: ${err.message}`));
} else if (MODE_ONCE || MODE_SIMULATE) {
  tick()
    .then(() => process.exit(0))
    .catch(err => { console.error(err); process.exit(1); });
} else {
  log(`Keeper started - harvest cron: "${CRON_EXPR}", price cron: "${PRICE_CRON}"`);

  // Daily yield harvest
  cron.schedule(CRON_EXPR, () => {
    tick().catch(err => log(`ERROR: ${err.message}`));
  }, { timezone: "UTC" });

  // Oracle price sync - every 5 min, pushes only on >0.5% drift or 1h staleness
  cron.schedule(PRICE_CRON, () => {
    syncPrice().catch(err => log(`PRICE ERROR: ${err.message}`));
  }, { timezone: "UTC" });

  // Run both once on startup
  tick().catch(err => log(`Startup tick error: ${err.message}`));
  syncPrice().catch(err => log(`Startup price sync error: ${err.message}`));
}
