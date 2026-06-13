// QIEPass Partner Integration
// Docs: https://did-stapi.qie.digital (QIE Partner Integration)
// Auth: HMAC-SHA256 — X-Public-Key + X-Signature + X-Timestamp on every request
//
// Setup: set QIEPASS_PUBLIC_KEY and QIEPASS_SECRET_KEY in .env.local

import { createHmac } from "crypto";

const BASE_URL = "https://did-stapi.qie.digital";

// Minimal claims — only what's needed to confirm real identity + jurisdiction
const REQUESTED_CLAIMS = ["firstName", "lastName", "nationality"];

// ── Auth helpers ──────────────────────────────────────────────────────────────

function buildHeaders(publicKey: string, secretKey: string): Record<string, string> {
  const timestamp = Date.now().toString();
  const message   = publicKey + timestamp;
  const signature = createHmac("sha256", secretKey)
    .update(message)
    .digest("hex");

  return {
    "Content-Type":  "application/json",
    "X-Public-Key":  publicKey,
    "X-Signature":   signature,
    "X-Timestamp":   timestamp,
  };
}

function getKeys(): { publicKey: string; secretKey: string } | null {
  const publicKey = process.env.QIEPASS_PUBLIC_KEY;
  const secretKey = process.env.QIEPASS_SECRET_KEY;
  if (!publicKey || !secretKey) return null;
  return { publicKey, secretKey };
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type KYCStatus =
  | "pending_kyc"      // new user — must complete KYC on QIEPass first
  | "pending_consent"  // KYC done — waiting for user to approve credential share
  | "consent_given"    // user approved — can now claim credential
  | "consent_rejected" // user rejected — stop polling
  | "already_verified" // wallet already verified with our partner (testnet QIEPass)
  | "error";

export interface VerificationRequest {
  requestId:   string;
  status:      KYCStatus;
  redirectUrl?: string; // only present when status === "pending_kyc"
  expiresAt:   number;
}

export interface RequestStatusResult {
  requestId:  string;
  status:     KYCStatus;
  did?:       string;
  vcReady:    boolean; // vcMetadata.ready
}

export interface ClaimedCredential {
  credentialId:   string;
  subject:        string; // did:qie:...
  requestedClaims: Record<string, unknown>;
  issuanceDate:   string;
  expirationDate: string;
  verified:       boolean; // QIEPass-verified signature
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function createVerificationRequest(
  walletAddress: string,
): Promise<VerificationRequest> {
  const keys = getKeys();

  // Dev fallback — no keys configured
  if (!keys) {
    return {
      requestId:   `demo-${Date.now()}`,
      status:      "pending_kyc",
      redirectUrl: `https://qiepass.qie.digital/verify?wallet=${walletAddress}`,
      expiresAt:   Math.floor(Date.now() / 1000) + 3600,
    };
  }

  const res = await fetch(`${BASE_URL}/api/v1/partners/verification-requests`, {
    method:  "POST",
    headers: buildHeaders(keys.publicKey, keys.secretKey),
    body: JSON.stringify({
      identifier:      walletAddress,
      requestedClaims: REQUESTED_CLAIMS,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    // 409 = this wallet already did KYC with our partner account. That's not a
    // failure — QIEPass is vouching for the identity. The on-chain record on
    // mainnet may still be missing, so we surface it as a distinct status and
    // let the caller mint the on-chain proof straight off this confirmation.
    if (res.status === 409 && /already verified/i.test(text)) {
      return {
        requestId: "",
        status:    "already_verified",
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };
    }
    throw new Error(`QIEPass create request error: ${res.status} ${text}`);
  }

  const data = await res.json();
  return {
    requestId:   data.data.requestId,
    status:      data.data.status as KYCStatus,
    redirectUrl: data.data.redirectUrl,
    expiresAt:   Math.floor(Date.now() / 1000) + 3600,
  };
}

export async function getRequestStatus(requestId: string): Promise<RequestStatusResult> {
  const keys = getKeys();
  if (!keys) return { requestId, status: "error", vcReady: false };

  const res = await fetch(
    `${BASE_URL}/api/v1/partners/verification-requests/${requestId}`,
    { headers: buildHeaders(keys.publicKey, keys.secretKey) },
  );

  if (!res.ok) throw new Error(`QIEPass status error: ${res.status}`);

  const data = await res.json();
  return {
    requestId:  data.data.requestId,
    status:     data.data.status as KYCStatus,
    did:        data.data.did,
    vcReady:    data.data.vcMetadata?.ready === true,
  };
}

export async function claimAndVerify(requestId: string): Promise<ClaimedCredential | null> {
  const keys = getKeys();
  if (!keys) return null;

  const res = await fetch(`${BASE_URL}/api/v1/vc/partner/claim-and-verify`, {
    method:  "POST",
    headers: buildHeaders(keys.publicKey, keys.secretKey),
    body: JSON.stringify({ requestId }),
  });

  if (!res.ok) {
    console.error("[qiepass] claim-and-verify failed:", res.status, await res.text());
    return null;
  }

  const data = await res.json();
  const v    = data.verification ?? {};

  return {
    credentialId:    data.credentialId,
    subject:         data.subject,
    requestedClaims: data.requestedClaims ?? {},
    issuanceDate:    data.issuanceDate,
    expirationDate:  data.expirationDate,
    verified:        v.signatureValid === true && v.notExpired === true && v.notRevoked === true,
  };
}
