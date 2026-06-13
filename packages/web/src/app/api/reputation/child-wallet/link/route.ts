import { NextRequest, NextResponse } from "next/server";
import { readLockStatus } from "@/server/services/onchain.service";
import { recoverAddress, hashTypedData, type Address } from "viem";

// Server-side validation before user calls linkChildWallet on-chain.
// We verify both signatures are correct so the user doesn't waste gas.

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { masterAddress, childAddress, nonce, masterSig, childSig } = body as {
    masterAddress?: string;
    childAddress?:  string;
    nonce?:         string;
    masterSig?:     string;
    childSig?:      string;
  };

  const addrRe = /^0x[0-9a-fA-F]{40}$/;
  const hexRe  = /^0x[0-9a-fA-F]+$/;

  if (!masterAddress || !addrRe.test(masterAddress)) {
    return NextResponse.json({ error: "Invalid masterAddress" }, { status: 400 });
  }
  if (!childAddress || !addrRe.test(childAddress)) {
    return NextResponse.json({ error: "Invalid childAddress" }, { status: 400 });
  }
  if (!nonce || isNaN(Number(nonce))) {
    return NextResponse.json({ error: "Invalid nonce" }, { status: 400 });
  }
  if (!masterSig || !hexRe.test(masterSig)) {
    return NextResponse.json({ error: "Invalid masterSig" }, { status: 400 });
  }
  if (!childSig || !hexRe.test(childSig)) {
    return NextResponse.json({ error: "Invalid childSig" }, { status: 400 });
  }

  const chainId            = process.env.NEXT_PUBLIC_ACTIVE_CHAIN === "qie-mainnet" ? 1990 : 1983;
  const verifyingContract  = (process.env.NEXT_PUBLIC_REPUTATION_REGISTRY_ADDRESS ?? "0x0000000000000000000000000000000000000000") as Address;

  const typedData = {
    domain: {
      name:    "YieldPass:ReputationRegistry" as const,
      version: "1" as const,
      chainId,
      verifyingContract,
    },
    types: {
      LinkWallet: [
        { name: "master", type: "address" as const },
        { name: "child",  type: "address" as const },
        { name: "nonce",  type: "uint256" as const },
      ],
    },
    primaryType: "LinkWallet" as const,
    message: {
      master: masterAddress as Address,
      child:  childAddress  as Address,
      nonce:  BigInt(nonce),
    },
  };

  try {
    const digest = hashTypedData(typedData);

    const recoveredMaster = await recoverAddress({ hash: digest, signature: masterSig as `0x${string}` });
    if (recoveredMaster.toLowerCase() !== masterAddress.toLowerCase()) {
      return NextResponse.json({ error: "Master signature invalid" }, { status: 400 });
    }

    const recoveredChild = await recoverAddress({ hash: digest, signature: childSig as `0x${string}` });
    if (recoveredChild.toLowerCase() !== childAddress.toLowerCase()) {
      return NextResponse.json({ error: "Child signature invalid" }, { status: 400 });
    }
  } catch (err) {
    console.error("[api/child-wallet/link] sig verification:", err);
    return NextResponse.json({ error: "Signature verification failed" }, { status: 400 });
  }

  // Double-check child is still unlocked before user spends gas
  try {
    const lockStatus = await readLockStatus(childAddress as Address);
    if (lockStatus.isLocked) {
      return NextResponse.json(
        { error: "Child wallet was locked by another transaction" },
        { status: 409 },
      );
    }
  } catch { /* contract not deployed */ }

  return NextResponse.json({ valid: true, readyToSubmit: true });
}
