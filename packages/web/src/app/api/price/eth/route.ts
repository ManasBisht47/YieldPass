// GET /api/price/eth
//
// Returns live ETH/USD price from CoinGecko, cached server-side for 60s.
// Falls back to the on-chain PriceOracle if CoinGecko is unreachable,
// and finally to a static $3,000 so the UI never breaks.

import { NextResponse } from "next/server";
import { createPublicClient, http, type Address } from "viem";
import { ACTIVE_CHAIN } from "@/server/services/onchain.service";

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd";

const STATIC_FALLBACK = 3000;
const CACHE_TTL_MS    = 60_000;

const ORACLE_ABI = [
  {
    name: "getPrice",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

let cached: { price: number; source: string; at: number } | null = null;

async function fromCoinGecko(): Promise<number | null> {
  try {
    const res = await fetch(COINGECKO_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    const price = data?.ethereum?.usd;
    return typeof price === "number" && price > 0 ? price : null;
  } catch {
    return null;
  }
}

async function fromOracle(): Promise<number | null> {
  const addr = (process.env.NEXT_PUBLIC_PRICE_ORACLE_ADDRESS ?? "") as Address;
  if (!addr) return null;
  try {
    const client = createPublicClient({ chain: ACTIVE_CHAIN, transport: http() });
    const raw = await client.readContract({
      address: addr,
      abi: ORACLE_ABI,
      functionName: "getPrice",
    });
    const price = Number(raw) / 1e8; // Chainlink 8-decimal format
    return price > 0 ? price : null;
  } catch {
    return null;
  }
}

export async function GET() {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json({ price: cached.price, source: cached.source, cached: true });
  }

  let price = await fromCoinGecko();
  let source = "coingecko";

  if (price === null) {
    price = await fromOracle();
    source = "oracle";
  }
  if (price === null) {
    price = STATIC_FALLBACK;
    source = "static";
  }

  cached = { price, source, at: Date.now() };
  return NextResponse.json({ price, source, cached: false });
}
