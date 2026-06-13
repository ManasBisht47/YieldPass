// GET /api/reputation/kyc/status?requestId=xxx&walletAddress=0x...
//
// Frontend polls this while a user finishes KYC on QIEPass. Until they're done
// we just echo "pending". Once consent is given and the credential's ready, we
// claim it, then hand the frontend two oracle-signed payloads to submit on-chain:
// one to flip kycVerified, one to add the +200 KYC points. We sign here but never
// send the tx — the user's own wallet does that.

import { NextRequest, NextResponse }         from "next/server";
import type { Address }                      from "viem";
import { getRequestStatus, claimAndVerify }  from "@/server/services/qiepass.service";
import { readCreditScore }                   from "@/server/services/onchain.service";
import {
  freshNonce,
  signKYCVerification,
  signUpdateScore,
} from "@/server/services/oracle.service";

const KYC_SCORE_BONUS = 200;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const requestId     = searchParams.get("requestId");
  const walletAddress = searchParams.get("walletAddress");

  if (!requestId)     return NextResponse.json({ error: "requestId required" },     { status: 400 });
  if (!walletAddress) return NextResponse.json({ error: "walletAddress required" }, { status: 400 });

  try {
    const statusResult = await getRequestStatus(requestId);

    if (statusResult.status === "pending_kyc" || statusResult.status === "pending_consent") {
      return NextResponse.json({ status: "pending", qieStatus: statusResult.status });
    }
    if (statusResult.status === "consent_rejected") {
      return NextResponse.json({ status: "rejected" });
    }
    if (statusResult.status !== "consent_given" || !statusResult.vcReady) {
      return NextResponse.json({ status: "pending", qieStatus: statusResult.status });
    }

    const credential = await claimAndVerify(requestId);
    if (!credential || !credential.verified) {
      return NextResponse.json({ status: "error", error: "Credential verification failed" });
    }

    const master = walletAddress as Address;

    const expiry = Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60; // 90-day KYC validity

    const currentScore = await readCreditScore(master);
    const newScore     = Math.min(1000, currentScore + KYC_SCORE_BONUS);

    // separate nonces so the two sigs can't collide / replay each other
    const [kycNonce, scoreNonce] = await Promise.all([freshNonce(), freshNonce()]);

    const [kycSig, scoreSig] = await Promise.all([
      signKYCVerification(master, expiry, kycNonce),
      signUpdateScore(master, newScore, scoreNonce),
    ]);

    return NextResponse.json({
      status: "ready",
      kycData: {
        master,
        expiry,
        signature: kycSig,
        nonce:     kycNonce.toString(),
      },
      scoreUpdate: {
        score:     newScore,
        signature: scoreSig,
        nonce:     scoreNonce.toString(),
      },
    });
  } catch (err) {
    console.error("[kyc/status]", err);
    return NextResponse.json({ status: "error", error: "Internal error" }, { status: 500 });
  }
}
