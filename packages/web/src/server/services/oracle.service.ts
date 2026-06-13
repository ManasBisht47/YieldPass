// Oracle service — shared signing logic used by proof/submit, proof/callback, zkproof/status.
//
// Centralising here prevents the three routes diverging silently and ensures
// any fix (nonce collision, score formula, EIP-712 struct) applies everywhere.

import { privateKeyToAccount } from "viem/accounts";
import type { Address }        from "viem";
import {
  ACTIVE_CHAIN,
  readIsNonceUsed,
  readCreditScore,
  readIsProofUsed,
  readIsDocumentNullifierUsed,
  readCommittedProofTypeHashes,
  computeProofTypeHash,
} from "./onchain.service";
import {
  verifyProof,
  CREDIT_PROOF_TYPES,
  BUREAU_SCORE_MAX,
  type ReclaimProofType,
} from "./reclaim.service";
import {
  scoreCreditBureau,
  scoreTelecomProof,
} from "./scoring.service";
import type { OracleResult } from "../proofStore";

// ── Account ───────────────────────────────────────────────────────────────────

export function getOracleAccount() {
  const key = process.env.ORACLE_PRIVATE_KEY;
  if (!key) throw new Error("ORACLE_PRIVATE_KEY not set");
  return privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`);
}

// ── EIP-712 domain ────────────────────────────────────────────────────────────

export function getEip712Domain() {
  return {
    name:              "YieldPass:ReputationRegistry" as const,
    version:           "1" as const,
    chainId:           ACTIVE_CHAIN.id,
    verifyingContract: (process.env.NEXT_PUBLIC_REPUTATION_REGISTRY_ADDRESS
      ?? "0x0000000000000000000000000000000000000000") as Address,
  };
}

// ── Nonce ─────────────────────────────────────────────────────────────────────

export async function freshNonce(): Promise<bigint> {
  for (let i = 0; i < 5; i++) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const n     = bytes.reduce((acc, b) => (acc << 8n) | BigInt(b), 0n);
    let used = false;
    try { used = await readIsNonceUsed(n); } catch { /* not deployed */ }
    if (!used) return n;
  }
  throw new Error("Could not generate unused nonce after 5 attempts");
}

// ── Signatures ────────────────────────────────────────────────────────────────

export async function signCommitProof(
  master:            Address,
  proofHash:         `0x${string}`,
  proofTypeHash:     `0x${string}`,
  documentNullifier: `0x${string}`,
  nonce:             bigint,
): Promise<`0x${string}`> {
  return getOracleAccount().signTypedData({
    domain: getEip712Domain(),
    types: {
      CommitProof: [
        { name: "master",            type: "address" },
        { name: "proofHash",         type: "bytes32" },
        { name: "proofTypeHash",     type: "bytes32" },
        { name: "documentNullifier", type: "bytes32" },
        { name: "nonce",             type: "uint256" },
      ],
    },
    primaryType: "CommitProof",
    message:     { master, proofHash, proofTypeHash, documentNullifier, nonce },
  });
}

export async function signUpdateScore(
  master: Address,
  score:  number,
  nonce:  bigint,
): Promise<`0x${string}`> {
  return getOracleAccount().signTypedData({
    domain: getEip712Domain(),
    types: {
      UpdateScore: [
        { name: "master", type: "address" },
        { name: "score",  type: "uint16"  },
        { name: "nonce",  type: "uint256" },
      ],
    },
    primaryType: "UpdateScore",
    message:     { master, score, nonce },
  });
}

export async function signKYCVerification(
  master: Address,
  expiry: number,
  nonce:  bigint,
): Promise<`0x${string}`> {
  return getOracleAccount().signTypedData({
    domain: getEip712Domain(),
    types: {
      VerifyKYC: [
        { name: "master", type: "address" },
        { name: "expiry", type: "uint32"  },
        { name: "nonce",  type: "uint256" },
      ],
    },
    primaryType: "VerifyKYC",
    message:     { master, expiry, nonce },
  });
}

// ── KYC approval (already-verified shortcut) ────────────────────────────────────
// Wallet's identity is confirmed off-chain (QIEPass), but the on-chain mainnet
// record is missing. Sign both txs the user needs: verifyKYC + the +200 bump.
const KYC_SCORE_BONUS = 200;

export async function buildKycApproval(master: Address) {
  const expiry       = Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60; // 90-day KYC
  const currentScore = await readCreditScore(master);
  const newScore     = Math.min(1000, currentScore + KYC_SCORE_BONUS);

  const [kycNonce, scoreNonce] = await Promise.all([freshNonce(), freshNonce()]);
  const [kycSig, scoreSig]     = await Promise.all([
    signKYCVerification(master, expiry, kycNonce),
    signUpdateScore(master, newScore, scoreNonce),
  ]);

  return {
    kycData:     { master, expiry, signature: kycSig, nonce: kycNonce.toString() },
    scoreUpdate: { score: newScore, signature: scoreSig, nonce: scoreNonce.toString() },
  };
}

// ── Score delta ───────────────────────────────────────────────────────────────

export function computeDelta(
  proofType:      ReclaimProofType,
  bureauScore?:   number,
  accountAgeDays?: number,  // only relevant for TELECOM
): number {
  if (CREDIT_PROOF_TYPES.has(proofType) && bureauScore !== undefined) {
    return scoreCreditBureau(bureauScore, BUREAU_SCORE_MAX[proofType] ?? 900);
  }
  if (proofType === "TELECOM") {
    // Pass account age so the 20pt age bonus (>2yr account) is correctly applied.
    return scoreTelecomProof(accountAgeDays);
  }
  return 0;
}

// ── Full proof processing pipeline ───────────────────────────────────────────
// Used by /proof/submit, /proof/callback, and /zkproof/status.

export async function processAndSignProof(
  sessionId:     string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  proof:         any,
  walletAddress: string,
  proofType:     string,
): Promise<{ result: OracleResult } | { error: string }> {
  const master = walletAddress as Address;

  // 1. Verify proof with Reclaim SDK
  const verifyResult = await verifyProof(sessionId, proof, proofType as ReclaimProofType);
  if (!verifyResult.verified || !verifyResult.proofHash || !verifyResult.documentNullifier) {
    return { error: "Proof not verified by Reclaim" };
  }

  const proofTypeHash     = computeProofTypeHash(proofType, master);
  const documentNullifier = verifyResult.documentNullifier;

  // Did THIS wallet already commit this proof category on-chain? If so we're in
  // a re-sync, not a fresh submit — used to relax replay checks and skip commit.
  let alreadyCommittedByWallet = false;
  try {
    const committed = await readCommittedProofTypeHashes(master);
    alreadyCommittedByWallet = committed.includes(proofTypeHash);
  } catch { /* events unreadable — treat as fresh */ }

  // Replay prevention — skipped for the wallet's own re-sync, since that's
  // exactly re-using its own already-committed proof on purpose.
  if (!alreadyCommittedByWallet) {
    try {
      if (await readIsProofUsed(verifyResult.proofHash)) {
        return { error: "Proof already committed on-chain" };
      }
      if (await readIsDocumentNullifierUsed(documentNullifier)) {
        return { error: "This document has already been used by another wallet" };
      }
    } catch { /* contract not deployed — allow */ }
  }

  const currentScore = await readCreditScore(master);
  const delta        = computeDelta(
    proofType as ReclaimProofType,
    verifyResult.creditSignals?.bureauScore,
    verifyResult.telecomSignals?.accountAgeDays,
  );

  // Re-sync path: proof's already on-chain, only the score needs fixing (e.g.
  // an earlier submit landed +0 because the bureau score wasn't parsed). Sign
  // score-only, no commit. Anchor to the KYC base + delta so re-runs are
  // monotonic and can't double-count.
  if (alreadyCommittedByWallet) {
    const KYC_BASE  = 200;
    const newScore  = Math.min(1000, Math.max(currentScore, KYC_BASE + delta));
    const scoreNonce = await freshNonce();
    const scoreSig   = await signUpdateScore(master, newScore, scoreNonce);
    return {
      result: {
        commitProof:   null,
        updateScore:   { score: newScore, signature: scoreSig, nonce: scoreNonce.toString() },
        delta,
        previousScore: currentScore,
        newScore,
        scoreOnly:     true,
      },
    };
  }

  const newScore = Math.min(1000, currentScore + delta);

  const [proofNonce, scoreNonce] = await Promise.all([freshNonce(), freshNonce()]);
  const [commitSig, scoreSig]    = await Promise.all([
    signCommitProof(master, verifyResult.proofHash, proofTypeHash, documentNullifier, proofNonce),
    signUpdateScore(master, newScore, scoreNonce),
  ]);

  return {
    result: {
      commitProof: {
        proofHash:         verifyResult.proofHash,
        proofTypeHash,
        documentNullifier,
        signature:         commitSig,
        nonce:             proofNonce.toString(),
      },
      updateScore: {
        score:     newScore,
        signature: scoreSig,
        nonce:     scoreNonce.toString(),
      },
      delta,
      previousScore: currentScore,
      newScore,
    },
  };
}
