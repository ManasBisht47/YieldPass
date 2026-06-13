// Webhook Reclaim hits once a user finishes a proof session. We verify the
// proof, run it through the oracle to get a signature, and stash the result in
// proofStore so the frontend's polling picks it up. The shape Reclaim posts
// isn't totally stable, hence the defensive digging for proof + sessionId below.

import { NextRequest, NextResponse } from "next/server";
import { processAndSignProof }       from "@/server/services/oracle.service";
import { getEntry, setResult, setError } from "@/server/proofStore";

export async function POST(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = await req.json().catch(() => ({}) as any);

  // Reclaim SDK sends: { proofs: [...] } or the proof object directly
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proof: any = body.proofs?.[0] ?? body.proofData ?? body;

  // Get sessionId: from body directly, or from proof context
  let sessionId = (body.sessionId as string | undefined);
  if (!sessionId && proof?.claimData?.context) {
    try {
      const ctx = JSON.parse(proof.claimData.context);
      sessionId = ctx.reclaimSessionId ?? ctx.sessionId;
    } catch { /* ignore */ }
  }

  if (!sessionId) {
    console.warn("[proof/callback] No sessionId in body or proof context");
    return NextResponse.json({ ok: true }); // don't error — Reclaim retries
  }

  const entry = getEntry(sessionId);
  if (!entry) {
    console.warn("[proof/callback] Unknown sessionId:", sessionId);
    return NextResponse.json({ ok: true });
  }

  try {
    const outcome = await processAndSignProof(
      sessionId,
      proof,
      entry.walletAddress,
      entry.proofType,
    );

    if ("error" in outcome) {
      setError(sessionId, outcome.error);
    } else {
      setResult(sessionId, outcome.result);
    }
  } catch (err) {
    console.error("[proof/callback]", err);
    setError(sessionId, "Internal oracle error");
  }

  // Always return 200 to Reclaim — errors are stored for polling
  return NextResponse.json({ ok: true });
}
