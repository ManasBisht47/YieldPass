"use client";

import { useReadContract } from "wagmi";
import { useAccount } from "wagmi";
import { yieldVaultContract } from "@/lib/contracts";
import { SCORE_BANDS, LOCK_TIERS } from "@/lib/constants";
import type { LockTier } from "@/types/vault";

export function useCurrentAPY(userAddress?: `0x${string}`) {
  const { address } = useAccount();
  const target = userAddress ?? address;

  const { data: globalBaseApyBps } = useReadContract({
    ...yieldVaultContract,
    functionName: "globalBaseApyBps",
  });

  const { data: effectiveApyBps } = useReadContract({
    ...yieldVaultContract,
    functionName: "getEffectiveAPY",
    args: target ? [target] : undefined,
    query: { enabled: !!target },
  });

  return {
    globalBaseApyBps: globalBaseApyBps as bigint | undefined,
    effectiveApyBps:  effectiveApyBps  as bigint | undefined,
    baseApyPercent:   globalBaseApyBps ? Number(globalBaseApyBps) / 100 : undefined,
    effectiveApyPercent: effectiveApyBps ? Number(effectiveApyBps) / 100 : undefined,
  };
}

export function useProjectedAPY(score: number, lockTier: LockTier, baseApyBps: number) {
  const band         = SCORE_BANDS.find(b => score >= b.min && score <= b.max)!;
  const lockBonus    = Object.values(LOCK_TIERS)[lockTier].bonusBps;
  // score band × lock multiplier — both scale pool share, matching getEffectiveAPY
  const boostedBps   = Math.round((baseApyBps * band.multiplierBps * (10_000 + lockBonus)) / 1e8);

  return {
    baseApyPercent:    baseApyBps / 100,
    boostedApyPercent: boostedBps / 100,
    multiplierLabel:   `${(band.multiplierBps / 10_000).toFixed(2)}x`,
    scoreBandLabel:    band.label,
  };
}
