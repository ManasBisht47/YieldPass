import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  defineChain,
  formatUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const qieTestnet = defineChain({
  id: Number(process.env.CHAIN_ID ?? 1983),
  name: "QIE Testnet",
  nativeCurrency: { name: "QIE", symbol: "QIE", decimals: 18 },
  rpcUrls: { default: { http: [process.env.RPC_URL ?? "https://rpc1testnet.qie.digital/"] } },
});

const GAS_PRICE = 10_000_000_000n;

const ERC20_ABI = parseAbi([
  "function mint(address to, uint256 amount) external",
  "function balanceOf(address) external view returns (uint256)",
]);

async function main() {
  const TO      = process.argv[2] as `0x${string}`;
  const AMOUNT  = process.argv[3] ? BigInt(process.argv[3]) : 1000_000000n; // default 1000 QUSDC

  if (!TO) {
    console.error("Usage: npx ts-node src/mint-to-wallet.ts <address> [amount_in_units]");
    process.exit(1);
  }

  const funderKey = process.env.FUNDER_PRIVATE_KEY;
  if (!funderKey) throw new Error("FUNDER_PRIVATE_KEY not set");

  const funder = privateKeyToAccount(funderKey as `0x${string}`);
  const QUSDC  = process.env.QUSDC_ADDRESS as `0x${string}`;

  const publicClient = createPublicClient({ chain: qieTestnet, transport: http() });
  const funderClient = createWalletClient({ account: funder, chain: qieTestnet, transport: http() });

  const before = await publicClient.readContract({ address: QUSDC, abi: ERC20_ABI, functionName: "balanceOf", args: [TO] });
  console.log(`[mint] Balance before: ${formatUnits(before, 6)} QUSDC`);
  console.log(`[mint] Minting ${formatUnits(AMOUNT, 6)} QUSDC → ${TO}`);

  const hash = await funderClient.writeContract({
    address:      QUSDC,
    abi:          ERC20_ABI,
    functionName: "mint",
    args:         [TO, AMOUNT],
    gas:          100_000n,
    gasPrice:     GAS_PRICE,
  });

  console.log(`[mint] Tx sent: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (receipt.status === "reverted") {
    console.error("[mint] REVERTED — check funder has minter role");
    process.exit(1);
  }

  const after = await publicClient.readContract({ address: QUSDC, abi: ERC20_ABI, functionName: "balanceOf", args: [TO] });
  console.log(`[mint] Done! Balance after: ${formatUnits(after, 6)} QUSDC`);
}

main().catch(e => { console.error(e); process.exit(1); });
