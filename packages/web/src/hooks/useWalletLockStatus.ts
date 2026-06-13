"use client";

import { useReadContract } from "wagmi";
import { nullifierRegistryContract } from "@/lib/contracts";
import { isAddress } from "viem";

export function useWalletLockStatus(address: string) {
  const isValid = isAddress(address);

  const { data, isLoading } = useReadContract({
    ...nullifierRegistryContract,
    functionName: "getLockStatus",
    args: isValid ? [address as `0x${string}`] : undefined,
    query: { enabled: isValid },
  });

  const [isLocked, masterWallet] = (data as [boolean, `0x${string}`]) ?? [false, undefined];

  const maskedMaster = masterWallet && masterWallet !== "0x0000000000000000000000000000000000000000"
    ? `${masterWallet.slice(0, 6)}••••${masterWallet.slice(-4)}`
    : undefined;

  return { isLocked, masterWallet, maskedMaster, isLoading };
}
