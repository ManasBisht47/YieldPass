"use client";

import { useState } from "react";
import { useAccount, useWriteContract, useBalance } from "wagmi";
import { parseEther, formatEther } from "viem";
import { toast } from "sonner";
import { Coins, Wallet, AlertTriangle, Sparkles, ArrowRight, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NetworkGuard } from "@/components/layout/NetworkGuard";
import { ApyBreakdown } from "@/components/apy/ApyBreakdown";
import { useStakePosition } from "@/hooks/useStakePosition";
import { useCurrentAPY, useProjectedAPY } from "@/hooks/useCurrentAPY";
import { useCreditScore } from "@/hooks/useCreditScore";
import { yieldVaultContract } from "@/lib/contracts";
import {
  LOCK_TIERS, STANDARD_BOOSTED_CAP_QIE, WHALE_THRESHOLD_QIE,
} from "@/lib/constants";
import { LockTier } from "@/types/vault";

const LOCK_TIER_VALUES: Record<string, LockTier> = {
  FLEXIBLE: LockTier.FLEXIBLE,
  SILVER:   LockTier.SILVER,
  GOLD:     LockTier.GOLD,
  DIAMOND:  LockTier.DIAMOND,
};

// Gold-trimmed tiers get the membership treatment
const GOLD_TIERS = new Set(["GOLD", "DIAMOND"]);

// Keep a little native QIE aside so the user can still pay gas
const GAS_HEADROOM_QIE = 0.02;

function formatLockExpiry(lockExpiry: bigint): { label: string; daysLeft: number; penaltyNote?: string } {
  const expirySec = Number(lockExpiry);
  if (expirySec === 0) return { label: "", daysLeft: 0 };
  const secsLeft  = expirySec - Math.floor(Date.now() / 1000);
  if (secsLeft <= 0) return { label: "", daysLeft: 0 };
  const daysLeft  = Math.ceil(secsLeft / 86400);
  const date      = new Date(expirySec * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  return { label: `Unlocks ${date} (${daysLeft}d remaining)`, daysLeft };
}

export default function StakePage() {
  const { address, isConnected }        = useAccount();
  const { position, pendingYield: livePending, refetch } = useStakePosition();
  const { globalBaseApyBps }            = useCurrentAPY();
  const { score }                       = useCreditScore();
  const { writeContractAsync, isPending } = useWriteContract();

  const [stakeAmount, setStakeAmount]   = useState("");
  const [unstakeAmount, setUnstakeAmount] = useState("");
  const [selectedTier, setSelectedTier] = useState<keyof typeof LOCK_TIERS>("FLEXIBLE");
  const [reviewing, setReviewing]       = useState(false);
  const [activeTab, setActiveTab]       = useState("stake");

  // Native QIE balance - staking asset is the chain's own coin
  const { data: balanceData, refetch: refetchBalance } = useBalance({
    address,
    query: { enabled: !!address },
  });
  const qieBalance    = balanceData ? Number(formatEther(balanceData.value)) : 0;
  const maxStakeable  = Math.max(qieBalance - GAS_HEADROOM_QIE, 0);

  const amountNum   = parseFloat(stakeAmount) || 0;
  const baseApyBps  = Number(globalBaseApyBps ?? 0n);
  const projection  = useProjectedAPY(score, LOCK_TIER_VALUES[selectedTier], baseApyBps);
  const isWhale     = amountNum > STANDARD_BOOSTED_CAP_QIE;
  const isOverCap   = amountNum > WHALE_THRESHOLD_QIE;

  const lockInfo         = position ? formatLockExpiry(position.lockExpiry) : null;
  const isCurrentlyLocked = lockInfo ? lockInfo.daysLeft > 0 : false;
  const currentTierKey   = position
    ? (Object.keys(LOCK_TIERS) as (keyof typeof LOCK_TIERS)[])[Number(position.lockTier)]
    : "FLEXIBLE";
  const penaltyBps       = LOCK_TIERS[currentTierKey]?.penaltyBps ?? 0;
  const unstakeAmountNum = parseFloat(unstakeAmount) || 0;
  const earlyExitFee     = isCurrentlyLocked && unstakeAmountNum > 0
    ? (unstakeAmountNum * penaltyBps) / 10_000
    : 0;

  const handleStake = async () => {
    if (!stakeAmount || amountNum <= 0) return;
    if (amountNum > maxStakeable) {
      toast.error(`Insufficient QIE. You can stake up to ${maxStakeable.toFixed(4)} QIE (gas headroom kept aside).`);
      return;
    }
    try {
      // Native staking - ONE transaction, no token approval needed.
      toast.info("Confirm in your wallet - staking native QIE…");
      await writeContractAsync({
        ...yieldVaultContract,
        functionName: "stake",
        args: [LOCK_TIER_VALUES[selectedTier]],
        value: parseEther(stakeAmount),
      });
      toast.success("Staked! Your QIE is now earning DEX fees.");
      setStakeAmount("");
      setReviewing(false);
      refetch(); refetchBalance();
    } catch (e: any) {
      toast.error(e?.shortMessage ?? "Transaction failed");
      setReviewing(false);
    }
  };

  const handleUnstake = async () => {
    if (!unstakeAmount || parseFloat(unstakeAmount) <= 0) return;
    try {
      await writeContractAsync({
        ...yieldVaultContract,
        functionName: "unstake",
        args: [parseEther(unstakeAmount)],
      });
      toast.success("Unstaked - QIE sent to your wallet!");
      setUnstakeAmount("");
      refetch(); refetchBalance();
    } catch (e: any) {
      toast.error(e?.shortMessage ?? "Transaction failed");
    }
  };

  const handleClaimYield = async () => {
    try {
      await writeContractAsync({
        ...yieldVaultContract,
        functionName: "claimYield",
      });
      toast.success("Yield claimed in QIE!");
      refetch(); refetchBalance();
    } catch (e: any) {
      toast.error(e?.shortMessage ?? "Nothing to claim");
    }
  };

  if (!isConnected) {
    return (
      <div className="text-center py-28 space-y-5 animate-in fade-in duration-500">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/25 flex items-center justify-center mx-auto">
          <Coins className="w-6 h-6 text-primary" />
        </div>
        <div>
          <p className="font-heading text-3xl">First, connect your wallet</p>
          <p className="text-muted-foreground text-base mt-2">The fees are already flowing. Come take your share.</p>
        </div>
      </div>
    );
  }

  return (
    <NetworkGuard>
      <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">

        {/* Header with balance pill */}
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <p className="eyebrow">Engine one</p>
            <h1 className="font-heading text-4xl sm:text-5xl tracking-tight mt-3">Stake QIE</h1>
            <p className="text-base text-muted-foreground mt-2">The chain&apos;s own coin, working the DEX. Fees back at your multiplier.</p>
          </div>
          <span className="inline-flex items-center gap-2 text-xs border border-border/60 rounded-full px-3.5 py-1.5">
            <Wallet className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="num text-foreground">{qieBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
            <span className="text-muted-foreground">QIE</span>
          </span>
        </div>

        <Tabs value={activeTab} onValueChange={v => { setActiveTab(v); setReviewing(false); }}>
          <TabsList className="w-full">
            <TabsTrigger value="stake"   className="flex-1">Stake</TabsTrigger>
            <TabsTrigger value="unstake" className="flex-1">Unstake</TabsTrigger>
          </TabsList>

          {/* ── Stake tab ── */}
          <TabsContent value="stake" className="space-y-4 mt-4">

            {!reviewing ? (
              <>
                {/* Amount */}
                <Card className="glow-card border-0">
                  <CardContent className="pt-6 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Amount (QIE)</Label>
                      <span className="text-xs text-muted-foreground">
                        Stakeable:{" "}
                        <button
                          type="button"
                          className="num text-primary hover:text-primary/80 transition-colors"
                          onClick={() => setStakeAmount(maxStakeable > 0 ? maxStakeable.toFixed(4) : "0")}
                          disabled={isPending || maxStakeable <= 0}
                        >
                          {maxStakeable.toLocaleString(undefined, { maximumFractionDigits: 4 })} QIE
                        </button>
                      </span>
                    </div>
                    <div className="relative">
                      <Input
                        type="number"
                        placeholder="0.0000"
                        value={stakeAmount}
                        onChange={e => setStakeAmount(e.target.value)}
                        disabled={isPending}
                        className={`num pr-14 h-11 text-lg ${amountNum > maxStakeable && qieBalance > 0 ? "border-destructive/60 focus-visible:ring-destructive/40" : ""}`}
                      />
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-primary hover:text-primary-foreground px-2 py-1 rounded-md bg-primary/12 hover:bg-primary transition-all duration-200"
                        onClick={() => setStakeAmount(maxStakeable > 0 ? maxStakeable.toFixed(4) : "0")}
                        disabled={isPending || maxStakeable <= 0}
                      >
                        MAX
                      </button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Native staking - one transaction, no token approval. ~{GAS_HEADROOM_QIE} QIE is kept aside for gas.
                    </p>
                    {amountNum > maxStakeable && qieBalance > 0 && (
                      <div className="flex items-center gap-2 text-xs bg-destructive/8 border border-destructive/25 rounded-lg p-2.5 text-destructive">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        Not enough QIE. You can stake up to {maxStakeable.toFixed(4)} QIE.
                      </div>
                    )}
                    {isWhale && !isOverCap && (
                      <div className="text-xs bg-gold/8 border border-gold/25 rounded-lg p-2.5 text-gold">
                        Boosted APY applies to your first {STANDARD_BOOSTED_CAP_QIE.toLocaleString()} QIE. The rest earns base APY.
                      </div>
                    )}
                    {isOverCap && (
                      <div className="text-xs bg-gold/8 border border-gold/25 rounded-lg p-2.5 text-gold">
                        Stakes above {WHALE_THRESHOLD_QIE.toLocaleString()} QIE get an extended boost cap of 75,000 QIE.
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Lock tier selection - boarding-pass stubs */}
                <Card className="glow-card border-0">
                  <CardHeader>
                    <CardTitle className="text-sm">Lock Tier</CardTitle>
                    <CardDescription className="text-xs">Longer commitment, better terms.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-2.5">
                    {(Object.entries(LOCK_TIERS) as [keyof typeof LOCK_TIERS, typeof LOCK_TIERS[keyof typeof LOCK_TIERS]][]).map(([key, tier]) => {
                      const isSelected = selectedTier === key;
                      const isGoldTier = GOLD_TIERS.has(key);
                      return (
                        <button
                          key={key}
                          onClick={() => setSelectedTier(key)}
                          disabled={isPending}
                          className={`group relative p-3.5 rounded-xl border text-left text-sm transition-all duration-200 ${
                            isSelected
                              ? isGoldTier
                                ? "border-gold/60 bg-gold/8 shadow-[0_0_24px_-10px_var(--gold)]"
                                : "border-primary/60 bg-primary/8 shadow-[0_0_24px_-10px_var(--primary)]"
                              : "border-border/60 hover:border-foreground/30 hover:bg-white/3 hover:-translate-y-0.5"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <p className="font-semibold">{tier.label}</p>
                            {isSelected && (
                              <span className={`w-4.5 h-4.5 rounded-full flex items-center justify-center ${isGoldTier ? "bg-gold" : "bg-primary"}`}>
                                <Check className={`w-3 h-3 ${isGoldTier ? "text-gold-foreground" : "text-primary-foreground"}`} />
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {tier.bonusBps > 0
                              ? <span className={isSelected && isGoldTier ? "text-gold" : isSelected ? "text-primary" : ""}>+{tier.bonusBps / 100}% rewards weight</span>
                              : "No bonus"}
                            {tier.penaltyBps > 0 ? ` · ${tier.penaltyBps / 100}% early exit` : ""}
                          </p>
                        </button>
                      );
                    })}
                  </CardContent>
                </Card>

                {/* APY breakdown - full equation, always visible */}
                {baseApyBps > 0 ? (
                  <>
                    <ApyBreakdown
                      baseApyBps={baseApyBps}
                      score={score}
                      lockTier={LOCK_TIER_VALUES[selectedTier]}
                    />
                    {amountNum > 0 && (
                      <Card className="glow-card-green border-0">
                        <CardContent className="pt-3.5 pb-3.5 flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Est. yearly yield on {amountNum.toLocaleString()} QIE</span>
                          <span className="num text-primary font-bold">
                            +{(amountNum * projection.boostedApyPercent / 100).toFixed(4)} QIE
                          </span>
                        </CardContent>
                      </Card>
                    )}
                  </>
                ) : (
                  <Card className="glow-card border-0">
                    <CardContent className="pt-4 pb-4 flex items-start gap-3">
                      <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      <p className="text-xs text-muted-foreground">
                        Protocol APY not set yet. Your effective rate will appear here once the first yield harvest lands.
                      </p>
                    </CardContent>
                  </Card>
                )}

                <Button
                  className="w-full h-11 text-sm group"
                  onClick={() => { if (amountNum > 0) setReviewing(true); }}
                  disabled={isPending || !stakeAmount || amountNum <= 0 || amountNum > maxStakeable}
                >
                  {amountNum > maxStakeable && amountNum > 0 ? "Insufficient QIE" : (
                    <>Review Stake <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-0.5 transition-transform" /></>
                  )}
                </Button>
              </>
            ) : (
              <>
                {/* Pre-submit review - receipt style with perforation */}
                <div className="rounded-2xl border border-primary/30 bg-card glow-card-green overflow-hidden">
                  <div className="px-6 pt-5 pb-4">
                    <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-primary/80 mb-3">Confirm · Stake Order</p>
                    <p className="num text-4xl font-bold tracking-tight">{amountNum.toLocaleString()}<span className="text-base text-muted-foreground font-normal"> QIE</span></p>
                  </div>
                  <div className="perforation mx-6" />
                  <div className="px-6 pt-4 pb-5 space-y-2.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Lock Tier</span>
                      <Badge variant="outline" className={GOLD_TIERS.has(selectedTier) ? "border-gold/40 text-gold" : ""}>{LOCK_TIERS[selectedTier].label}</Badge>
                    </div>
                    {baseApyBps > 0 && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Effective APY</span>
                          <span className="num text-primary font-semibold">{projection.boostedApyPercent.toFixed(2)}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Est. yearly yield</span>
                          <span className="num text-primary">+{(amountNum * projection.boostedApyPercent / 100).toFixed(4)} QIE</span>
                        </div>
                      </>
                    )}
                    {LOCK_TIERS[selectedTier].penaltyBps > 0 && (
                      <div className="flex justify-between border-t border-border/50 pt-2.5 mt-1">
                        <span className="text-muted-foreground">Early exit fee</span>
                        <span className="text-gold">{LOCK_TIERS[selectedTier].penaltyBps / 100}% if withdrawn early</span>
                      </div>
                    )}
                    <p className="text-[11px] text-muted-foreground pt-1">Native staking - your wallet prompts once. No approval step.</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Button variant="outline" onClick={() => setReviewing(false)} disabled={isPending}>
                    Edit
                  </Button>
                  <Button
                    onClick={handleStake}
                    disabled={isPending}
                  >
                    {isPending ? "Confirming…" : "Stake QIE"}
                  </Button>
                </div>
              </>
            )}
          </TabsContent>

          {/* ── Unstake tab ── */}
          <TabsContent value="unstake" className="space-y-4 mt-4">
            {position && position.principal > 0n ? (
              <>
                {/* Position summary */}
                <Card className="glow-card border-0">
                  <CardContent className="pt-6 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Currently staked</span>
                      <span className="num font-medium">
                        {Number(formatEther(position.principal)).toLocaleString(undefined, { maximumFractionDigits: 4 })} QIE
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Pending yield</span>
                      <span className="num font-medium text-primary">
                        {Number(formatEther(livePending)).toFixed(6)} QIE
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Lock tier</span>
                      <Badge variant="outline" className={GOLD_TIERS.has(currentTierKey) ? "border-gold/40 text-gold" : ""}>{LOCK_TIERS[currentTierKey].label}</Badge>
                    </div>
                    {lockInfo && lockInfo.daysLeft > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Unlock date</span>
                        <span className="text-gold font-medium text-xs">{lockInfo.label}</span>
                      </div>
                    )}
                    {lockInfo && lockInfo.daysLeft === 0 && currentTierKey !== "FLEXIBLE" && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Lock status</span>
                        <Badge variant="secondary" className="text-primary bg-primary/12 border-primary/30">Unlocked - no fee</Badge>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Amount input */}
                <Card className="glow-card border-0">
                  <CardContent className="pt-6 space-y-3">
                    <Label>Amount to unstake (QIE)</Label>
                    <Input
                      type="number"
                      placeholder="0.0000"
                      className="num h-11 text-lg"
                      value={unstakeAmount}
                      onChange={e => setUnstakeAmount(e.target.value)}
                    />
                    <button
                      type="button"
                      className="underline-grow text-xs text-primary transition-colors"
                      onClick={() => setUnstakeAmount(formatEther(position.principal))}
                    >
                      Max: {Number(formatEther(position.principal)).toLocaleString(undefined, { maximumFractionDigits: 4 })} QIE
                    </button>
                  </CardContent>
                </Card>

                {/* Early exit warning */}
                {isCurrentlyLocked && unstakeAmountNum > 0 && (
                  <div className="flex items-start gap-3 text-xs bg-destructive/8 border border-destructive/25 rounded-xl p-3.5 text-red-300">
                    <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-medium text-red-200">Early exit fee applies</p>
                      <p>
                        Your position is locked until {lockInfo?.label?.replace("Unlocks ", "")}.
                        Unstaking now charges a <strong>{penaltyBps / 100}%</strong> fee.
                      </p>
                      <p>
                        Fee: <span className="num font-semibold">{earlyExitFee.toFixed(6)} QIE</span>
                        {" "}→ You receive:{" "}
                        <span className="num font-semibold">
                          {(unstakeAmountNum - earlyExitFee).toFixed(6)} QIE
                        </span>
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Button variant="outline" onClick={handleClaimYield} disabled={isPending}>
                    Claim Yield
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleUnstake}
                    disabled={isPending || !unstakeAmount}
                  >
                    {isPending ? "Confirming…" : isCurrentlyLocked ? "Early Exit" : "Unstake"}
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-center py-14 space-y-4">
                <div className="w-12 h-12 rounded-xl bg-muted/40 border border-border/50 flex items-center justify-center mx-auto">
                  <Coins className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground text-sm">You have no active stake position.</p>
                <Button variant="outline" size="sm" onClick={() => setActiveTab("stake")}>
                  Go to Stake
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </NetworkGuard>
  );
}
