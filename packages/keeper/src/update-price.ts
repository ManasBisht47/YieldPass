// Manual one-shot price push. price-keeper.ts is the real automated loop; this
// is the "just set it to X right now" escape hatch, handy when testing or when
// you want to force a specific value.
//
//   npx ts-node src/update-price.ts        # pull from CoinGecko, push once
//   npx ts-node src/update-price.ts 3500   # push $3,500 by hand
//
// Needs ADMIN_PRIVATE_KEY (admin on PriceOracle) in packages/keeper/.env.

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

const ORACLE = (process.env.PRICE_ORACLE_ADDRESS ?? "0xD186F6E8E8653d23D1113A4da7b3Add806f25641") as `0x${string}`;

async function fetchEthPriceUsd(): Promise<number> {
  try {
    const resp = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
      { signal: AbortSignal.timeout(8000) }
    );
    const data = await resp.json() as { ethereum: { usd: number } };
    return data.ethereum.usd;
  } catch {
    console.warn("[update-price] CoinGecko fetch failed. Using fallback $3000.");
    return 3000;
  }
}

async function main() {
  const admin = privateKeyToAccount(
    (process.env.ADMIN_PRIVATE_KEY ?? process.env.FUNDER_PRIVATE_KEY) as `0x${string}`
  );

  const pub = createPublicClient({ chain: qieTestnet, transport: http() });
  const wal = createWalletClient({ account: admin, chain: qieTestnet, transport: http() });

  // Determine price: CLI arg overrides CoinGecko
  let priceUsd: number;
  const arg = process.argv[2];
  if (arg) {
    priceUsd = parseFloat(arg);
    if (isNaN(priceUsd) || priceUsd <= 0) {
      console.error("[update-price] Invalid price argument:", arg);
      process.exit(1);
    }
    console.log(`[update-price] Using manual price: $${priceUsd}`);
  } else {
    console.log("[update-price] Fetching ETH/USD from CoinGecko...");
    priceUsd = await fetchEthPriceUsd();
    console.log(`[update-price] ETH price: $${priceUsd}`);
  }

  // Convert to 8-decimal format (Chainlink-compatible)
  const priceOnChain = BigInt(Math.round(priceUsd * 1e8));

  // Read current on-chain price
  const [currentPrice, lastUpdate] = await Promise.all([
    pub.readContract({ address: ORACLE, abi: ORACLE_ABI, functionName: "getPrice" }),
    pub.readContract({ address: ORACLE, abi: ORACLE_ABI, functionName: "updatedAt" }),
  ]);

  const currentUsd = Number(currentPrice as bigint) / 1e8;
  const lastUpdateDate = new Date(Number(lastUpdate as bigint) * 1000).toISOString();

  console.log(`[update-price] Current on-chain price: $${currentUsd.toFixed(2)} (set at ${lastUpdateDate})`);
  console.log(`[update-price] New price             : $${priceUsd.toFixed(2)}`);

  // Push update
  const tx = await wal.writeContract({
    address: ORACLE,
    abi: ORACLE_ABI,
    functionName: "setPrice",
    args: [priceOnChain],
    gas: 80_000n,
    gasPrice: GAS_PRICE,
  });

  await pub.waitForTransactionReceipt({ hash: tx });
  console.log(`[update-price] Price updated to $${priceUsd}! tx: ${tx}`);
}

main().catch(e => { console.error(e); process.exit(1); });
