import { NextResponse } from "next/server";
import { readGlobalBaseApyBps, readTotalStaked } from "@/server/services/onchain.service";

export async function GET() {
  try {
    const [globalBaseApyBps, totalStaked] = await Promise.all([
      readGlobalBaseApyBps(),
      readTotalStaked(),
    ]);

    return NextResponse.json({
      globalBaseApyBps: globalBaseApyBps.toString(),
      baseApyPercent:   Number(globalBaseApyBps) / 100,
      totalStakedQie:   totalStaked.toString(),          // 18 decimals (native QIE)
      totalStakedQieFormatted: Number(totalStaked) / 1e18,
    });
  } catch (err) {
    console.error("[api/vault/apy]", err);
    return NextResponse.json(
      { globalBaseApyBps: "0", baseApyPercent: 0, error: "RPC unavailable" },
      { status: 503 },
    );
  }
}
