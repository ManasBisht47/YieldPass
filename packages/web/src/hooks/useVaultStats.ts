"use client";

import { useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import { yieldVaultContract } from "@/lib/contracts";

export function useVaultStats() {
  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      { ...yieldVaultContract, functionName: "totalStaked"    },
      { ...yieldVaultContract, functionName: "totalYieldPool" },
      { ...yieldVaultContract, functionName: "globalBaseApyBps" },
    ],
  });

  const totalStakedRaw    = data?.[0]?.result as bigint | undefined;
  const totalYieldPoolRaw = data?.[1]?.result as bigint | undefined;
  const baseApyBpsRaw     = data?.[2]?.result as bigint | undefined;

  return {
    totalStakedRaw,
    totalYieldPoolRaw,
    totalStakedQie:    totalStakedRaw    ? Number(formatUnits(totalStakedRaw,    18)) : 0,
    totalYieldPoolQie: totalYieldPoolRaw ? Number(formatUnits(totalYieldPoolRaw, 18)) : 0,
    baseApyPercent:    baseApyBpsRaw     ? Number(baseApyBpsRaw) / 100 : 0,
    isLoading,
    refetch,
  };
}
