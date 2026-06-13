// Keeps the on-chain PriceOracle roughly in line with real ETH/USD.
//
// We don't push every cycle (gas). Only when the market has drifted past
// DEVIATION_BPS or the on-chain price has gone stale past MAX_STALENESS_SEC -
// the staleness push is really a heartbeat so LendingPool's 3h freshness check
// never trips during quiet markets. If both feeds are down we just skip; better
// a slightly old price than a made-up one.
//
// Runs on the 5-min cron in index.ts, or standalone: npx ts-node src/price-keeper.ts

import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  defineChain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const qieTestnet = defineChain({
  id: Number(process.env.CHAIN_ID ?? 1983),
  name: "QIE Testnet",
  nativeCurrency: { name: "QIE", symbol: "QIE", decimals: 18 },
  rpcUrls: { default: { http: [process.env.RPC_URL ?? "https://rpc1testnet.qie.digital/"] } },
});

const GAS_PRICE = 10_000_000_000n;

const ORACLE_ABI = parseAbi([
  "function setPrice(uint256) external",
  "function getPrice() view returns (uint256)",
  "function updatedAt() view returns (uint256)",
]);

const ORACLE = (process.env.PRICE_ORACLE_ADDRESS ??
  "0xD186F6E8E8653d23D1113A4da7b3Add806f25641") as `0x${string}`;

// Push thresholds
const DEVIATION_BPS     = Number(process.env.PRICE_DEVIATION_BPS ?? 50);      // 0.5%
const MAX_STALENESS_SEC = Number(process.env.PRICE_MAX_STALENESS_SEC ?? 3600); // 1h heartbeat

// ── Price sources ─────────────────────────────────────────────────────────────

async function fromCoinGecko(): Promise<number | null> {
  try {
    const resp = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
      { signal: AbortSignal.timeout(8000) },
    );
    if (!resp.ok) return null;
    const data = (await resp.json()) as { ethereum?: { usd?: number } };
    const p = data?.ethereum?.usd;
    return typeof p === "number" && p > 0 ? p : null;
  } catch {
    return null;
  }
}

async function fromBinance(): Promise<number | null> {
  try {
    const resp = await fetch(
      "https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT",
      { signal: AbortSignal.timeout(8000) },
    );
    if (!resp.ok) return null;
    const data = (await resp.json()) as { price?: string };
    const p = parseFloat(data?.price ?? "");
    return Number.isFinite(p) && p > 0 ? p : null;
  } catch {
    return null;
  }
}

async function fetchMarketPrice(): Promise<{ price: number; source: string } | null> {
  const cg = await fromCoinGecko();
  if (cg !== null) return { price: cg, source: "coingecko" };
  const bn = await fromBinance();
  if (bn !== null) return { price: bn, source: "binance" };
  return null;
}

// ── Sync logic ────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[price-keeper] ${msg}`);
}

export async function syncPrice(): Promise<void> {
  const admin = privateKeyToAccount(
    (process.env.ADMIN_PRIVATE_KEY ?? process.env.FUNDER_PRIVATE_KEY) as `0x${string}`,
  );
  const pub = createPublicClient({ chain: qieTestnet, transport: http() });
  const wal = createWalletClient({ account: admin, chain: qieTestnet, transport: http() });

  const market = await fetchMarketPrice();
  if (!market) {
    log("All price feeds unreachable - skipping cycle (keeping last on-chain price).");
    return;
  }

  const [onChainRaw, updatedAtRaw] = await Promise.all([
    pub.readContract({ address: ORACLE, abi: ORACLE_ABI, functionName: "getPrice" }),
    pub.readContract({ address: ORACLE, abi: ORACLE_ABI, functionName: "updatedAt" }),
  ]);

  const onChainUsd  = Number(onChainRaw as bigint) / 1e8;
  const ageSec      = Math.floor(Date.now() / 1000) - Number(updatedAtRaw as bigint);
  const deviationBps = Math.abs((market.price - onChainUsd) / onChainUsd) * 10_000;

  log(`market $${market.price.toFixed(2)} (${market.source}) | on-chain $${onChainUsd.toFixed(2)} | drift ${(deviationBps / 100).toFixed(2)}% | age ${Math.floor(ageSec / 60)}m`);

  const needsUpdate = deviationBps >= DEVIATION_BPS || ageSec >= MAX_STALENESS_SEC;
  if (!needsUpdate) {
    log(`Within ${DEVIATION_BPS / 100}% band and fresh - no tx needed.`);
    return;
  }

  const priceOnChain = BigInt(Math.round(market.price * 1e8));
  const tx = await wal.writeContract({
    address: ORACLE,
    abi: ORACLE_ABI,
    functionName: "setPrice",
    args: [priceOnChain],
    gas: 80_000n,
    gasPrice: GAS_PRICE,
  });
  const receipt = await pub.waitForTransactionReceipt({ hash: tx });
  if (receipt.status === "reverted") throw new Error("setPrice reverted - check ADMIN role");
  log(`✓ Oracle updated to $${market.price.toFixed(2)} (tx ${tx.slice(0, 14)}…)`);
}

// Standalone mode
if (require.main === module) {
  syncPrice()
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); });
}
