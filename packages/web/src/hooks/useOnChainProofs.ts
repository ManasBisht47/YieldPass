"use client";

import { useEffect, useState } from "react";
import { type Address } from "viem";
import { type ZKProofType } from "@/types/reputation";

export function useOnChainProofs(address?: Address): { done: Set<ZKProofType>; isLoading: boolean } {
  const [done, setDone]           = useState<Set<ZKProofType>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!address) return;

    setIsLoading(true);
    fetch(`/api/reputation/proof-status?address=${address}`)
      .then(r => r.json())
      .then(({ done: types }: { done: ZKProofType[] }) => {
        setDone(new Set(types));
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [address]);

  return { done, isLoading };
}
