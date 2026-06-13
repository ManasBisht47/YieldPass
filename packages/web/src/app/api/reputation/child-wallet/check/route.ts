import { NextRequest, NextResponse } from "next/server";
import { readLockStatus, readIsNonceUsed, ACTIVE_CHAIN } from "@/server/services/onchain.service";
import type { Address } from "viem";

// EIP-712 domain matches ReputationRegistry constructor: EIP712("YieldPass:ReputationRegistry", "1")
function buildEip712Payload(masterAddress: string, childAddress: string, nonce: bigint) {
  return {
    domain: {
      name:              "YieldPass:ReputationRegistry",
      version:           "1",
      chainId:           ACTIVE_CHAIN.id,
      verifyingContract: process.env.NEXT_PUBLIC_REPUTATION_REGISTRY_ADDRESS ?? "0x0000000000000000000000000000000000000000",
    },
    types: {
      LinkWallet: [
        { name: "master", type: "address" },
        { name: "child",  type: "address" },
        { name: "nonce",  type: "uint256" },
      ],
    },
    primaryType: "LinkWallet" as const,
    message: {
      master: masterAddress,
      child:  childAddress,
      nonce:  nonce.toString(),
    },
  };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { masterAddress, childAddress } = body as {
    masterAddress?: string;
    childAddress?:  string;
  };

  const addrRe = /^0x[0-9a-fA-F]{40}$/;
  if (!masterAddress || !addrRe.test(masterAddress)) {
    return NextResponse.json({ error: "Invalid masterAddress" }, { status: 400 });
  }
  if (!childAddress || !addrRe.test(childAddress)) {
    return NextResponse.json({ error: "Invalid childAddress" }, { status: 400 });
  }
  if (masterAddress.toLowerCase() === childAddress.toLowerCase()) {
    return NextResponse.json({ error: "Master and child cannot be the same wallet" }, { status: 400 });
  }

  // Check if child is already globally locked
  let lockStatus = { isLocked: false, masterWallet: "0x0000000000000000000000000000000000000000" as Address };
  try {
    lockStatus = await readLockStatus(childAddress as Address);
  } catch {
    // Contract not deployed yet - allow to proceed with nonce generation
  }

  if (lockStatus.isLocked) {
    return NextResponse.json(
      {
        error:         "Child wallet already locked",
        lockedTo:      lockStatus.masterWallet,
        maskedLockedTo: `${lockStatus.masterWallet.slice(0, 6)}••••${lockStatus.masterWallet.slice(-4)}`,
      },
      { status: 409 },
    );
  }

  // Generate a cryptographically random nonce that's not yet used
  let nonce: bigint;
  let attempts = 0;
  do {
    const bytes  = crypto.getRandomValues(new Uint8Array(32));
    nonce        = bytes.reduce((acc, b) => (acc << 8n) | BigInt(b), 0n);
    let used     = false;
    try { used = await readIsNonceUsed(nonce); } catch { /* not deployed */ }
    if (!used) break;
    attempts++;
  } while (attempts < 5);

  const eip712 = buildEip712Payload(masterAddress, childAddress, nonce);

  return NextResponse.json({
    nonce:   nonce.toString(),
    eip712,
    childLocked: false,
  });
}
