"use client";

import { useState } from "react";
import { useAccount, useWriteContract, useReadContract } from "wagmi";
import { parseUnits, formatUnits, erc20Abi } from "viem";
import { toast } from "sonner";
import { Landmark, ShieldCheck, Inbox } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { NetworkGuard } from "@/components/layout/NetworkGuard";
import { HealthFactorGuide } from "@/components/lending/HealthFactorGuide";
import { useCreditScore } from "@/hooks/useCreditScore";
import { useEthPrice } from "@/hooks/useEthPrice";
import { lendingPoolContract, priceOracleContract } from "@/lib/contracts";
import { CONTRACTS } from "@/lib/constants";

// ─── Reputation tier config ────────────────────────────────────────────────

const TIERS = [
  {
    min: 0,   max: 200,  label: "No Boost",  ltvPct: 60, discountPct: 0,
    color: "border-border/60 bg-muted/20", text: "text-muted-foreground",
    badge: "bg-muted/40 text-muted-foreground border-border/60",
  },
  {
    min: 201, max: 400,  label: "Bronze",    ltvPct: 64, discountPct: 3,
    color: "border-orange-700/40 bg-orange-800/8", text: "text-orange-400",
    badge: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  },
  {
    min: 401, max: 600,  label: "Silver",    ltvPct: 68, discountPct: 6,
    color: "border-slate-400/40 bg-slate-400/5", text: "text-slate-300",
    badge: "bg-slate-400/10 text-slate-300 border-slate-400/30",
  },
  {
    min: 601, max: 800,  label: "Gold",      ltvPct: 72, discountPct: 9,
    color: "border-gold/40 bg-gold/6", text: "text-gold",
    badge: "bg-gold/10 text-gold border-gold/30",
  },
  {
    min: 801, max: 1000, label: "Platinum",  ltvPct: 75, discountPct: 12,
    color: "border-primary/40 bg-primary/6", text: "text-primary",
    badge: "bg-primary/10 text-primary border-primary/30",
    shield: true,
  },
] as const;

function getTier(score: number) {
  return TIERS.find(t => score >= t.min && score <= t.max) ?? TIERS[0];
}

function bpsToPercent(bps: bigint | undefined, decimals = 2) {
  if (!bps) return "-";
  return (Number(bps) / 100).toFixed(decimals) + "%";
}

function hfColor(hfBps: number) {
  if (hfBps >= 15000) return "text-primary";
  if (hfBps >= 12000) return "text-gold";
  return "text-red-400";
}

// ─── Main page ─────────────────────────────────────────────────────────────

export default function LendingPage() {
  const { address, isConnected } = useAccount();
  const { score }                 = useCreditScore();
  const { ethUsd: marketEthUsd, source: priceSource } = useEthPrice();
  const { writeContractAsync, isPending } = useWriteContract();

  const [tab, setTab]                     = useState<"earn" | "borrow" | "repay" | "position">("earn");
  const [supplyInput, setSupplyInput]     = useState("");
  const [redeemInput, setRedeemInput]     = useState("");
  const [collateralInput, setCollateralInput] = useState("");
  const [borrowInput, setBorrowInput]     = useState("");
  const [repayInput, setRepayInput]       = useState("");

  const tier = getTier(score);

  // ── On-chain reads ─────────────────────────────────────────────────────

  const { data: borrowRateBps, refetch: refetchRates } = useReadContract({
    ...lendingPoolContract,
    functionName: "getCurrentBorrowRateBps",
  });
  const { data: supplyRateBps } = useReadContract({
    ...lendingPoolContract,
    functionName: "getCurrentSupplyRateBps",
  });
  const { data: utilBps } = useReadContract({
    ...lendingPoolContract,
    functionName: "getUtilizationBps",
  });
  const { data: totalSupplied } = useReadContract({
    ...lendingPoolContract,
    functionName: "totalSupplied",
  });
  const { data: totalBorrowed } = useReadContract({
    ...lendingPoolContract,
    functionName: "totalBorrowed",
  });
  const { data: personalRateBps } = useReadContract({
    ...lendingPoolContract,
    functionName: "getPersonalBorrowRateBps",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const { data: supplierPos, refetch: refetchSupply } = useReadContract({
    ...lendingPoolContract,
    functionName: "getSupplierPosition",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const { data: borrowPos, refetch: refetchBorrow } = useReadContract({
    ...lendingPoolContract,
    functionName: "getBorrowerPosition",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const { data: oraclePrice } = useReadContract({
    ...priceOracleContract,
    functionName: "getPrice",
  });

  const refetchAll = () => { refetchRates(); refetchSupply(); refetchBorrow(); };

  // ── Derived values ─────────────────────────────────────────────────────

  const utilPct    = utilBps  ? Number(utilBps)  / 100 : 0;
  const tvlDisplay = totalSupplied ? Number(formatUnits(totalSupplied as bigint, 6)).toLocaleString() : "0";
  const borrowedDisplay = totalBorrowed ? Number(formatUnits(totalBorrowed as bigint, 6)).toLocaleString() : "0";

  const supplyAmt     = supplierPos ? Number(formatUnits((supplierPos as readonly [bigint, bigint])[0], 6)) : 0;
  const pendingYield  = supplierPos ? Number(formatUnits((supplierPos as readonly [bigint, bigint])[1], 6)) : 0;

  const borrow = borrowPos as readonly [bigint,bigint,bigint,bigint,bigint,bigint,bigint,boolean] | undefined;
  const bCollateral    = borrow ? Number(formatUnits(borrow[0], 18))  : 0;
  const bPrincipal     = borrow ? Number(formatUnits(borrow[1], 6))   : 0;
  const bInterest      = borrow ? Number(formatUnits(borrow[2], 6))   : 0;
  const bCurrentLtv    = borrow ? Number(borrow[3]) / 100             : 0;
  const bMaxLtv        = borrow ? Number(borrow[4]) / 100             : 0;
  const bLiqThreshold  = borrow ? Number(borrow[5]) / 100             : 0;
  const bHfBps         = borrow ? Number(borrow[6])                   : 0;
  const bIsLiquidatable = borrow ? borrow[7]                          : false;
  const hasBorrow      = bPrincipal > 0;
  const hasSupply      = supplyAmt > 0;

  // Market price (CoinGecko, 60s refresh) for display.
  // The contract enforces LTV with the ON-CHAIN oracle price, so all collateral
  // math uses the LOWER of the two - conservative, txs never revert.
  const oracleUsd        = oraclePrice ? Number(oraclePrice as bigint) / 1e8 : 0;
  const ethUsd           = marketEthUsd > 0 ? marketEthUsd : oracleUsd > 0 ? oracleUsd : 3000;
  const safeEthUsd       = oracleUsd > 0 ? Math.min(ethUsd, oracleUsd) : ethUsd;
  const collateralAmt    = parseFloat(collateralInput) || 0;
  const collateralUsd    = collateralAmt * ethUsd;
  const maxBorrowPreview = collateralAmt * safeEthUsd * (tier.ltvPct / 100);
  const personalRatePct  = personalRateBps ? (Number(personalRateBps) / 100).toFixed(2) : "-";
  const baseRatePct      = borrowRateBps   ? (Number(borrowRateBps) / 100).toFixed(2)   : "-";

  // ── Auto-collateral (borrow-first UX) ─────────────────────────────────
  const borrowAmt         = parseFloat(borrowInput) || 0;
  const ltvFactor         = tier.ltvPct / 100;
  const minCollateralWeth = borrowAmt > 0 && safeEthUsd > 0
    ? borrowAmt / (safeEthUsd * ltvFactor)
    : 0;
  // health factor preview using liquidation threshold = ltvPct + 8
  const liqThreshFactor = (tier.ltvPct + 8) / 100;
  const previewHF       = collateralAmt > 0 && borrowAmt > 0 && safeEthUsd > 0
    ? (collateralAmt * safeEthUsd * liqThreshFactor) / borrowAmt
    : 0;
  const previewHFColor  = previewHF === 0 ? "" : previewHF >= 1.5 ? "text-primary" : previewHF >= 1.2 ? "text-gold" : "text-red-400";
  const collateralIsMin = minCollateralWeth > 0 && Math.abs(collateralAmt - minCollateralWeth) < 0.000001;

  const handleBorrowInputChange = (val: string) => {
    setBorrowInput(val);
    const amt = parseFloat(val) || 0;
    if (amt > 0 && safeEthUsd > 0) {
      setCollateralInput((amt / (safeEthUsd * ltvFactor)).toFixed(6));
    } else {
      setCollateralInput("");
    }
  };

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleSupply = async () => {
    if (!supplyInput) return;
    const amt = parseUnits(supplyInput, 6);
    try {
      toast.info("Step 1/2: Approving QUSDC…");
      await writeContractAsync({ address: CONTRACTS.qusdc, abi: erc20Abi, functionName: "approve", args: [lendingPoolContract.address, amt] });
      toast.info("Step 2/2: Supplying to pool…");
      await writeContractAsync({ ...lendingPoolContract, functionName: "supply", args: [amt] });
      toast.success("Supplied! You're now earning interest.");
      setSupplyInput(""); refetchAll();
    } catch (e: any) { toast.error(e?.shortMessage ?? "Transaction failed"); }
  };

  const handleRedeem = async () => {
    if (!redeemInput) return;
    const amt = parseUnits(redeemInput, 6);
    try {
      await writeContractAsync({ ...lendingPoolContract, functionName: "redeem", args: [amt] });
      toast.success("Withdrawn successfully!");
      setRedeemInput(""); refetchAll();
    } catch (e: any) { toast.error(e?.shortMessage ?? "Transaction failed"); }
  };

  const handleClaimYield = async () => {
    try {
      await writeContractAsync({ ...lendingPoolContract, functionName: "claimSupplierYield" });
      toast.success(`Claimed ${pendingYield.toFixed(4)} QUSDC!`);
      refetchAll();
    } catch (e: any) { toast.error(e?.shortMessage ?? "Transaction failed"); }
  };

  const handleBorrow = async () => {
    if (!collateralInput || !borrowInput) return;
    const colAmt = parseUnits(collateralInput, 18);
    const borAmt = parseUnits(borrowInput, 6);
    try {
      toast.info("Step 1/2: Approving WETH…");
      await writeContractAsync({ address: CONTRACTS.weth, abi: erc20Abi, functionName: "approve", args: [lendingPoolContract.address, colAmt] });
      toast.info("Step 2/2: Opening loan…");
      await writeContractAsync({ ...lendingPoolContract, functionName: "borrow", args: [colAmt, borAmt] });
      toast.success("Loan opened!");
      setCollateralInput(""); setBorrowInput(""); refetchAll();
    } catch (e: any) { toast.error(e?.shortMessage ?? "Transaction failed"); }
  };

  const handleRepay = async () => {
    if (!repayInput) return;
    const amt = parseUnits(repayInput, 6);
    try {
      toast.info("Step 1/2: Approving QUSDC…");
      await writeContractAsync({ address: CONTRACTS.qusdc, abi: erc20Abi, functionName: "approve", args: [lendingPoolContract.address, amt] });
      toast.info("Step 2/2: Repaying…");
      await writeContractAsync({ ...lendingPoolContract, functionName: "repay", args: [amt] });
      toast.success("Repaid!");
      setRepayInput(""); refetchAll();
    } catch (e: any) { toast.error(e?.shortMessage ?? "Transaction failed"); }
  };

  // ── Wallet gate ────────────────────────────────────────────────────────

  if (!isConnected) {
    return (
      <div className="text-center py-28 space-y-5 animate-in fade-in duration-500">
        <div className="w-14 h-14 rounded-2xl bg-gold/10 border border-gold/25 flex items-center justify-center mx-auto">
          <Landmark className="w-6 h-6 text-gold" />
        </div>
        <div>
          <p className="font-heading text-3xl">First, connect your wallet</p>
          <p className="text-base text-muted-foreground mt-2">Supply and earn, or borrow against WETH. Your call.</p>
        </div>
      </div>
    );
  }

  return (
    <NetworkGuard>
      <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">

        {/* Header */}
        <div>
          <p className="eyebrow">Engine two</p>
          <h1 className="font-heading text-4xl sm:text-5xl tracking-tight mt-3">Lending</h1>
          <p className="text-base text-muted-foreground mt-2">
            Be the bank, or borrow from it. Either way, your reputation sets the terms.
          </p>
        </div>

        {/* Protocol stats */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="hover-lift glow-card border-0">
            <CardContent className="pt-4 pb-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Supply APY</p>
              <p className="num text-2xl font-bold text-primary mt-1">{bpsToPercent(supplyRateBps as bigint | undefined)}</p>
            </CardContent>
          </Card>
          <Card className="hover-lift glow-card border-0">
            <CardContent className="pt-4 pb-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Utilisation</p>
              <p className={`num text-2xl font-bold mt-1 ${utilPct > 85 ? "text-red-400" : utilPct > 70 ? "text-gold" : "text-foreground"}`}>
                {utilPct.toFixed(1)}%
              </p>
            </CardContent>
          </Card>
          <Card className="hover-lift glow-card border-0">
            <CardContent className="pt-4 pb-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Borrow Rate</p>
              <p className="num text-2xl font-bold mt-1">{bpsToPercent(borrowRateBps as bigint | undefined)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Utilisation bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Pool utilisation</span>
            <span className="num">${borrowedDisplay} borrowed / ${tvlDisplay} supplied</span>
          </div>
          <div className="w-full bg-muted/40 rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all duration-700 ${
                utilPct > 85 ? "bg-red-500" : utilPct > 70 ? "bg-gold" : "bg-primary"
              }`}
              style={{ width: `${Math.min(utilPct, 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Rate auto-adjusts: higher utilisation → higher rates to attract new supply
          </p>
        </div>

        {/* Reputation tier card */}
        <div className={`hover-lift rounded-xl border p-4 ${tier.color}`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-xs text-muted-foreground">Your Tier</p>
                <Badge className={tier.badge}>{tier.label}</Badge>
                {"shield" in tier && tier.shield && (
                  <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px]">
                    <ShieldCheck className="w-3 h-3 mr-0.5" /> Grace Shield
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Score: <span className="num font-semibold text-foreground">{score}</span></p>
            </div>
            <div className="text-right space-y-1">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Max LTV</p>
                <p className={`num text-2xl font-bold ${tier.text}`}>{tier.ltvPct}%</p>
              </div>
              {tier.discountPct > 0 && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Rate discount</p>
                  <p className={`num text-sm font-bold ${tier.text}`}>−{tier.discountPct}%</p>
                </div>
              )}
            </div>
          </div>
          {"shield" in tier && tier.shield && (
            <p className="text-[10px] text-primary/80 mt-2 bg-primary/10 rounded px-2 py-1.5">
              Platinum Shield: if your position becomes liquidatable, you get a 2-hour warning window to repay before liquidation executes.
            </p>
          )}
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl border border-border/60 overflow-hidden bg-card">
          {(["earn", "borrow", "repay", "position"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs sm:text-sm font-medium transition-all duration-200 capitalize
                ${tab === t
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/4"}`}
            >
              {t === "position" ? "My Loan" : t === "earn" ? "Earn" : t === "borrow" ? "Borrow" : "Repay"}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* EARN TAB                                                           */}
        {/* ══════════════════════════════════════════════════════════════════ */}

        {tab === "earn" && (
          <div className="space-y-4">
            {/* Current position summary */}
            {hasSupply && (
              <Card className="glow-card-green border-0">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold">Your Supply Position</p>
                    <Badge className="bg-primary/12 text-primary border-primary/30">Active</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-3.5 text-sm">
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Supplied</p>
                      <p className="num font-semibold mt-0.5">${supplyAmt.toLocaleString(undefined, { maximumFractionDigits: 2 })} QUSDC</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Claimable Yield</p>
                      <p className="num font-semibold text-primary mt-0.5">${pendingYield.toFixed(4)} QUSDC</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Current APY</p>
                      <p className="num font-semibold text-primary mt-0.5">{bpsToPercent(supplyRateBps as bigint | undefined)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Est. monthly</p>
                      <p className="num font-semibold mt-0.5">
                        ${supplyRateBps
                          ? ((supplyAmt * Number(supplyRateBps) / 100) / 12).toFixed(2)
                          : "-"}
                      </p>
                    </div>
                  </div>
                  {pendingYield > 0 && (
                    <Button
                      size="sm"
                      className="w-full mt-4"
                      onClick={handleClaimYield}
                      disabled={isPending}
                    >
                      {isPending ? "Confirming…" : `Claim $${pendingYield.toFixed(4)} QUSDC`}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Supply form */}
            <Card className="glow-card border-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Supply QUSDC</CardTitle>
                <CardDescription className="text-xs">
                  Earn {bpsToPercent(supplyRateBps as bigint | undefined)} APY from borrower interest.
                  Withdraw anytime (subject to pool utilisation).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  type="number"
                  placeholder="0.00 QUSDC"
                  className="num h-11 text-lg"
                  value={supplyInput}
                  onChange={e => setSupplyInput(e.target.value)}
                />
                <Button
                  className="w-full"
                  onClick={handleSupply}
                  disabled={isPending || !supplyInput}
                >
                  {isPending ? "Confirming…" : "Approve & Supply"}
                </Button>
              </CardContent>
            </Card>

            {/* Withdraw form */}
            {hasSupply && (
              <Card className="glow-card border-0">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Withdraw Supply</CardTitle>
                  <CardDescription className="text-xs">
                    Available to withdraw: <span className="num text-foreground">${supplyAmt.toLocaleString()}</span> QUSDC
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input
                    type="number"
                    placeholder="0.00 QUSDC"
                    className="num h-11 text-lg"
                    value={redeemInput}
                    onChange={e => setRedeemInput(e.target.value)}
                  />
                  <button
                    type="button"
                    className="underline-grow text-xs text-primary transition-colors"
                    onClick={() => setRedeemInput(supplyAmt.toFixed(2))}
                  >
                    Withdraw all: ${supplyAmt.toFixed(2)}
                  </button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleRedeem}
                    disabled={isPending || !redeemInput}
                  >
                    {isPending ? "Confirming…" : "Withdraw"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Rate explanation */}
            <Card className="glow-card border-0">
              <CardContent className="pt-4 pb-4 space-y-2 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground text-sm">How rates work</p>
                <p>Rates are set by a <strong className="text-foreground">Jump Rate Model</strong> - automatically adjusting based on pool utilisation.</p>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="bg-muted/30 border border-border/40 rounded-lg p-2.5 transition-colors hover:border-border">
                    <p className="text-foreground font-medium">0% util</p>
                    <p className="num mt-0.5">Supply 0% · Borrow 2%</p>
                  </div>
                  <div className="bg-muted/30 border border-border/40 rounded-lg p-2.5 transition-colors hover:border-border">
                    <p className="text-foreground font-medium">50% util</p>
                    <p className="num mt-0.5">Supply ~3.8% · Borrow ~9.5%</p>
                  </div>
                  <div className="bg-primary/8 border border-primary/25 rounded-lg p-2.5 transition-colors hover:border-primary/45">
                    <p className="text-primary font-medium">80% util ✓ optimal</p>
                    <p className="num mt-0.5">Supply ~9% · Borrow 14%</p>
                  </div>
                  <div className="bg-gold/8 border border-gold/25 rounded-lg p-2.5 transition-colors hover:border-gold/45">
                    <p className="text-gold font-medium">90% util</p>
                    <p className="num mt-0.5">Supply ~21% · Borrow 29%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* BORROW TAB                                                         */}
        {/* ══════════════════════════════════════════════════════════════════ */}

        {tab === "borrow" && (
          <div className="space-y-4">
            {/* Rate display */}
            <Card className="border-border/40 bg-muted/5">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Market borrow rate</p>
                    <p className="num text-2xl font-bold mt-1">{baseRatePct}% APY</p>
                  </div>
                  {tier.discountPct > 0 && (
                    <div className="text-right">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Your rate ({tier.label})</p>
                      <p className={`num text-2xl font-bold mt-1 ${tier.text}`}>{personalRatePct}% APY</p>
                      <p className={`text-xs ${tier.text}`}>−{tier.discountPct}% discount</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* 1. Borrow amount - primary input */}
            <Card className="glow-card border-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">How much do you want to borrow?</CardTitle>
                <CardDescription className="text-xs">
                  Collateral required will be calculated automatically at your {tier.ltvPct}% LTV ({tier.label} tier).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Input
                  type="number"
                  placeholder="0.00 QUSDC"
                  className="num h-11 text-lg"
                  value={borrowInput}
                  onChange={e => handleBorrowInputChange(e.target.value)}
                />
              </CardContent>
            </Card>

            {/* 2. Collateral - auto-filled, editable */}
            <Card className={`glow-card border-0 ${borrowAmt > 0 ? "ring-primary/30" : ""}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Collateral (WETH)</CardTitle>
                  {collateralIsMin && borrowAmt > 0 && (
                    <span className="text-[10px] font-medium text-gold bg-gold/10 border border-gold/25 px-2 py-0.5 rounded-full">
                      at minimum
                    </span>
                  )}
                  {!collateralIsMin && collateralAmt > minCollateralWeth && borrowAmt > 0 && (
                    <span className="text-[10px] font-medium text-primary bg-primary/10 border border-primary/25 px-2 py-0.5 rounded-full">
                      +{(((collateralAmt / minCollateralWeth) - 1) * 100).toFixed(0)}% buffer
                    </span>
                  )}
                </div>
                <CardDescription className="text-xs">
                  ETH price: <span className="num text-foreground">${ethUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                  <span className="text-muted-foreground/70"> ({priceSource === "coingecko" ? "live · CoinGecko" : priceSource === "oracle" ? "on-chain oracle" : "fallback"})</span>
                  {minCollateralWeth > 0 && (
                    <span className="text-muted-foreground"> · Min required: <span className="num text-primary">{minCollateralWeth.toFixed(6)} WETH</span></span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Input
                  type="number"
                  placeholder="0.000000 WETH"
                  className="num h-11 text-lg"
                  value={collateralInput}
                  onChange={e => setCollateralInput(e.target.value)}
                />
                {borrowAmt > 0 && minCollateralWeth > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      className="underline-grow text-xs text-gold font-medium transition-colors"
                      onClick={() => setCollateralInput(minCollateralWeth.toFixed(6))}
                    >
                      Use minimum ({minCollateralWeth.toFixed(6)} WETH)
                    </button>
                    <span className="text-muted-foreground text-xs">·</span>
                    <button
                      type="button"
                      className="underline-grow text-xs text-primary font-medium transition-colors"
                      onClick={() => setCollateralInput((minCollateralWeth * 1.25).toFixed(6))}
                    >
                      +25% safer ({(minCollateralWeth * 1.25).toFixed(6)} WETH)
                    </button>
                  </div>
                )}
                {collateralUsd > 0 && (
                  <p className="text-xs text-muted-foreground">
                    ≈ <span className="num">${collateralUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span> USD
                    {previewHF > 0 && (
                      <span> · Health factor: <span className={`num font-semibold ${previewHFColor}`}>{previewHF.toFixed(2)}x</span></span>
                    )}
                  </p>
                )}
                {collateralAmt > 0 && borrowAmt > 0 && collateralAmt < minCollateralWeth && (
                  <p className="text-xs text-red-400 bg-destructive/8 border border-destructive/25 rounded-lg px-2.5 py-2">
                    Below minimum. You need at least {minCollateralWeth.toFixed(6)} WETH to borrow ${borrowAmt} QUSDC at {tier.ltvPct}% LTV.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Loan summary - receipt style */}
            {collateralAmt > 0 && borrowAmt > 0 && (
              <div className="rounded-2xl border border-border/60 bg-card glow-card overflow-hidden">
                <div className="px-6 pt-4 pb-3">
                  <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">Loan Summary</p>
                </div>
                <div className="perforation mx-6" />
                <div className="px-6 pt-4 pb-5 space-y-2.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Borrow</span>
                    <span className="num font-semibold">${borrowAmt.toLocaleString()} QUSDC</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Collateral</span>
                    <span className="num">{collateralAmt.toFixed(6)} WETH (≈ ${collateralUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">LTV</span>
                    <span className={`num ${collateralAmt < minCollateralWeth ? "text-red-400 font-semibold" : "text-primary"}`}>
                      {collateralUsd > 0 ? ((borrowAmt / collateralUsd) * 100).toFixed(1) : 0}% / {tier.ltvPct}% max
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Health factor</span>
                    <span className={`num font-semibold ${previewHFColor}`}>
                      {previewHF.toFixed(2)}x
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Your borrow rate</span>
                    <span className={`num ${tier.text}`}>{personalRatePct}% APY{tier.discountPct > 0 ? ` (−${tier.discountPct}%)` : ""}</span>
                  </div>
                  <div className="flex justify-between border-t border-border/50 pt-2.5 mt-1">
                    <span className="text-muted-foreground">Liquidation at LTV</span>
                    <span className="num text-gold">{tier.ltvPct + 8}%</span>
                  </div>
                  {"shield" in tier && tier.shield && (
                    <div className="flex items-center gap-2 bg-primary/10 rounded-lg px-3 py-2 mt-1">
                      <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
                      <span className="text-[11px] text-primary">Platinum Grace Shield active - 2-hour window before liquidation</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <Button
              className="w-full h-11"
              onClick={handleBorrow}
              disabled={isPending || !collateralInput || !borrowInput || collateralAmt < minCollateralWeth}
            >
              {isPending ? "Confirming…"
                : collateralAmt > 0 && collateralAmt < minCollateralWeth ? "Collateral Too Low"
                : "Approve & Borrow"}
            </Button>

            {/* HF education - live preview marker while composing the loan */}
            <HealthFactorGuide currentHF={previewHF > 0 ? previewHF : undefined} />

            {/* Tier comparison */}
            <Card className="glow-card border-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-[10px] text-muted-foreground font-normal uppercase tracking-[0.2em]">Reputation Benefits</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-5 gap-1.5 pb-4">
                {TIERS.map(t => {
                  const isYours = score >= t.min && score <= t.max;
                  return (
                    <div key={t.label} className={`rounded-lg border p-2 text-center transition-all duration-300 ${
                      isYours
                        ? `${t.color} scale-105 shadow-lg`
                        : "border-border/30 opacity-45 hover:opacity-80"
                    }`}>
                      <p className="text-[9px] text-muted-foreground">{t.label}</p>
                      <p className={`num text-sm font-bold mt-0.5 ${isYours ? t.text : ""}`}>{t.ltvPct}%</p>
                      {t.discountPct > 0 && <p className={`num text-[9px] ${isYours ? t.text : "text-muted-foreground"}`}>−{t.discountPct}%</p>}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* REPAY TAB                                                          */}
        {/* ══════════════════════════════════════════════════════════════════ */}

        {tab === "repay" && (
          <div className="space-y-4">
            {!hasBorrow ? (
              <Card className="glow-card border-0">
                <CardContent className="pt-12 pb-12 text-center space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-muted/40 border border-border/50 flex items-center justify-center mx-auto">
                    <Inbox className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground text-sm">No active loan to repay.</p>
                  <Button variant="outline" size="sm" onClick={() => setTab("borrow")}>Open a Loan</Button>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card className="glow-card border-0">
                  <CardContent className="pt-5 space-y-2.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Principal</span>
                      <span className="num">${bPrincipal.toLocaleString()} QUSDC</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Interest owed</span>
                      <span className="num text-gold">${bInterest.toFixed(6)} QUSDC</span>
                    </div>
                    <div className="flex justify-between font-semibold border-t border-border/50 pt-2.5">
                      <span>Total owed</span>
                      <span className="num">${(bPrincipal + bInterest).toFixed(4)} QUSDC</span>
                    </div>
                  </CardContent>
                </Card>
                <Card className="glow-card border-0">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Repay Amount</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Input
                      type="number"
                      placeholder="0.00 QUSDC"
                      className="num h-11 text-lg"
                      value={repayInput}
                      onChange={e => setRepayInput(e.target.value)}
                    />
                    <button
                      type="button"
                      className="underline-grow text-xs text-primary transition-colors"
                      onClick={() => setRepayInput((bPrincipal + bInterest).toFixed(4))}
                    >
                      Repay in full: ${(bPrincipal + bInterest).toFixed(4)}
                    </button>
                  </CardContent>
                </Card>
                <Button className="w-full h-11" onClick={handleRepay} disabled={isPending || !repayInput}>
                  {isPending ? "Confirming…" : "Approve & Repay"}
                </Button>
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* POSITION TAB                                                       */}
        {/* ══════════════════════════════════════════════════════════════════ */}

        {tab === "position" && (
          <div className="space-y-4">
            {!hasBorrow ? (
              <Card className="glow-card border-0">
                <CardContent className="pt-12 pb-12 text-center space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-muted/40 border border-border/50 flex items-center justify-center mx-auto">
                    <Inbox className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground text-sm">No active loan.</p>
                  <Button variant="outline" size="sm" onClick={() => setTab("borrow")}>Open a Loan</Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="glow-card border-0">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Active Loan</CardTitle>
                    {bIsLiquidatable
                      ? <Badge className="bg-red-500/15 text-red-400 border-red-500/30">At Risk</Badge>
                      : bHfBps > 0 && bHfBps < 12000
                        ? <Badge className="bg-gold/15 text-gold border-gold/30">Caution</Badge>
                        : <Badge className="bg-primary/12 text-primary border-primary/30">Healthy</Badge>
                    }
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Collateral</span>
                    <span className="num">{bCollateral.toFixed(6)} WETH</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Borrowed</span>
                    <span className="num">${bPrincipal.toLocaleString()} QUSDC</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Interest accrued</span>
                    <span className="num text-gold">${bInterest.toFixed(6)} QUSDC</span>
                  </div>

                  {/* Health Factor - the main gamified metric */}
                  <div className="border border-border/50 rounded-xl p-3.5 mt-1 bg-muted/15">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-[0.15em]">Health Factor</span>
                      <span className={`num text-2xl font-bold ${hfColor(bHfBps)}`}>
                        {bHfBps === Number.MAX_SAFE_INTEGER ? "∞" : (bHfBps / 10000).toFixed(2)}x
                      </span>
                    </div>
                    <div className="w-full bg-muted/40 rounded-full h-2.5 overflow-hidden">
                      <div
                        className={`h-2.5 rounded-full transition-all duration-700 ${
                          bHfBps < 10000 ? "bg-red-500" :
                          bHfBps < 12000 ? "bg-gold" : "bg-primary"
                        }`}
                        style={{ width: `${Math.min((bHfBps / 20000) * 100, 100)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1.5">
                      {bHfBps >= 15000 ? "Safe - well above liquidation threshold"
                        : bHfBps >= 12000 ? "Moderate - monitor your position"
                        : bHfBps >= 10000 ? "Warning - close to liquidation"
                        : "Danger - liquidation can be triggered"}
                    </p>
                  </div>

                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Current LTV</span>
                    <span className="num">{bCurrentLtv.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Max LTV ({tier.label})</span>
                    <span className="num">{bMaxLtv.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Liquidation threshold</span>
                    <span className="num text-gold">{bLiqThreshold.toFixed(1)}%</span>
                  </div>

                  <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => setTab("repay")}>
                    Repay Loan
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* HF education - live marker on the user's actual position */}
            {hasBorrow && (
              <HealthFactorGuide currentHF={bHfBps > 0 && bHfBps !== Number.MAX_SAFE_INTEGER ? bHfBps / 10000 : undefined} />
            )}
          </div>
        )}

      </div>
    </NetworkGuard>
  );
}
