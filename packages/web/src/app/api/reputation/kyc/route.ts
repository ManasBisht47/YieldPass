import { NextRequest, NextResponse } from "next/server";
import type { Address } from "viem";
import { createVerificationRequest } from "@/server/services/qiepass.service";
import { buildKycApproval } from "@/server/services/oracle.service";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { walletAddress } = body as { walletAddress?: string };

  if (!walletAddress || !/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
    return NextResponse.json({ error: "Invalid walletAddress" }, { status: 400 });
  }

  try {
    const request = await createVerificationRequest(walletAddress);

    // Already KYC'd on QIEPass — skip the polling dance and hand back the
    // signatures so the user can finish on-chain right away.
    if (request.status === "already_verified") {
      const approval = await buildKycApproval(walletAddress as Address);
      return NextResponse.json({ status: "ready", ...approval });
    }

    return NextResponse.json({
      requestId:   request.requestId,
      status:      request.status,
      redirectUrl: request.redirectUrl,
      expiresAt:   request.expiresAt,
    });
  } catch (err) {
    console.error("[api/reputation/kyc]", err);
    return NextResponse.json({ error: "Failed to create KYC request" }, { status: 500 });
  }
}
