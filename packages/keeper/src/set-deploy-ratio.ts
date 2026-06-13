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

const STRATEGY_ABI = parseAbi([
  "function setDeployRatio(uint256 newRatioBps) external",
  "function deployRatioBps() external view returns (uint256)",
]);

async function main() {
  const newRatio = process.argv[2] ? BigInt(process.argv[2]) : 0n;

  const funderKey = process.env.FUNDER_PRIVATE_KEY;
  if (!funderKey) throw new Error("FUNDER_PRIVATE_KEY not set");

  const admin = privateKeyToAccount(funderKey as `0x${string}`);
  const STRATEGY = process.env.YIELD_STRATEGY_ADDRESS as `0x${string}`;

  const publicClient = createPublicClient({ chain: qieTestnet, transport: http() });
  const adminClient  = createWalletClient({ account: admin, chain: qieTestnet, transport: http() });

  const current = await publicClient.readContract({ address: STRATEGY, abi: STRATEGY_ABI, functionName: "deployRatioBps" });
  console.log(`[admin] Current deployRatioBps: ${current} (${Number(current) / 100}%)`);
  console.log(`[admin] Setting to: ${newRatio} (${Number(newRatio) / 100}%)`);

  const hash = await adminClient.writeContract({
    address:      STRATEGY,
    abi:          STRATEGY_ABI,
    functionName: "setDeployRatio",
    args:         [newRatio],
    gas:          100_000n,
    gasPrice:     GAS_PRICE,
  });

  console.log(`[admin] Tx: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (receipt.status === "reverted") {
    console.error("[admin] REVERTED");
    process.exit(1);
  }

  const updated = await publicClient.readContract({ address: STRATEGY, abi: STRATEGY_ABI, functionName: "deployRatioBps" });
  console.log(`[admin] Done. New deployRatioBps: ${updated}`);
}

main().catch(e => { console.error(e); process.exit(1); });
