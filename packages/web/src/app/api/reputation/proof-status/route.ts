import { type NextRequest } from "next/server";
import { type Address } from "viem";
import { readCommittedProofTypeHashes, computeProofTypeHash } from "@/server/services/onchain.service";
import { PROOF_TYPE_INFO, type ZKProofType } from "@/types/reputation";

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address) return Response.json({ done: [] });

  const master = address as Address;
  const seenHashes = new Set(await readCommittedProofTypeHashes(master));

  const done: ZKProofType[] = PROOF_TYPE_INFO
    .filter(info => seenHashes.has(computeProofTypeHash(info.type, master)))
    .map(info => info.type);

  return Response.json({ done });
}
