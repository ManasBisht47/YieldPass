import { createPublicClient, http, parseAbiItem, keccak256, encodeAbiParameters, type Address } from "viem";
import { qieTestnet, qieMainnet } from "@/lib/qie-chain";
import YieldVaultABI          from "../../../../../shared/abis/YieldVault.json";
import NullifierRegistryABI   from "../../../../../shared/abis/NullifierRegistry.json";
import ReputationRegistryABI  from "../../../../../shared/abis/ReputationRegistry.json";

const ACTIVE_CHAIN  = process.env.NEXT_PUBLIC_ACTIVE_CHAIN === "qie-mainnet" ? qieMainnet : qieTestnet;
const RPC_URL       = ACTIVE_CHAIN.rpcUrls.default.http[0];

const client = createPublicClient({
  chain:     ACTIVE_CHAIN,
  transport: http(RPC_URL),
});

// ── Contract addresses from env ───────────────────────────────────────────────
function getAddress(key: string): Address {
  const v = process.env[key];
  if (!v) return "0x0000000000000000000000000000000000000000";
  return v as Address;
}

const VAULT_ADDR    = () => getAddress("NEXT_PUBLIC_YIELD_VAULT_ADDRESS");
const NULLIFIER_ADDR = () => getAddress("NEXT_PUBLIC_NULLIFIER_REGISTRY_ADDRESS");
const REPUTATION_ADDR = () => getAddress("NEXT_PUBLIC_REPUTATION_REGISTRY_ADDRESS");

// ── Reads ─────────────────────────────────────────────────────────────────────

export async function readGlobalBaseApyBps(): Promise<bigint> {
  const addr = VAULT_ADDR();
  if (addr === "0x0000000000000000000000000000000000000000") return 0n;

  return client.readContract({
    address: addr,
    abi:     YieldVaultABI.abi,
    functionName: "globalBaseApyBps",
  }) as Promise<bigint>;
}

export async function readTotalStaked(): Promise<bigint> {
  const addr = VAULT_ADDR();
  if (addr === "0x0000000000000000000000000000000000000000") return 0n;

  return client.readContract({
    address: addr,
    abi:     YieldVaultABI.abi,
    functionName: "totalStaked",
  }) as Promise<bigint>;
}

export async function readLockStatus(wallet: Address): Promise<{ isLocked: boolean; masterWallet: Address }> {
  const addr = NULLIFIER_ADDR();
  if (addr === "0x0000000000000000000000000000000000000000") {
    return { isLocked: false, masterWallet: "0x0000000000000000000000000000000000000000" };
  }

  const [isLocked, masterWallet] = (await client.readContract({
    address: addr,
    abi:     NullifierRegistryABI.abi,
    functionName: "getLockStatus",
    args:    [wallet],
  })) as [boolean, Address];

  return { isLocked, masterWallet };
}

export async function readIsNonceUsed(nonce: bigint): Promise<boolean> {
  const addr = REPUTATION_ADDR();
  if (addr === "0x0000000000000000000000000000000000000000") return false;

  return client.readContract({
    address: addr,
    abi:     ReputationRegistryABI.abi,
    functionName: "isNonceUsed",
    args:    [nonce],
  }) as Promise<boolean>;
}

export async function readEffectiveAPY(userAddress: Address): Promise<bigint> {
  const addr = VAULT_ADDR();
  if (addr === "0x0000000000000000000000000000000000000000") return 0n;

  return client.readContract({
    address: addr,
    abi:     YieldVaultABI.abi,
    functionName: "getEffectiveAPY",
    args:    [userAddress],
  }) as Promise<bigint>;
}

export async function readCreditScore(wallet: Address): Promise<number> {
  const addr = REPUTATION_ADDR();
  if (addr === "0x0000000000000000000000000000000000000000") return 0;
  try {
    const score = await client.readContract({
      address: addr,
      abi:     ReputationRegistryABI.abi,
      functionName: "getCreditScore",
      args:    [wallet],
    });
    return Number(score as bigint);
  } catch { return 0; }
}

export async function readIsKYCVerified(wallet: Address): Promise<boolean> {
  const addr = REPUTATION_ADDR();
  if (addr === "0x0000000000000000000000000000000000000000") return false;
  try {
    return await client.readContract({
      address: addr,
      abi:     ReputationRegistryABI.abi,
      functionName: "isKYCVerified",
      args:    [wallet],
    }) as boolean;
  } catch { return false; }
}

export async function readIsProofUsed(proofHash: `0x${string}`): Promise<boolean> {
  const addr = REPUTATION_ADDR();
  if (addr === "0x0000000000000000000000000000000000000000") return false;
  try {
    return await client.readContract({
      address: addr,
      abi:     ReputationRegistryABI.abi,
      functionName: "isProofUsed",
      args:    [proofHash],
    }) as boolean;
  } catch { return false; }
}

export async function readIsDocumentNullifierUsed(documentNullifier: `0x${string}`): Promise<boolean> {
  const addr = REPUTATION_ADDR();
  if (addr === "0x0000000000000000000000000000000000000000") return false;
  try {
    return await client.readContract({
      address: addr,
      abi:     ReputationRegistryABI.abi,
      functionName: "isDocumentNullifierUsed",
      args:    [documentNullifier],
    }) as boolean;
  } catch { return false; }
}

const ZK_COMMITTED_EVENT = parseAbiItem(
  "event ZKProofCommitted(address indexed master, bytes32 indexed proofHash, bytes32 proofTypeHash)",
);

const MAX_RANGE = 9_999n;
const AVG_BLOCK_SECS = 4.3;

async function getLogsChunk(
  addr: Address,
  master: Address,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<`0x${string}`[]> {
  const logs = await client.getLogs({
    address: addr,
    event:   ZK_COMMITTED_EVENT,
    args:    { master },
    fromBlock,
    toBlock,
  });
  return logs
    .map(l => l.args.proofTypeHash as `0x${string}` | undefined)
    .filter((h): h is `0x${string}` => !!h);
}

export async function readCommittedProofTypeHashes(master: Address): Promise<`0x${string}`[]> {
  const addr = REPUTATION_ADDR();
  if (addr === "0x0000000000000000000000000000000000000000") return [];

  try {
    const [currentBlock, latestBlock] = await Promise.all([
      client.getBlockNumber(),
      client.getBlock({ blockTag: "latest" }),
    ]);
    const currentTimestamp = Number(latestBlock.timestamp);

    // Get the master's profile to find scoreUpdatedAt timestamp
    let scoreUpdatedAt = 0;
    try {
      const profile = await client.readContract({
        address: addr,
        abi:     ReputationRegistryABI.abi,
        functionName: "getProfile",
        args:    [master],
      }) as { scoreUpdatedAt: number };
      scoreUpdatedAt = Number(profile.scoreUpdatedAt);
    } catch { /* ignore */ }

    // Always query the last 9,999 blocks (covers ~12 hours)
    const recentFrom = currentBlock > MAX_RANGE ? currentBlock - MAX_RANGE : 0n;
    const chunks: Array<[bigint, bigint]> = [[recentFrom, currentBlock]];

    // If scoreUpdatedAt is known and the proof was submitted before the recent window,
    // estimate the block and add a targeted query around it
    if (scoreUpdatedAt > 0) {
      const secsBack = currentTimestamp - scoreUpdatedAt;
      const blocksBack = BigInt(Math.round(secsBack / AVG_BLOCK_SECS));
      const estimatedBlock = currentBlock > blocksBack ? currentBlock - blocksBack : 0n;

      // Is it outside the already-covered recent window?
      if (estimatedBlock < recentFrom) {
        const halfWindow = 5_000n;
        const from = estimatedBlock > halfWindow ? estimatedBlock - halfWindow : 0n;
        const to   = estimatedBlock + halfWindow < currentBlock ? estimatedBlock + halfWindow : currentBlock;
        chunks.push([from, to]);
      }
    }

    // Run all chunks in parallel
    const results = await Promise.all(
      chunks.map(([from, to]) => getLogsChunk(addr, master, from, to).catch(() => [] as `0x${string}`[])),
    );

    return [...new Set(results.flat())];
  } catch { return []; }
}

export function computeProofTypeHash(proofType: string, master: Address): `0x${string}` {
  return keccak256(encodeAbiParameters(
    [{ type: "string" }, { type: "address" }],
    [proofType, master],
  ));
}

export { ACTIVE_CHAIN };
