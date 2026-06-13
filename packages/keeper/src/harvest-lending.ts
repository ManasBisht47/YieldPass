// Hourly housekeeping for the lending side: sweep accrued protocol fees to the
// treasury once they're worth the gas, and print the current rates/util/supplier
// yield so we can eyeball the pool. Supplier interest itself flows automatically
// on repay() — this script is just the fee sweep + a status dump.
//
// Run: npx ts-node src/harvest-lending.ts   (cron: 0 * * * *)
// Needs ADMIN_PRIVATE_KEY (admin on LendingPool) in packages/keeper/.env.

import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  formatUnits,
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

const LENDING_ABI = parseAbi([
  "function totalSupplied() view returns (uint256)",
  "function totalBorrowed() view returns (uint256)",
  "function protocolFeeAccrued() view returns (uint256)",
  "function getCurrentBorrowRateBps() view returns (uint256)",
  "function getCurrentSupplyRateBps() view returns (uint256)",
  "function getUtilizationBps() view returns (uint256)",
  "function withdrawProtocolFee() external",
]);

const LENDING_POOL = (process.env.LENDING_POOL_ADDRESS ?? "0x09dBB5FA18f57c508696d9939C635d82B1F3bF66") as `0x${string}`;
const FEE_THRESHOLD = 1_000_000n; // 1 QUSDC (6 dec) — minimum to withdraw

async function main() {
  const admin = privateKeyToAccount(
    (process.env.ADMIN_PRIVATE_KEY ?? process.env.FUNDER_PRIVATE_KEY) as `0x${string}`
  );

  const pub = createPublicClient({ chain: qieTestnet, transport: http() });
  const wal = createWalletClient({ account: admin, chain: qieTestnet, transport: http() });

  console.log("[harvest-lending] Checking LendingPool state...");
  console.log(`[harvest-lending] Pool: ${LENDING_POOL}`);

  const [supplied, borrowed, feeAccrued, borrowRate, supplyRate, util] = await Promise.all([
    pub.readContract({ address: LENDING_POOL, abi: LENDING_ABI, functionName: "totalSupplied" }),
    pub.readContract({ address: LENDING_POOL, abi: LENDING_ABI, functionName: "totalBorrowed" }),
    pub.readContract({ address: LENDING_POOL, abi: LENDING_ABI, functionName: "protocolFeeAccrued" }),
    pub.readContract({ address: LENDING_POOL, abi: LENDING_ABI, functionName: "getCurrentBorrowRateBps" }),
    pub.readContract({ address: LENDING_POOL, abi: LENDING_ABI, functionName: "getCurrentSupplyRateBps" }),
    pub.readContract({ address: LENDING_POOL, abi: LENDING_ABI, functionName: "getUtilizationBps" }),
  ]);

  console.log(`\n  Total supplied  : ${formatUnits(supplied as bigint, 6)} QUSDC`);
  console.log(`  Total borrowed  : ${formatUnits(borrowed as bigint, 6)} QUSDC`);
  console.log(`  Utilisation     : ${(Number(util as bigint) / 100).toFixed(2)}%`);
  console.log(`  Borrow rate APY : ${(Number(borrowRate as bigint) / 100).toFixed(2)}%`);
  console.log(`  Supply rate APY : ${(Number(supplyRate as bigint) / 100).toFixed(2)}%`);
  console.log(`  Protocol fee    : ${formatUnits(feeAccrued as bigint, 6)} QUSDC`);

  if ((feeAccrued as bigint) >= FEE_THRESHOLD) {
    console.log(`\n[harvest-lending] Withdrawing ${formatUnits(feeAccrued as bigint, 6)} QUSDC protocol fee to treasury...`);
    const tx = await wal.writeContract({
      address: LENDING_POOL,
      abi: LENDING_ABI,
      functionName: "withdrawProtocolFee",
      gas: 100_000n,
      gasPrice: GAS_PRICE,
    });
    await pub.waitForTransactionReceipt({ hash: tx });
    console.log(`[harvest-lending] Done! tx: ${tx}`);
  } else {
    console.log(`\n[harvest-lending] Fee below threshold (${formatUnits(FEE_THRESHOLD, 6)} QUSDC). Skipping withdrawal.`);
  }

  console.log("[harvest-lending] Complete.");
}

main().catch(e => { console.error(e); process.exit(1); });
