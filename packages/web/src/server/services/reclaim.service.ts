// Reclaim Protocol — ZK proofs for Web2 / credit bureau data
// Uses @reclaimprotocol/js-sdk (v5.x) for session creation and proof verification.
// Docs: https://docs.reclaimprotocol.org/

import { ReclaimProofRequest, verifyProof as sdkVerifyProof } from "@reclaimprotocol/js-sdk";

export type ReclaimProofType =
  | "TELECOM"
  | "CREDIT_CIBIL_PAISABAZAR"
  | "CREDIT_EXPERIAN_IN"
  | "CREDIT_EXPERIAN_US"
  | "CREDIT_KARMA";

export const CREDIT_PROOF_TYPES = new Set<ReclaimProofType>([
  "CREDIT_CIBIL_PAISABAZAR",
  "CREDIT_EXPERIAN_IN",
  "CREDIT_EXPERIAN_US",
  "CREDIT_KARMA",
]);

// Confirmed provider UUIDs from dev.reclaimprotocol.org/explore
const PROVIDER_IDS: Record<ReclaimProofType, string> = {
  TELECOM:                 "telecom-account-age",
  CREDIT_CIBIL_PAISABAZAR: "d70888fc-0c3d-468e-80fe-8543c63e784f",
  CREDIT_EXPERIAN_IN:      "cf6dd149-8444-49de-9851-63ed3a4f8832",
  CREDIT_EXPERIAN_US:      "5b333570-1eb4-4929-a4b6-d7e1f73e4429",
  CREDIT_KARMA:            "3a57852f-6d25-4af3-b499-477fd9d7ebd7",
};

export const BUREAU_SCORE_MAX: Partial<Record<ReclaimProofType, number>> = {
  CREDIT_CIBIL_PAISABAZAR: 900,
  CREDIT_EXPERIAN_IN:      900,
  CREDIT_EXPERIAN_US:      850,
  CREDIT_KARMA:            850,
};

const REDIRECT_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReclaimSession {
  sessionId:        string;
  reclaimUrl:       string;
  statusUrl:        string;    // our own polling endpoint
  reclaimStatusUrl: string;    // Reclaim's direct status URL for server-side polling
  expiresAt:        number;
}

export interface CreditSignals {
  bureauScore:  number;
  scoreMax:     number;
  providerName: string;
}

export interface TelecomSignals {
  accountAgeDays: number;
}

export interface ReclaimProofResult {
  verified:           boolean;
  proofHash?:         `0x${string}`;
  documentNullifier?: `0x${string}`;
  proofType?:         string;
  verifiedAt?:        number;
  creditSignals?:     CreditSignals;
  telecomSignals?:    TelecomSignals;
}

// ── Session creation ──────────────────────────────────────────────────────────

export async function createProofSession(
  walletAddress: string,
  proofType:     ReclaimProofType,
): Promise<ReclaimSession> {
  const appId     = process.env.RECLAIM_APP_ID;
  const appSecret = process.env.RECLAIM_APP_SECRET;
  const providerId = PROVIDER_IDS[proofType];

  if (!appId || !appSecret) {
    const sid = `dev-${Date.now()}`;
    return {
      sessionId:        sid,
      reclaimUrl:       `https://app.reclaimprotocol.org/request?type=${providerId}&wallet=${walletAddress}`,
      statusUrl:        `/api/reputation/zkproof/status?sessionId=${sid}`,
      reclaimStatusUrl: "",
      expiresAt:        Math.floor(Date.now() / 1000) + 3600,
    };
  }

  const proofRequest = await ReclaimProofRequest.init(appId, appSecret, providerId);

  // Only set callback when deployed on HTTPS (not localhost) — Reclaim validates the URL
  // and will reject / fail the proof if it can't reach an HTTP localhost URL.
  if (REDIRECT_BASE_URL.startsWith("https://")) {
    proofRequest.setAppCallbackUrl(`${REDIRECT_BASE_URL}/api/reputation/proof/callback`);
  }

  // Embed wallet address and proof type so we can identify the session in callbacks
  proofRequest.addContext(walletAddress, proofType);

  const reclaimUrl       = await proofRequest.getRequestUrl();
  const sessionId        = proofRequest.getSessionId();
  const reclaimStatusUrl = proofRequest.getStatusUrl();

  return {
    sessionId,
    reclaimUrl,
    statusUrl:        `/api/reputation/zkproof/status?sessionId=${sessionId}`,
    reclaimStatusUrl,
    expiresAt:        Math.floor(Date.now() / 1000) + 3600,
  };
}

// ── Signal extraction ─────────────────────────────────────────────────────────

function extractCreditSignals(
  params:    Record<string, string>,
  proofType: ReclaimProofType,
): CreditSignals | undefined {
  const parse = (v: string | undefined) =>
    parseInt((v ?? "").replace(/[^0-9]/g, ""), 10) || 0;

  let rawScore = 0;

  if (proofType === "CREDIT_CIBIL_PAISABAZAR") {
    rawScore = parse(
      params["Bureau Score"] ?? params["bureau_score"] ??
      params["bureauScore"]  ?? params["cibil_score"],
    );
  } else if (proofType === "CREDIT_EXPERIAN_IN") {
    rawScore = parse(
      params["Latest Score"]  ?? params["latest_score"] ??
      params["latestScore"]   ?? params["credit_score"],
    );
  } else if (proofType === "CREDIT_EXPERIAN_US") {
    rawScore = parse(
      params["Credit Score"]  ?? params["credit_score"] ?? params["creditScore"],
    );
  } else if (proofType === "CREDIT_KARMA") {
    rawScore = parse(
      params["Transunion Score"] ?? params["transunion_score"] ??
      params["transunionScore"]  ?? params["credit_score"],
    );
  }

  const scoreMax = BUREAU_SCORE_MAX[proofType] ?? 900;

  // Providers don't always label the score with the keys above (and Reclaim
  // tweaks them now and then). Fall back to any param that's obviously a bureau
  // score: first a key mentioning "score", then any value in the valid range.
  if (rawScore === 0) {
    for (const [k, v] of Object.entries(params)) {
      if (/score/i.test(k)) {
        const n = parse(v);
        if (n >= 300 && n <= scoreMax) { rawScore = n; break; }
      }
    }
  }
  if (rawScore === 0) {
    for (const v of Object.values(params)) {
      const n = parse(v);
      if (n >= 300 && n <= scoreMax) { rawScore = n; break; }
    }
  }

  if (rawScore === 0) {
    // Loud on purpose — if this fires, the proof verified but we couldn't find
    // the score, so the user would silently get +0. The keys tell us what to add.
    console.warn(`[reclaim] ${proofType}: no bureau score found in params`, Object.keys(params));
    return undefined;
  }

  const NAMES: Record<ReclaimProofType, string> = {
    TELECOM:                 "Telecom",
    CREDIT_CIBIL_PAISABAZAR: "Paisabazar CIBIL",
    CREDIT_EXPERIAN_IN:      "Experian India",
    CREDIT_EXPERIAN_US:      "Experian USA",
    CREDIT_KARMA:            "Credit Karma",
  };
  return { bureauScore: rawScore, scoreMax, providerName: NAMES[proofType] };
}

function extractTelecomSignals(params: Record<string, string>): TelecomSignals {
  const n = (v: string | undefined) => parseInt(v ?? "0", 10) || 0;
  return {
    accountAgeDays: n(params["account_age_days"] ?? params["accountAgeDays"]),
  };
}

// ── Proof verification ────────────────────────────────────────────────────────

// Accepts a Reclaim proof object (from callback body or status poll)
export async function verifyProof(
  _sessionId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  proof:      any,
  proofType?: ReclaimProofType,
): Promise<ReclaimProofResult> {
  if (!proof || !proof.claimData) return { verified: false };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isValid = await (sdkVerifyProof as any)(proof);
    if (!isValid) return { verified: false };
  } catch (err) {
    console.error("[reclaim] sdkVerifyProof threw:", err);
    return { verified: false };
  }

  // Extract parameters from proof context
  let params: Record<string, string> = {};
  try {
    const ctx = JSON.parse(proof.claimData.context ?? "{}");
    params = (ctx.extractedParameters ?? {}) as Record<string, string>;
  } catch { /* ignore parse errors */ }

  // Derive a stable proof hash from the claim identifier (wallet-specific via context)
  const identifierBytes = new TextEncoder().encode(
    proof.identifier ?? proof.claimData.identifier ?? _sessionId,
  );
  const hashBuf   = await crypto.subtle.digest("SHA-256", identifierBytes);
  const proofHash = ("0x" + Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")) as `0x${string}`;

  // Document nullifier — wallet-AGNOSTIC fingerprint of the real-world data.
  // Prevents the same document (same bureau score page, same SIM account, etc.)
  // from being submitted across multiple wallets.
  // Strip contextAddress / contextMessage (wallet-specific injected fields),
  // sort remaining keys for determinism, then hash with proofType as namespace.
  const { contextAddress: _a, contextMessage: _m, ...docParams } = params as Record<string, string>;
  const sortedDocParams = Object.fromEntries(
    Object.entries(docParams).sort(([a], [b]) => a.localeCompare(b)),
  );
  const nullifierInput  = `${proofType ?? "UNKNOWN"}:${JSON.stringify(sortedDocParams)}`;
  const nullifierBuf    = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nullifierInput));
  const documentNullifier = ("0x" + Array.from(new Uint8Array(nullifierBuf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")) as `0x${string}`;

  const creditSignals = (proofType && CREDIT_PROOF_TYPES.has(proofType))
    ? extractCreditSignals(params, proofType)
    : undefined;

  const telecomSignals = proofType === "TELECOM"
    ? extractTelecomSignals(params)
    : undefined;

  return {
    verified:     true,
    proofHash,
    documentNullifier,
    proofType:    proof.claimData.provider,
    verifiedAt:   proof.claimData.timestampS,
    creditSignals,
    telecomSignals,
  };
}
