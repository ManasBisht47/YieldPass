// POST /api/reputation/kyc/claim-score
// { walletAddress }
//
// For users who already completed verifyKYC on-chain but never received the
// +200 score update (because the original flow didn't include it).
// Verifies kycVerified=true on-chain, then oracle-signs updateCreditScore(current+200).

import { NextRequest, NextResponse } from "next/server";
import type { Address }              from "viem";
import { freshNonce, signUpdateScore } from "@/server/services/oracle.service";
import { readCreditScore, readIsKYCVerified } from "@/server/services/onchain.service";

const KYC_SCORE_BONUS = 200;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { walletAddress } = body as { walletAddress?: string };

  if (!walletAddress || !/^0x[0-9a-fA-F]{40}$/.test(walletAddress))
    return NextResponse.json({ error: "Invalid walletAddress" }, { status: 400 });

  const master = walletAddress as Address;

  const verified = await readIsKYCVerified(master);
  if (!verified)
    return NextResponse.json({ error: "KYC not verified on-chain for this address" }, { status: 403 });

  const currentScore = await readCreditScore(master);

  if (currentScore >= KYC_SCORE_BONUS)
    return NextResponse.json({ error: "KYC score already applied (score is already ≥200)" }, { status: 409 });

  const newScore = Math.min(1000, currentScore + KYC_SCORE_BONUS);
  const nonce    = await freshNonce();
  const sig      = await signUpdateScore(master, newScore, nonce);

  return NextResponse.json({
    scoreUpdate: {
      score:     newScore,
      signature: sig,
      nonce:     nonce.toString(),
    },
    previousScore: currentScore,
    newScore,
  });
}
