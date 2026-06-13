import "dotenv/config";
import { createPublicClient, createWalletClient, http, parseAbi, defineChain, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const qieTestnet = defineChain({
  id: Number(process.env.CHAIN_ID ?? 1983),
  name: "QIE Testnet",
  nativeCurrency: { name: "QIE", symbol: "QIE", decimals: 18 },
  rpcUrls: { default: { http: [process.env.RPC_URL ?? "https://rpc1testnet.qie.digital/"] } },
});

const GAS_PRICE = 10_000_000_000n;
const AMOUNT    = 1000_000000n; // 1000 QUSDC (6 dec)

const ERC20_ABI  = parseAbi(["function approve(address,uint256) returns(bool)", "function balanceOf(address) view returns(uint256)", "function mint(address,uint256) external"]);
const LENDING_ABI = parseAbi(["function supply(uint256) external"]);

async function main() {
  const funder  = privateKeyToAccount(process.env.FUNDER_PRIVATE_KEY as `0x${string}`);
  const QUSDC   = process.env.QUSDC_ADDRESS as `0x${string}`;
  const LENDING = "0x09dBB5FA18f57c508696d9939C635d82B1F3bF66"; // LendingPool v2

  const pub = createPublicClient({ chain: qieTestnet, transport: http() });
  const wal = createWalletClient({ account: funder, chain: qieTestnet, transport: http() });

  // Mint 1000 QUSDC to funder first
  console.log("[fund] Minting 1000 QUSDC to funder...");
  const mintTx = await wal.writeContract({ address: QUSDC, abi: ERC20_ABI, functionName: "mint", args: [funder.address, AMOUNT], gas: 100_000n, gasPrice: GAS_PRICE });
  await pub.waitForTransactionReceipt({ hash: mintTx });
  console.log("[fund] Minted.");

  // Approve
  console.log("[fund] Approving LendingPool...");
  const approveTx = await wal.writeContract({ address: QUSDC, abi: ERC20_ABI, functionName: "approve", args: [LENDING, AMOUNT], gas: 100_000n, gasPrice: GAS_PRICE });
  await pub.waitForTransactionReceipt({ hash: approveTx });
  console.log("[fund] Approved.");

  // Supply (public supply side on v2)
  console.log("[fund] Supplying to LendingPool v2...");
  const depositTx = await wal.writeContract({ address: LENDING, abi: LENDING_ABI, functionName: "supply", args: [AMOUNT], gas: 150_000n, gasPrice: GAS_PRICE });
  const receipt = await pub.waitForTransactionReceipt({ hash: depositTx });
  console.log(`[fund] Done! tx: ${depositTx} - status: ${receipt.status}`);

  const bal = await pub.readContract({ address: QUSDC, abi: ERC20_ABI, functionName: "balanceOf", args: [LENDING] });
  console.log(`[fund] LendingPool QUSDC balance: ${formatUnits(bal, 6)} QUSDC`);
}

main().catch(e => { console.error(e); process.exit(1); });
