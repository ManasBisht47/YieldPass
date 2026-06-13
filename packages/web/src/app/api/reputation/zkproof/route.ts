import { NextRequest, NextResponse } from "next/server";
import { createProofSession, type ReclaimProofType } from "@/server/services/reclaim.service";
import { createSession } from "@/server/proofStore";
import type { ZKProofType } from "@/types/reputation";

// TELECOM excluded — no valid Reclaim provider UUID exists in public catalog yet
const ALLOWED_PROOF_TYPES = new Set<string>([
  "CREDIT_CIBIL_PAISABAZAR",
  "CREDIT_EXPERIAN_IN",
  "CREDIT_EXPERIAN_US",
  "CREDIT_KARMA",
]);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { walletAddress, proofType } = body as {
    walletAddress?: string;
    proofType?:     string;
  };

  if (!walletAddress || !/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
    return NextResponse.json({ error: "Invalid walletAddress" }, { status: 400 });
  }

  if (!proofType || !ALLOWED_PROOF_TYPES.has(proofType)) {
    return NextResponse.json(
      { error: `proofType must be one of: ${[...ALLOWED_PROOF_TYPES].join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const session = await createProofSession(walletAddress, proofType as ReclaimProofType);
    // Register in proof store — reclaimStatusUrl used for direct status polling
    createSession(session.sessionId, walletAddress, proofType, session.reclaimStatusUrl);
    return NextResponse.json({
      sessionId:  session.sessionId,
      reclaimUrl: session.reclaimUrl,
      statusUrl:  `/api/reputation/zkproof/status?sessionId=${session.sessionId}`,
      expiresAt:  session.expiresAt,
      proofType:  proofType as ZKProofType,
    });
  } catch (err) {
    console.error("[api/reputation/zkproof]", err);
    return NextResponse.json({ error: "Failed to create proof session" }, { status: 500 });
  }
}
