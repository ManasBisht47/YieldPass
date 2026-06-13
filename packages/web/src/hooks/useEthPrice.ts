"use client";

import { useQuery } from "@tanstack/react-query";

interface EthPriceResponse {
  price:  number;
  source: "coingecko" | "oracle" | "static";
}

/**
 * Live ETH/USD price via /api/price/eth (CoinGecko → oracle → static fallback).
 * Refreshes every 60s while the page is open.
 */
export function useEthPrice() {
  const { data, isLoading } = useQuery<EthPriceResponse>({
    queryKey: ["eth-price"],
    queryFn: async () => {
      const res = await fetch("/api/price/eth");
      if (!res.ok) throw new Error("price fetch failed");
      return res.json();
    },
    refetchInterval: 60_000,
    staleTime:       55_000,
    retry:           2,
  });

  return {
    ethUsd:    data?.price ?? 3000,
    source:    data?.source ?? "static",
    isLoading,
  };
}
