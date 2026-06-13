"use client";

import { useAccount, useWriteContract, useReadContract } from "wagmi";
import Link from "next/link";
import { toast } from "sonner";
import { formatUnits } from "viem";
import {
  Wallet, TrendingUp, Landmark, Coins, IdCard,
  Globe, ArrowRight, Sparkles, CircleHelp, Lock, BadgeCheck, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CountUp } from "@/components/ui/count-up";
import { NetworkGuard } from "@/components/layout/NetworkGuard";
import { ApyBreakdown } from "@/components/apy/ApyBreakdown";
import { useStakePosition } from "@/hooks/useStakePosition";
import { useCurrentAPY } from "@/hooks/useCurrentAPY";
import { useCreditScore } from "@/hooks/useCreditScore";
import { useVaultStats } from "@/hooks/useVaultStats";
import { yieldVaultContract, lendingPoolContract } from "@/lib/contracts";
import { LOCK_TIERS, SCORE_BANDS } from "@/lib/constants";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatLockExpiry(lockExpiry: bigint): { label: string; daysLeft: number } {
  const expirySec = Number(lockExpiry);
  if (expirySec === 0) return { label: "No lock", daysLeft: 0 };
  const secsLeft = expirySec - Math.floor(Date.now() / 1000);
  if (secsLeft <= 0) return { label: "Lock expired", daysLeft: 0 };
  const daysLeft = Math.ceil(secsLeft / 86400);
  const dateStr = new Date(expirySec * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  return { label: `Until ${dateStr} (${daysLeft}d)`, daysLeft };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { address, isConnected }        = useAccount();
  const { position, pendingYield: livePending, isLoading, refetch } = useStakePosition();
  const { globalBaseApyBps, effectiveApyPercent, baseApyPercent } = useCurrentAPY();
  const { score, band, isKYCVerified, profile } = useCreditScore();
  const { totalStakedQie, totalYieldPoolQie, isLoading: statsLoading } = useVaultStats();
  const { writeContractAsync, isPending } = useWriteContract();

  // Lending positions (supply + borrow) so the dashboard shows the whole portfolio
  const { data: supplierPos, refetch: refetchSupply } = useReadContract({
    ...lendingPoolContract,
    functionName: "getSupplierPosition",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const { data: borrowPos } = useReadContract({
    ...lendingPoolContract,
    functionName: "getBorrowerPosition",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const { data: supplyRateBps } = useReadContract({
    ...lendingPoolContract,
    functionName: "getCurrentSupplyRateBps",
  });

  if (!isConnected) {
    return (
      <div className="text-center py-28 space-y-5 animate-in fade-in duration-500">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/25 flex items-center justify-center mx-auto">
          <Wallet className="w-6 h-6 text-primary" />
        </div>
        <div>
          <p className="font-heading text-2xl">Connect your wallet</p>
          <p className="text-muted-foreground text-sm mt-1.5">Your portfolio, yield and membership live here.</p>
        </div>
      </div>
    );
  }

  // ── Derived numbers ────────────────────────────────────────────────────────
  const staked   = position ? Number(formatUnits(position.principal, 18)) : 0;
  const pending  = Number(formatUnits(livePending, 18));
  const supplied = supplierPos ? Number(formatUnits((supplierPos as readonly [bigint, bigint])[0], 6)) : 0;
  const supplyYield = supplierPos ? Number(formatUnits((supplierPos as readonly [bigint, bigint])[1], 6)) : 0;
  const borrow   = borrowPos as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, boolean] | undefined;
  const debt     = borrow ? Number(formatUnits(borrow[1], 6)) + Number(formatUnits(borrow[2], 6)) : 0;

  const supplyApyPct = supplyRateBps ? Number(supplyRateBps) / 100 : 0;
  const baseApyBpsNum = Number(globalBaseApyBps ?? 0n);

  const stakeApyPct   = effectiveApyPercent ?? 0;
  const stakeYearlyQie = staked * stakeApyPct / 100;

  const lockTierKey = position
    ? (Object.keys(LOCK_TIERS) as (keyof typeof LOCK_TIERS)[])[Number(position.lockTier)]
    : "FLEXIBLE";
  const lockInfo = position ? formatLockExpiry(position.lockExpiry) : null;
  const isLocked = lockInfo ? lockInfo.daysLeft > 0 : false;

  const nextBand = SCORE_BANDS.find(b => b.min > score);

  const handleClaimYield = async () => {
    try {
      await writeContractAsync({ ...yieldVaultContract, functionName: "claimYield" });
      toast.success("Yield claimed!");
      refetch();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? (e as { shortMessage?: string }).shortMessage ?? "Nothing to claim" : "Nothing to claim");
    }
  };

  const handleClaimSupplyYield = async () => {
    try {
      await writeContractAsync({ ...lendingPoolContract, functionName: "claimSupplierYield" });
      toast.success("Supply yield claimed!");
      refetchSupply();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? (e as { shortMessage?: string }).shortMessage ?? "Nothing to claim" : "Nothing to claim");
    }
  };

  return (
    <NetworkGuard>
      <div className="space-y-7">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-end justify-between flex-wrap gap-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div>
            <p className="eyebrow">Your money</p>
            <h1 className="font-heading text-4xl sm:text-5xl tracking-tight mt-3">Dashboard</h1>
            <p className="text-base text-muted-foreground mt-2">
              Everything you&apos;ve got working for you, in one view.
            </p>
          </div>
          <Link
            href="/faq"
            className="group hidden sm:inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border/60 hover:border-foreground/25 rounded-lg px-3 py-1.5 transition-all duration-200"
          >
            <CircleHelp className="w-3.5 h-3.5" />
            How it works
          </Link>
        </div>

        {/* ── Portfolio summary ───────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-in fade-in slide-in-from-bottom-3 duration-500">
          <SummaryCard
            icon={<Coins className="w-4 h-4 text-primary" />}
            label="Staked"
            value={staked} suffix=" QIE" decimals={4}
            sub={pending > 0 ? `+${pending.toFixed(6)} QIE claimable` : "earning DEX fees"}
          />
          <SummaryCard
            icon={<Landmark className="w-4 h-4 text-gold" />}
            label="Supplied"
            value={supplied} prefix="$" decimals={2}
            sub={debt > 0 ? `$${debt.toFixed(2)} borrowed against` : supplyYield > 0 ? `+$${supplyYield.toFixed(4)} claimable` : "lending pool (QUSDC)"}
          />
          <SummaryCard
            icon={<TrendingUp className="w-4 h-4 text-primary" />}
            label="Your Stake APY"
            value={stakeApyPct} suffix="%" decimals={2}
            sub={stakeYearlyQie > 0 ? `≈ +${stakeYearlyQie.toFixed(4)} QIE / year` : "stake to activate"}
            accent={stakeApyPct > 0 ? "text-primary" : undefined}
          />
          <SummaryCard
            icon={<BadgeCheck className="w-4 h-4 text-gold" />}
            label="Credit Score"
            value={score} decimals={0}
            sub={`${band.label} tier`}
          />
        </div>

        {/* ── Membership pass — the signature card ─────────────────────────── */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="hover-lift relative rounded-2xl border border-gold/25 bg-card overflow-hidden glow-card-pink">
            {/* Gold sheen sweep */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_85%_-10%,oklch(0.8_0.115_85/8%),transparent_60%)]" />

            <div className="relative px-6 sm:px-8 pt-6 pb-5 flex flex-wrap items-start justify-between gap-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.25em] text-gold/80">
                  <span className="w-1.5 h-1.5 rounded-full bg-gold pulse-dot" />
                  YieldPass · Member
                </div>
                <div>
                  <p className="font-heading text-3xl italic gold-text">{band.label}</p>
                  <p className="text-xs font-mono text-muted-foreground mt-1.5">
                    {address?.slice(0, 10)}····{address?.slice(-8)}
                  </p>
                </div>
                {nextBand ? (
                  <p className="text-xs text-muted-foreground">
                    <span className="num text-gold">{nextBand.min - score} pts</span> to {nextBand.label}{" "}
                    ({(nextBand.multiplierBps / 10_000).toFixed(1)}× APY)
                  </p>
                ) : (
                  <p className="text-xs text-gold">Highest tier reached — 1.5× APY active</p>
                )}
              </div>

              <div className="text-right space-y-2">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Credit Score</p>
                <p className="num text-5xl font-bold tracking-tight">
                  {score}
                  <span className="text-lg text-muted-foreground font-normal"> / 1000</span>
                </p>
                {/* Progress with band markers */}
                <div className="w-44 sm:w-56 bg-muted/50 rounded-full h-1.5 relative overflow-hidden ml-auto">
                  <div
                    className="h-full rounded-full qie-gradient transition-all duration-1000"
                    style={{ width: `${Math.min((score / 1000) * 100, 100)}%` }}
                  />
                  {SCORE_BANDS.slice(1).map(b => (
                    <div key={b.min} className="absolute top-0 h-full w-px bg-background" style={{ left: `${(b.min / 1000) * 100}%` }} />
                  ))}
                </div>
              </div>
            </div>

            <div className="perforation mx-6 sm:mx-8" />

            {/* Pass stub — the three verification steps */}
            <div className="relative grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border/40">
              <PassStep
                label="KYC Identity"
                pts="+200 pts"
                icon={<IdCard className="w-4 h-4" />}
                done={isKYCVerified}
                href="/reputation/kyc"
              />
              <PassStep
                label="Credit Proofs"
                pts="up to +300"
                icon={<Globe className="w-4 h-4" />}
                done={score > 200}
                href="/reputation/web2"
                locked={!isKYCVerified}
              />
              <PassStep
                label="DEX Wallets"
                pts="up to +250"
                icon={<Wallet className="w-4 h-4" />}
                done={(profile?.childWalletCount ?? 0) > 0}
                href="/reputation/wallets"
                locked={!isKYCVerified}
              />
            </div>
          </div>
        </div>

        {/* ── APY breakdown ────────────────────────────────────────────────── */}
        <div className="animate-in fade-in slide-in-from-bottom-5 duration-700">
          {baseApyBpsNum > 0 ? (
            <ApyBreakdown
              baseApyBps={baseApyBpsNum}
              score={score}
              lockTier={position ? (Number(position.lockTier) as 0 | 1 | 2 | 3) : 0}
            />
          ) : (
            <Card className="glow-card border-0">
              <CardContent className="pt-4 pb-4 flex items-start gap-3">
                <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div className="text-xs text-muted-foreground">
                  <p className="text-sm font-medium text-foreground mb-0.5">Base APY updates after each yield harvest</p>
                  Yield comes from QIEDex trading fees, harvested daily. Once the first harvest lands,
                  your personalised rate appears here.
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Product positions ───────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-6 duration-700">

          {/* Staking card */}
          <Card className="hover-lift glow-card border-0 flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/25 flex items-center justify-center">
                    <Coins className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-sm">Staking</CardTitle>
                    <p className="text-[11px] text-muted-foreground">Native QIE · QIEDex fees</p>
                  </div>
                </div>
                {staked > 0
                  ? <Badge className="bg-primary/12 text-primary border-primary/30">Active</Badge>
                  : <Badge variant="secondary" className="text-muted-foreground">Not started</Badge>}
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-between space-y-4">
              {staked > 0 ? (
                <>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-3.5 text-sm">
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Staked</p>
                      <p className="num font-semibold text-base mt-0.5">{staked.toLocaleString(undefined, { maximumFractionDigits: 4 })} QIE</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Your APY</p>
                      <p className="num font-semibold text-base text-primary mt-0.5">
                        {effectiveApyPercent ? `${effectiveApyPercent.toFixed(2)}%` : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Lock</p>
                      <p className="font-medium text-xs mt-0.5">
                        {LOCK_TIERS[lockTierKey].label}
                        {isLocked && lockInfo && <span className="text-gold block mt-0.5">{lockInfo.label}</span>}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Claimable</p>
                      <p className="num font-semibold text-base text-primary mt-0.5">{pending.toFixed(6)} QIE</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1" render={(props) => <Link {...props} href="/stake" />}>
                      Manage
                    </Button>
                    <Button size="sm" className="flex-1" onClick={handleClaimYield} disabled={isPending || pending === 0}>
                      {isPending ? "Claiming…" : "Claim Yield"}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Stake native QIE — one transaction, no approvals. The protocol provides
                    QIEDex liquidity and trading fees come back daily, multiplied up to 1.5× by your score.
                  </p>
                  <Button size="sm" className="w-full group" render={(props) => <Link {...props} href="/stake" />}>
                    Start Staking <ArrowRight className="w-3.5 h-3.5 ml-1 group-hover:translate-x-0.5 transition-transform" />
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Lending card */}
          <Card className="hover-lift glow-card border-0 flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-gold/10 border border-gold/25 flex items-center justify-center">
                    <Landmark className="w-4 h-4 text-gold" />
                  </div>
                  <div>
                    <CardTitle className="text-sm">Lending</CardTitle>
                    <p className="text-[11px] text-muted-foreground">Borrower interest</p>
                  </div>
                </div>
                {supplied > 0 || debt > 0
                  ? <Badge className="bg-primary/12 text-primary border-primary/30">Active</Badge>
                  : <Badge variant="secondary" className="text-muted-foreground">Not started</Badge>}
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-between space-y-4">
              {supplied > 0 || debt > 0 ? (
                <>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-3.5 text-sm">
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Supplied</p>
                      <p className="num font-semibold text-base mt-0.5">${supplied.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Supply APY</p>
                      <p className="num font-semibold text-base text-primary mt-0.5">{supplyApyPct.toFixed(2)}%</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Borrowed</p>
                      <p className="num font-semibold text-base mt-0.5">{debt > 0 ? `$${debt.toFixed(2)}` : "—"}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Claimable</p>
                      <p className="num font-semibold text-base text-primary mt-0.5">${supplyYield.toFixed(4)}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1" render={(props) => <Link {...props} href="/lending" />}>
                      Manage
                    </Button>
                    <Button size="sm" className="flex-1" onClick={handleClaimSupplyYield} disabled={isPending || supplyYield === 0}>
                      {isPending ? "Claiming…" : "Claim Yield"}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Supply QUSDC and earn interest from overcollateralised borrowers — rates
                    adjust with utilisation. Or borrow QUSDC against WETH; reputation unlocks
                    better LTV and discounts.
                  </p>
                  <Button size="sm" variant="outline" className="w-full group border-gold/30 text-gold hover:bg-gold/10 hover:border-gold/50" render={(props) => <Link {...props} href="/lending" />}>
                    Explore Lending <ArrowRight className="w-3.5 h-3.5 ml-1 group-hover:translate-x-0.5 transition-transform" />
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Protocol stats + explainer ──────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-7 duration-700">
          <Card className="glow-card border-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground font-normal uppercase tracking-widest">Protocol</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="num text-xl font-bold">{statsLoading ? "…" : `${totalStakedQie.toLocaleString(undefined, { maximumFractionDigits: 4 })} QIE`}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Total Staked</p>
              </div>
              <div>
                <p className="num text-xl font-bold">{statsLoading ? "…" : `${totalYieldPoolQie.toLocaleString(undefined, { maximumFractionDigits: 6 })} QIE`}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Yield Pool (undistributed)</p>
              </div>
            </CardContent>
          </Card>

          <Card className="glow-card border-0">
            <CardContent className="pt-4 pb-4 flex items-start gap-3">
              <Lock className="w-4 h-4 text-gold mt-0.5 shrink-0" />
              <div className="text-xs text-muted-foreground leading-relaxed">
                <p className="text-sm font-medium text-foreground mb-1">Where does the yield come from?</p>
                <span className="text-primary font-medium">Staking</span> earns real QIEDex trading fees
                (85% to stakers, 10% treasury, 5% insurance). {" "}
                <span className="text-gold font-medium">Lending</span> earns interest paid by
                overcollateralised borrowers. No emissions — {" "}
                <Link href="/faq" className="underline-grow text-foreground transition-colors">
                  read the full FAQ
                </Link>.
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
    </NetworkGuard>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryCard({ icon, label, value, prefix = "", suffix = "", decimals = 0, sub, accent }: {
  icon: React.ReactNode; label: string; value: number; prefix?: string; suffix?: string; decimals?: number; sub: string; accent?: string;
}) {
  return (
    <Card className="hover-lift glow-card border-0">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center gap-1.5 mb-3">
          {icon}
          <p className="text-[11px] text-muted-foreground uppercase tracking-[0.15em]">{label}</p>
        </div>
        <p className={`num text-2xl sm:text-3xl font-bold tracking-tight ${accent ?? ""}`}>
          <CountUp value={value} prefix={prefix} suffix={suffix} decimals={decimals} />
        </p>
        <p className="text-xs text-muted-foreground mt-1.5">{sub}</p>
      </CardContent>
    </Card>
  );
}

function PassStep({ label, pts, icon, done, href, locked }: {
  label: string; pts: string; icon: React.ReactNode;
  done: boolean; href: string; locked?: boolean;
}) {
  const inner = (
    <div className={`group flex items-center justify-between gap-3 px-6 sm:px-8 py-4 transition-colors duration-200 ${
      locked ? "opacity-45 cursor-not-allowed" : "hover:bg-white/3 cursor-pointer"
    }`}>
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-200 ${
          done ? "bg-primary/15 text-primary" : "bg-muted/50 text-muted-foreground group-hover:text-foreground"
        }`}>
          {done ? <Check className="w-4 h-4" /> : icon}
        </div>
        <div>
          <p className="text-xs font-semibold">{label}</p>
          <p className={`text-[10px] font-mono ${done ? "text-primary" : "text-muted-foreground"}`}>
            {done ? "Verified" : pts}
          </p>
        </div>
      </div>
      {!done && !locked && (
        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-gold group-hover:translate-x-0.5 transition-all duration-200" />
      )}
      {locked && <Lock className="w-3.5 h-3.5 text-muted-foreground/50" />}
    </div>
  );

  if (locked) return inner;
  return <Link href={href} className="block">{inner}</Link>;
}
