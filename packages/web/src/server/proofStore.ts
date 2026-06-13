// In-memory store for pending Reclaim proof sessions.
// Primary flow: status endpoint polls Reclaim's status URL directly.
// Fallback: Reclaim calls our callback URL (works in production, not localhost).
// TTL: 10 minutes. Entries are evicted lazily on read or write.

export interface OracleResult {
  // null on a re-sync - the proof is already committed, only the score is signed
  commitProof: {
    proofHash:          `0x${string}`;
    proofTypeHash:      `0x${string}`;
    documentNullifier:  `0x${string}`;
    signature:          `0x${string}`;
    nonce:              string;
  } | null;
  updateScore: {
    score:     number;
    signature: `0x${string}`;
    nonce:     string;
  };
  delta:         number;
  previousScore: number;
  newScore:      number;
  scoreOnly?:    boolean;
}

interface Entry {
  walletAddress:    string;
  proofType:        string;
  reclaimStatusUrl: string;  // Reclaim's own status URL for direct polling
  result?:          OracleResult;
  error?:           string;
  createdAt:        number;
}

const TTL_MS = 30 * 60 * 1000; // 30 minutes - user may take time to complete proof flow
const store  = new Map<string, Entry>();

function evict() {
  const now = Date.now();
  for (const [key, val] of store) {
    if (now - val.createdAt > TTL_MS) store.delete(key);
  }
}

export function createSession(
  sessionId:        string,
  walletAddress:    string,
  proofType:        string,
  reclaimStatusUrl: string,
) {
  evict();
  store.set(sessionId, { walletAddress, proofType, reclaimStatusUrl, createdAt: Date.now() });
}

export function setResult(sessionId: string, result: OracleResult) {
  const entry = store.get(sessionId);
  if (entry) entry.result = result;
}

export function setError(sessionId: string, error: string) {
  const entry = store.get(sessionId);
  if (entry) entry.error = error;
}

export function getEntry(sessionId: string): Entry | undefined {
  evict();
  return store.get(sessionId);
}
