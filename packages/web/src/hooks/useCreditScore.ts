"use client";

import { useReadContract } from "wagmi";
import { useAccount } from "wagmi";
import { reputationRegistryContract } from "@/lib/contracts";
import { SCORE_BANDS } from "@/lib/constants";
import type { ReputationProfile } from "@/types/reputation";

export function useCreditScore() {
  const { address } = useAccount();

  const { data: profile, isLoading, refetch } = useReadContract({
    ...reputationRegistryContract,
    functionName: "getProfile",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const p = profile as ReputationProfile | undefined;
  const score = p?.creditScore ?? 0;
  const band  = SCORE_BANDS.find(b => score >= b.min && score <= b.max) ?? SCORE_BANDS[0];

  return {
    profile:        p,
    score,
    band,
    isKYCVerified:  p ? (p.kycVerified && Date.now() / 1000 < p.kycExpiry) : false,
    isLoading,
    refetch,
  };
}
