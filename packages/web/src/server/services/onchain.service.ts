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

const MAX_RANGE = 9_999n;                 // QIE RPC caps eth_getLogs at 10k blocks
const DEEP_SCAN_BLOCKS = 300_000n;        // ~15 days of history - covers the launch/demo window
const SCAN_CONCURRENCY = 6;               // how many chunk queries to run at once

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
    const currentBlock = await client.getBlockNumber();
    const floor = currentBlock > DEEP_SCAN_BLOCKS ? currentBlock - DEEP_SCAN_BLOCKS : 0n;

    // Walk the history in 10k-block ranges (newest first). Filtering by the
    // indexed `master` keeps each query cheap, so we can cover real history
    // instead of just the last few hours - that earlier window kept missing
    // older commits once a wallet had been around for more than a day.
    const ranges: Array<[bigint, bigint]> = [];
    let to = currentBlock;
    while (to >= floor) {
      const from = to > MAX_RANGE ? to - MAX_RANGE : 0n;
      ranges.push([from < floor ? floor : from, to]);
      if (from <= floor) break;
      to = from - 1n;
    }

    const hashes = new Set<`0x${string}`>();
    for (let i = 0; i < ranges.length; i += SCAN_CONCURRENCY) {
      const batch = ranges.slice(i, i + SCAN_CONCURRENCY);
      const results = await Promise.all(
        batch.map(([from, to]) => getLogsChunk(addr, master, from, to).catch(() => [] as `0x${string}`[])),
      );
      results.flat().forEach(h => hashes.add(h));
    }
    return [...hashes];
  } catch { return []; }
}

export function computeProofTypeHash(proofType: string, master: Address): `0x${string}` {
  return keccak256(encodeAbiParameters(
    [{ type: "string" }, { type: "address" }],
    [proofType, master],
  ));
}

export { ACTIVE_CHAIN };
