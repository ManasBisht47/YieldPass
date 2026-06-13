// Watches LendingPool borrowers and clears out anyone who's gone underwater,
// otherwise bad debt just sits in the pool. Pulls borrower addresses from
// Borrowed events, checks getBorrowerPosition for each, and calls liquidate()
// on the ones that are liquidatable.
//
// The keeper wallet needs QUSDC on hand to repay the debt - it gets the
// collateral plus a 5% bonus back. Score>800 borrowers have a 2h grace window
// that the contract enforces, so those just revert and we pick them up later.
//
// One-shot: npx ts-node src/liquidation-bot.ts
// Daemon:   npx ts-node src/liquidation-bot.ts --daemon   (5-min loop)

import "dotenv/config";
import {
  createPublicClient, createWalletClient, http, parseAbi, formatUnits, defineChain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const qieTestnet = defineChain({
  id: Number(process.env.CHAIN_ID ?? 1983),
  name: "QIE Testnet",
  nativeCurrency: { name: "QIE", symbol: "QIE", decimals: 18 },
  rpcUrls: { default: { http: [process.env.RPC_URL ?? "https://rpc1testnet.qie.digital/"] } },
});

const GAS_PRICE = 10_000_000_000n;
const LENDING_POOL = process.env.LENDING_POOL_ADDRESS as `0x${string}`;
const QUSDC        = process.env.QUSDC_ADDRESS as `0x${string}`;
const SCAN_BLOCKS  = 50_000n; // total lookback window per scan
const CHUNK        = 9_999n;  // QIE RPC caps eth_getLogs at 10k blocks

const LENDING_ABI = parseAbi([
  "event Borrowed(address indexed user, uint256 collateral, uint256 amount, uint256 ltvBps, uint256 borrowRateBps)",
  "function getBorrowerPosition(address) view returns (uint256,uint256,uint256,uint256,uint256,uint256,uint256,bool)",
  "function liquidate(address borrower) external",
]);

const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
]);

function log(msg: string) {
  console.log(`[liq-bot ${new Date().toISOString()}] ${msg}`);
}

async function scanAndLiquidate() {
  const keeper = privateKeyToAccount(
    (process.env.KEEPER_PRIVATE_KEY ?? process.env.FUNDER_PRIVATE_KEY) as `0x${string}`,
  );
  const pub = createPublicClient({ chain: qieTestnet, transport: http() });
  const wal = createWalletClient({ account: keeper, chain: qieTestnet, transport: http() });

  // 1. Collect borrower addresses from events (chunked - RPC caps range at 10k)
  const latest = await pub.getBlockNumber();
  const fromBlock = latest > SCAN_BLOCKS ? latest - SCAN_BLOCKS : 0n;
  const found = new Set<`0x${string}`>();
  for (let start = fromBlock; start <= latest; start += CHUNK + 1n) {
    const end = start + CHUNK > latest ? latest : start + CHUNK;
    const logs = await pub.getLogs({
      address: LENDING_POOL,
      event: LENDING_ABI[0],
      fromBlock: start,
      toBlock: end,
    });
    for (const l of logs) found.add(l.args.user as `0x${string}`);
  }
  const borrowers = [...found];
  log(`Scanned blocks ${fromBlock}-${latest}: ${borrowers.length} unique borrower(s)`);

  // 2. Check each position
  for (const borrower of borrowers) {
    const pos = await pub.readContract({
      address: LENDING_POOL, abi: LENDING_ABI,
      functionName: "getBorrowerPosition", args: [borrower],
    }) as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, boolean];

    const principal = pos[1], interest = pos[2], hfBps = pos[6], liquidatable = pos[7];
    if (principal === 0n) continue;

    const debt = principal + interest;
    log(`  ${borrower.slice(0, 10)}… debt=${formatUnits(debt, 6)} QUSDC HF=${(Number(hfBps) / 10000).toFixed(2)}x liquidatable=${liquidatable}`);

    if (!liquidatable) continue;

    // 3. Ensure the liquidator can cover the repayment
    const balance = await pub.readContract({
      address: QUSDC, abi: ERC20_ABI, functionName: "balanceOf", args: [keeper.address],
    }) as bigint;
    if (balance < debt) {
      log(`  ⚠ insufficient QUSDC to liquidate (need ${formatUnits(debt, 6)}, have ${formatUnits(balance, 6)}) - skipping`);
      continue;
    }

    try {
      const approveTx = await wal.writeContract({
        address: QUSDC, abi: ERC20_ABI, functionName: "approve",
        args: [LENDING_POOL, debt], gas: 100_000n, gasPrice: GAS_PRICE,
      });
      await pub.waitForTransactionReceipt({ hash: approveTx });

      const tx = await wal.writeContract({
        address: LENDING_POOL, abi: LENDING_ABI, functionName: "liquidate",
        args: [borrower], gas: 600_000n, gasPrice: GAS_PRICE,
      });
      const r = await pub.waitForTransactionReceipt({ hash: tx });
      log(`  ✓ LIQUIDATED ${borrower} - ${r.status} (tx ${tx.slice(0, 14)}…)`);
    } catch (e: any) {
      // GraceShieldActive etc. - contract enforces, bot retries next cycle
      log(`  liquidation reverted (${e.shortMessage ?? e.message?.slice(0, 80)}) - will retry next cycle`);
    }
  }
  log("Cycle complete.");
}

if (process.argv.includes("--daemon")) {
  log("Liquidation bot daemon started - every 5 minutes");
  scanAndLiquidate().catch(e => log(`ERROR: ${e.message?.slice(0, 120)}`));
  setInterval(() => {
    scanAndLiquidate().catch(e => log(`ERROR: ${e.message?.slice(0, 120)}`));
  }, 5 * 60 * 1000);
} else {
  scanAndLiquidate()
    .then(() => process.exit(0))
    .catch(e => { console.error(e); process.exit(1); });
}
