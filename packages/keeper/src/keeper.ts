import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  defineChain,
  formatUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ── Chain definition ──────────────────────────────────────────────────────────

const qieTestnet = defineChain({
  id:   Number(process.env.CHAIN_ID ?? 1983),
  name: "QIE Testnet",
  nativeCurrency: { name: "QIE", symbol: "QIE", decimals: 18 },
  rpcUrls: { default: { http: [process.env.RPC_URL ?? "https://rpc1testnet.qie.digital/"] } },
});

// QIE testnet requires explicit gas price - auto-estimate is too low
const GAS_PRICE = 10_000_000_000n; // 10 gwei

// ── Config ────────────────────────────────────────────────────────────────────

function cfg(key: string): `0x${string}` {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v as `0x${string}`;
}

const STRATEGY_ADDR = cfg("YIELD_STRATEGY_ADDRESS");
const VAULT_ADDR    = cfg("YIELD_VAULT_ADDRESS");
const WQIE_ADDR     = cfg("WQIE_ADDRESS");
// Staking asset is native QIE held as WQIE - 18 decimals.
const TOKEN_DEC     = 18;
const SIMULATE_AMT  = BigInt(process.env.SIMULATE_YIELD_AMOUNT ?? "100000000000000000"); // 0.1 QIE default

// ── ABIs (minimal fragments) ─────────────────────────────────────────────────

const STRATEGY_ABI = parseAbi([
  "function harvestAndDistribute() external",
  "function injectYield(uint256 amount) external",
  "function reserveBalance() external view returns (uint256)",
  "function totalManagedAssets() external view returns (uint256)",
]);

const VAULT_ABI = parseAbi([
  "function totalStaked() external view returns (uint256)",
  "function totalYieldPool() external view returns (uint256)",
  "function globalBaseApyBps() external view returns (uint256)",
]);

const WQIE_ABI = parseAbi([
  "function balanceOf(address) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function deposit() external payable",
  "function transfer(address to, uint256 amount) external returns (bool)",
]);

// ── Clients ───────────────────────────────────────────────────────────────────

function getClients() {
  const privateKey = cfg("KEEPER_PRIVATE_KEY");
  const account    = privateKeyToAccount(privateKey);

  const publicClient = createPublicClient({
    chain:     qieTestnet,
    transport: http(qieTestnet.rpcUrls.default.http[0]),
  });

  const walletClient = createWalletClient({
    account,
    chain:     qieTestnet,
    transport: http(qieTestnet.rpcUrls.default.http[0]),
  });

  return { publicClient, walletClient, account };
}

// ── Health reads ──────────────────────────────────────────────────────────────

export async function readHealth() {
  const { publicClient } = getClients();

  const [totalStaked, totalYieldPool, globalBaseApyBps, reserveBalance] =
    await Promise.all([
      publicClient.readContract({ address: VAULT_ADDR,    abi: VAULT_ABI,    functionName: "totalStaked"       }),
      publicClient.readContract({ address: VAULT_ADDR,    abi: VAULT_ABI,    functionName: "totalYieldPool"    }),
      publicClient.readContract({ address: VAULT_ADDR,    abi: VAULT_ABI,    functionName: "globalBaseApyBps"  }),
      publicClient.readContract({ address: STRATEGY_ADDR, abi: STRATEGY_ABI, functionName: "reserveBalance"   }),
    ]);

  return { totalStaked, totalYieldPool, globalBaseApyBps, reserveBalance };
}

// ── Harvest (mainnet / real LP fees) ─────────────────────────────────────────

export async function runHarvest() {
  const { publicClient, walletClient, account } = getClients();
  console.log(`[keeper] Keeper address: ${account.address}`);

  const hash = await walletClient.writeContract({
    address:      STRATEGY_ADDR,
    abi:          STRATEGY_ABI,
    functionName: "harvestAndDistribute",
    gas:          300_000n,
    gasPrice:     GAS_PRICE,
  });

  console.log(`[keeper] harvestAndDistribute tx: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`[keeper] Confirmed in block ${receipt.blockNumber} - status: ${receipt.status}`);

  if (receipt.status === "reverted") {
    throw new Error("harvestAndDistribute reverted - check LP balance and roles");
  }

  console.log("[keeper] Harvest complete.");
}

// ── Simulate (testnet - funder wraps QIE→WQIE into strategy, keeper injects) ──

export async function runSimulate() {
  const { publicClient, walletClient, account } = getClients();
  console.log(`[keeper] Keeper address: ${account.address}`);

  // TARGET_APY_BPS mode: compute the daily injection from current totalStaked
  // so the vault APY lands on target regardless of pool size.
  //   vault receives 85% of injection; APY = vaultAmt × 365 × 10⁴ / totalStaked
  //   ⇒ injection = totalStaked × targetBps / 10⁴ / 365 / 0.85
  let injectAmt = SIMULATE_AMT;
  const targetBps = process.env.TARGET_APY_BPS ? BigInt(process.env.TARGET_APY_BPS) : 0n;
  if (targetBps > 0n) {
    const totalStaked = await publicClient.readContract({
      address: VAULT_ADDR, abi: VAULT_ABI, functionName: "totalStaked",
    }) as bigint;
    if (totalStaked === 0n) {
      console.log("[keeper] totalStaked is 0 - nothing to target, skipping injection.");
      return;
    }
    injectAmt = (totalStaked * targetBps * 10_000n) / (10_000n * 365n * 8_500n) + 1n;
    console.log(`[keeper] Target APY ${Number(targetBps) / 100}% on ${formatUnits(totalStaked, TOKEN_DEC)} QIE staked`);
  }
  console.log(`[keeper] Injecting ${formatUnits(injectAmt, TOKEN_DEC)} QIE as mock yield`);

  // Funder wraps native QIE → WQIE and sends it to the strategy.
  const funderKey = process.env.FUNDER_PRIVATE_KEY;
  if (!funderKey) throw new Error("FUNDER_PRIVATE_KEY not set - needed for simulate mode");
  const funder = privateKeyToAccount(funderKey as `0x${string}`);
  const funderClient = createWalletClient({ account: funder, chain: qieTestnet, transport: http(qieTestnet.rpcUrls.default.http[0]) });

  // Step 1a: wrap QIE → WQIE
  const wrapHash = await funderClient.writeContract({
    address:      WQIE_ADDR,
    abi:          WQIE_ABI,
    functionName: "deposit",
    value:        injectAmt,
    gas:          100_000n,
    gasPrice:     GAS_PRICE,
  });
  const wrapReceipt = await publicClient.waitForTransactionReceipt({ hash: wrapHash });
  if (wrapReceipt.status === "reverted") throw new Error("WQIE deposit reverted at " + WQIE_ADDR);

  // Step 1b: transfer WQIE into the strategy
  const xferHash = await funderClient.writeContract({
    address:      WQIE_ADDR,
    abi:          WQIE_ABI,
    functionName: "transfer",
    args:         [STRATEGY_ADDR, injectAmt],
    gas:          100_000n,
    gasPrice:     GAS_PRICE,
  });
  const xferReceipt = await publicClient.waitForTransactionReceipt({ hash: xferHash });
  if (xferReceipt.status === "reverted") throw new Error("WQIE transfer to strategy reverted");
  console.log(`[keeper] Wrapped & sent ${formatUnits(injectAmt, TOKEN_DEC)} QIE (as WQIE) into YieldStrategy`);

  // Step 2: Keeper calls injectYield - strategy splits and forwards to vault
  const injectHash = await walletClient.writeContract({
    address:      STRATEGY_ADDR,
    abi:          STRATEGY_ABI,
    functionName: "injectYield",
    args:         [injectAmt],
    gas:          300_000n,
    gasPrice:     GAS_PRICE,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: injectHash });
  console.log(`[keeper] injectYield confirmed in block ${receipt.blockNumber} - status: ${receipt.status}`);

  if (receipt.status === "reverted") {
    throw new Error("injectYield reverted - check KEEPER_ROLE and vault address");
  }

  // Breakdown: 85% stakers, 10% treasury, 5% insurance
  const toStakers   = (injectAmt * 8500n) / 10000n;
  const toProtocol  = (injectAmt * 1000n) / 10000n;
  const toInsurance = (injectAmt *  500n) / 10000n;

  console.log(`[keeper] Yield distributed:`);
  console.log(`  → Stakers (85%):   ${formatUnits(toStakers,   TOKEN_DEC)} QIE (WQIE) → YieldVault.totalYieldPool`);
  console.log(`  → Protocol (10%):  ${formatUnits(toProtocol,  TOKEN_DEC)} QIE (WQIE) → Treasury`);
  console.log(`  → Insurance (5%):  ${formatUnits(toInsurance, TOKEN_DEC)} QIE (WQIE) → InsuranceFund`);
}
