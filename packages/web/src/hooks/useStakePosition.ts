"use client";

import { useReadContract } from "wagmi";
import { useAccount } from "wagmi";
import { yieldVaultContract } from "@/lib/contracts";
import type { StakePosition } from "@/types/vault";

export function useStakePosition() {
  const { address } = useAccount();

  const { data, isLoading, refetch } = useReadContract({
    ...yieldVaultContract,
    functionName: "getPosition",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // Live claimable yield = settled pending + un-settled accumulator gains.
  // (position.pendingYield alone is stale between settles under the accumulator.)
  const { data: livePending, refetch: refetchPending } = useReadContract({
    ...yieldVaultContract,
    functionName: "pendingYieldOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const position = data as StakePosition | undefined;
  const pendingYield = (livePending as bigint | undefined) ?? position?.pendingYield ?? 0n;

  return {
    position,
    pendingYield,
    isLoading,
    refetch: () => { refetch(); refetchPending(); },
    hasPosition: !!position && position.principal > 0n,
  };
}
