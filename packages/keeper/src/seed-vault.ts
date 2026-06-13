// One-shot: stake a little native QIE from the funder so the vault isn't empty.
// Mainly needed right after a redeploy — TARGET_APY_BPS math divides by
// totalStaked, so something has to be staked before the keeper can target a rate.
//
// Usage: npx ts-node src/seed-vault.ts [amountQie=0.5]

import "dotenv/config";
import { createPublicClient, createWalletClient, http, parseAbi, parseEther, formatEther, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const qieTestnet = defineChain({
  id: Number(process.env.CHAIN_ID ?? 1983),
  name: "QIE Testnet",
  nativeCurrency: { name: "QIE", symbol: "QIE", decimals: 18 },
  rpcUrls: { default: { http: [process.env.RPC_URL ?? "https://rpc1testnet.qie.digital/"] } },
});

const GAS_PRICE = 10_000_000_000n;

const VAULT_ABI = parseAbi([
  "function stake(uint8 lockTier) external payable",
  "function totalStaked() view returns (uint256)",
]);

async function main() {
  const funder = privateKeyToAccount(process.env.FUNDER_PRIVATE_KEY as `0x${string}`);
  const VAULT  = process.env.YIELD_VAULT_ADDRESS as `0x${string}`;
  const amount = parseEther(process.argv[2] ?? "0.5");

  const pub = createPublicClient({ chain: qieTestnet, transport: http() });
  const wal = createWalletClient({ account: funder, chain: qieTestnet, transport: http() });

  const balance = await pub.getBalance({ address: funder.address });
  console.log(`[seed-vault] Vault: ${VAULT}`);
  console.log(`[seed-vault] Funder QIE balance: ${formatEther(balance)}`);
  console.log(`[seed-vault] Staking ${formatEther(amount)} QIE (FLEXIBLE, native — single tx)...`);

  const tx = await wal.writeContract({
    address: VAULT,
    abi: VAULT_ABI,
    functionName: "stake",
    args: [0],
    value: amount,
    gas: 500_000n,
    gasPrice: GAS_PRICE,
  });
  const receipt = await pub.waitForTransactionReceipt({ hash: tx });
  if (receipt.status === "reverted") throw new Error("stake() reverted");

  const total = await pub.readContract({ address: VAULT, abi: VAULT_ABI, functionName: "totalStaked" });
  console.log(`[seed-vault] Done! totalStaked: ${formatEther(total as bigint)} QIE`);
}

main().catch(e => { console.error(e); process.exit(1); });
