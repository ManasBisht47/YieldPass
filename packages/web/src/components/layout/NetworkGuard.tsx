"use client";

import { useAccount, useChainId } from "wagmi";
import { ACTIVE_CHAIN } from "@/lib/constants";
import { useWalletLockStatus } from "@/hooks/useWalletLockStatus";

export function NetworkGuard({ children }: { children: React.ReactNode }) {
  const chainId          = useChainId();
  const { address }      = useAccount();
  const { isLocked, maskedMaster, isLoading } = useWalletLockStatus(address ?? "");

  if (chainId && chainId !== ACTIVE_CHAIN.id) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold">Wrong Network</p>
          <p className="text-muted-foreground text-sm">
            Please switch to <strong>{ACTIVE_CHAIN.name}</strong> in your wallet.
          </p>
        </div>
      </div>
    );
  }

  // Blocked: this wallet is permanently locked as a child wallet of another account.
  // Child wallets cannot create or use a YieldPass account - they exist only to
  // contribute trading history to their master wallet's credit score.
  if (!isLoading && address && isLocked) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
            <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <p className="text-lg font-semibold text-red-400">Wallet Locked as Child</p>
            <p className="text-sm text-muted-foreground mt-2">
              This wallet{" "}
              <span className="font-mono text-white/60">{address.slice(0, 6)}••••{address.slice(-4)}</span>{" "}
              is permanently linked as a child wallet
              {maskedMaster ? <> to master <span className="font-mono text-white/60">{maskedMaster}</span></> : null}.
            </p>
            <p className="text-xs text-muted-foreground mt-3">
              Child wallets cannot hold a YieldPass account. Please switch to your master wallet or a different address.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
