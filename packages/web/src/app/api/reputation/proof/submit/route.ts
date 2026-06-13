// The direct submit path (vs the Reclaim webhook in proof/callback) - frontend
// posts the finished proof here, we verify + oracle-sign, and hand back two
// payloads it then submits itself: commitZKProof and updateCreditScore. Same
// processAndSignProof() the callback uses, so the two paths can't drift apart.

import { NextRequest, NextResponse } from "next/server";
import { processAndSignProof }       from "@/server/services/oracle.service";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { walletAddress, sessionId, proofData, proofType } = body as {
    walletAddress?: string;
    sessionId?:     string;
    proofData?:     Record<string, unknown>;
    proofType?:     string;
  };

  if (!walletAddress || !/^0x[0-9a-fA-F]{40}$/.test(walletAddress))
    return NextResponse.json({ error: "Invalid walletAddress" }, { status: 400 });
  if (!sessionId || typeof sessionId !== "string")
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  if (!proofData || typeof proofData !== "object")
    return NextResponse.json({ error: "proofData required" }, { status: 400 });
  if (!proofType || typeof proofType !== "string")
    return NextResponse.json({ error: "proofType required" }, { status: 400 });

  let outcome: Awaited<ReturnType<typeof processAndSignProof>>;
  try {
    outcome = await processAndSignProof(sessionId, proofData, walletAddress, proofType);
  } catch (err) {
    console.error("[proof/submit]", err);
    return NextResponse.json({ error: "Oracle processing failed" }, { status: 500 });
  }

  if ("error" in outcome)
    return NextResponse.json({ error: outcome.error }, { status: 400 });

  return NextResponse.json(outcome.result);
}
