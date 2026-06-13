// Frontend polls this endpoint after opening the Reclaim proof URL.
// If no result in our store yet, we poll Reclaim's status URL directly
// (this works on localhost where Reclaim can't POST to our callback URL).

import { NextRequest, NextResponse }    from "next/server";
import { getEntry, setResult, setError } from "@/server/proofStore";
import { processAndSignProof }           from "@/server/services/oracle.service";

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId)
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });

  const entry = getEntry(sessionId);
  if (!entry)
    return NextResponse.json({ error: "Unknown sessionId" }, { status: 404 });

  // Already resolved
  if (entry.error)  return NextResponse.json({ status: "error",  error:  entry.error  });
  if (entry.result) return NextResponse.json({ status: "ready",  result: entry.result });

  // No result yet - poll Reclaim's status URL directly (works on localhost)
  if (entry.reclaimStatusUrl) {
    try {
      const res  = await fetch(entry.reclaimStatusUrl, { headers: { "Content-Type": "application/json" } });
      if (res.ok) {
        const data = await res.json() as {
          session?: { statusV2?: string; status?: string; proofs?: unknown[] };
          proofs?:  unknown[];
        };

        const status = data?.session?.statusV2 ?? data?.session?.status ?? "";
        const proofs = data?.session?.proofs ?? data?.proofs ?? [];

        if (status === "PROOF_SUBMITTED" && Array.isArray(proofs) && proofs.length > 0) {
          const outcome = await processAndSignProof(
            sessionId,
            proofs[0],
            entry.walletAddress,
            entry.proofType,
          );

          if ("error" in outcome) {
            setError(sessionId, outcome.error);
            return NextResponse.json({ status: "error", error: outcome.error });
          }

          setResult(sessionId, outcome.result);
          return NextResponse.json({ status: "ready", result: outcome.result });
        }
      }
    } catch (err) {
      console.error("[zkproof/status] Reclaim poll error:", err);
    }
  }

  return NextResponse.json({ status: "pending" });
}
