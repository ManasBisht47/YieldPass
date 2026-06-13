"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { Lock, Check, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { NetworkGuard } from "@/components/layout/NetworkGuard";
import { useCreditScore } from "@/hooks/useCreditScore";
import { SCORE_BANDS } from "@/lib/constants";

const TIER_STYLES = {
  "No boost": {
    icon: "⚪",
    bg: "bg-muted/20",
    border: "border-border/50",
    activeBg: "bg-muted/40",
    activeBorder: "border-foreground/30",
    badge: "bg-secondary border-border text-secondary-foreground",
    shadow: "shadow-black/30",
    labelColor: "text-muted-foreground",
    multiplierColor: "text-foreground",
  },
  "Bronze": {
    icon: "🥉",
    bg: "bg-orange-900/10",
    border: "border-orange-800/25",
    activeBg: "bg-gradient-to-b from-orange-900/30 to-orange-800/10",
    activeBorder: "border-orange-600/60",
    badge: "bg-orange-800/30 border-orange-600/50 text-orange-400",
    shadow: "shadow-orange-900/30",
    labelColor: "text-orange-400",
    multiplierColor: "text-orange-300",
  },
  "Silver": {
    icon: "🥈",
    bg: "bg-slate-400/5",
    border: "border-slate-400/20",
    activeBg: "bg-gradient-to-b from-slate-300/20 to-slate-500/10",
    activeBorder: "border-slate-300/60",
    badge: "bg-slate-400/20 border-slate-300/50 text-slate-200",
    shadow: "shadow-slate-400/20",
    labelColor: "text-slate-300",
    multiplierColor: "text-slate-200",
  },
  "Gold": {
    icon: "🥇",
    bg: "bg-gold/5",
    border: "border-gold/20",
    activeBg: "bg-gradient-to-b from-gold/25 to-gold/8",
    activeBorder: "border-gold/70",
    badge: "bg-gold/20 border-gold/50 text-gold",
    shadow: "shadow-yellow-900/30",
    labelColor: "text-gold",
    multiplierColor: "text-gold",
  },
  "Platinum": {
    icon: "💎",
    bg: "bg-primary/5",
    border: "border-primary/20",
    activeBg: "bg-gradient-to-b from-primary/25 to-primary/8",
    activeBorder: "border-primary/70",
    badge: "bg-primary/20 border-primary/50 text-primary",
    shadow: "shadow-emerald-900/30",
    labelColor: "text-primary",
    multiplierColor: "text-primary",
  },
} as const;

function scoreColor(score: number) {
  if (score >= 800) return "text-primary";
  if (score >= 600) return "text-gold";
  if (score >= 400) return "text-slate-300";
  return "text-muted-foreground";
}

export default function ReputationPage() {
  const { isConnected } = useAccount();
  const { score, band, isKYCVerified, profile, refetch } = useCreditScore();

  useEffect(() => { refetch(); }, [refetch]);

  if (!isConnected) {
    return (
      <div className="text-center py-28 space-y-5 animate-in fade-in duration-500">
        <div className="w-14 h-14 rounded-2xl bg-gold/10 border border-gold/25 flex items-center justify-center mx-auto">
          <ShieldCheck className="w-6 h-6 text-gold" />
        </div>
        <div>
          <p className="font-heading text-3xl">First, connect your wallet</p>
          <p className="text-base text-muted-foreground mt-2">Your on-chain credit score lives here.</p>
        </div>
      </div>
    );
  }

  const steps = [
    {
      href:   "/reputation/kyc",
      label:  "QIEPass KYC",
      done:   isKYCVerified,
      locked: false,
      desc:   "Connect your QIE Identity (DID)",
      pts:    "+200 pts",
    },
    {
      href:   "/reputation/web2",
      label:  "Credit Bureau / Telecom",
      done:   score > 200,
      locked: !isKYCVerified,
      desc:   "ZK proof of credit score or telecom",
      pts:    "+up to 300 pts",
    },
    {
      href:   "/reputation/wallets",
      label:  "DEX Wallets",
      done:   (profile?.childWalletCount ?? 0) > 0,
      locked: !isKYCVerified,
      desc:   "Link your trading wallets",
      pts:    "+up to 250 pts",
    },
  ];

  const completedSteps = steps.filter(s => s.done).length;

  return (
    <NetworkGuard>
      <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">

        {/* Header */}
        <div>
          <p className="eyebrow">The multiplier</p>
          <h1 className="font-heading text-4xl sm:text-5xl tracking-tight mt-3">Reputation</h1>
          <p className="text-base text-muted-foreground mt-2">Three verifications. One score. Every rate on this protocol bends to it.</p>
        </div>

        {/* Score card */}
        <Card className="glow-card border-0 overflow-hidden">
          {/* Gradient accent bar */}
          <div className="h-1 qie-gradient -mt-4" />
          <CardContent className="pt-5 pb-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className={`num text-6xl font-bold tracking-tight ${scoreColor(score)}`}>
                  {score}
                </p>
                <p className="text-sm text-muted-foreground mt-1">Credit Score / 1000</p>
              </div>
              <div className="text-right space-y-2">
                <Badge className="text-sm px-3 py-1 bg-secondary text-secondary-foreground border-border/60">
                  {band.label}
                </Badge>
                <p className="text-xs text-muted-foreground">{completedSteps}/3 steps done</p>
              </div>
            </div>
            <div className="space-y-2">
              <Progress value={(score / 1000) * 100} className="h-2" />
              <div className="grid grid-cols-5 gap-1">
                {SCORE_BANDS.map(b => (
                  <div
                    key={b.label}
                    className={`py-1 px-0.5 rounded text-xs text-center font-medium transition-colors duration-300 ${
                      score >= b.min && score <= b.max
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "bg-muted/50 text-muted-foreground"
                    }`}
                  >
                    {b.label}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Steps */}
        <div className="space-y-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.2em]">
            Verification Steps — {completedSteps}/3 complete
          </p>
          {steps.map((step, i) => (
            <Card
              key={step.href}
              className={`border-0 transition-all duration-250 ${
                step.done
                  ? "glow-card-green"
                  : step.locked
                  ? "glow-card opacity-50 cursor-not-allowed"
                  : "glow-card hover-lift"
              }`}
            >
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${
                      step.done
                        ? "bg-primary/15 text-primary border border-primary/30"
                        : step.locked
                        ? "bg-secondary/50 text-muted-foreground/50 border border-border/40"
                        : "bg-secondary text-secondary-foreground border border-border/60"
                    }`}>
                      {step.done ? <Check className="w-4 h-4" /> : step.locked ? (
                        <Lock className="w-4 h-4" />
                      ) : i + 1}
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${step.locked ? "text-muted-foreground" : ""}`}>{step.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {step.locked ? "Complete Step 1 (QIEPass KYC) to unlock" : step.desc}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      variant="outline"
                      className={`text-xs hidden sm:flex ${step.done ? "border-primary/30 text-primary" : "border-border/60 text-muted-foreground"}`}
                    >
                      {step.pts}
                    </Badge>
                    {step.locked ? (
                      <Button size="sm" variant="outline" disabled className="border-border/40 text-muted-foreground/50 cursor-not-allowed">
                        Locked
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant={step.done ? "outline" : "default"}
                        className={step.done ? "border-border/60" : ""}
                        render={(props) => <Link {...props} href={step.href} />}
                      >
                        {step.done ? "Review" : "Start"}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* APY multiplier table */}
        <Card className="glow-card border-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Score → APY Multiplier</CardTitle>
            <CardDescription className="text-xs">Boosted APY applies on up to $10,000 staked</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-5 gap-2 pb-5">
            {SCORE_BANDS.map(b => {
              const isActive = score >= b.min && score <= b.max;
              const tier = TIER_STYLES[b.label as keyof typeof TIER_STYLES];
              return (
                <div
                  key={b.label}
                  className={`relative flex flex-col items-center justify-between rounded-xl border p-3 text-center transition-all duration-250
                    ${isActive
                      ? `${tier.activeBg} ${tier.activeBorder} shadow-lg ${tier.shadow} scale-105`
                      : `${tier.bg} ${tier.border} opacity-55 hover:opacity-90 hover:-translate-y-0.5`
                    }`}
                >
                  {isActive && (
                    <div className={`absolute -top-2 left-1/2 -translate-x-1/2 text-[10px] font-bold px-2 py-0.5 rounded-full border ${tier.badge}`}>
                      YOU
                    </div>
                  )}
                  <div className="text-2xl mb-1">{tier.icon}</div>
                  <p className={`text-xs font-bold tracking-wide ${tier.labelColor}`}>{b.label}</p>
                  <p className="num text-[10px] text-muted-foreground mt-0.5">{b.min}–{b.max}</p>
                  <div className={`num mt-2 text-lg font-bold ${tier.multiplierColor}`}>
                    {(b.multiplierBps / 10_000).toFixed(2)}×
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

      </div>
    </NetworkGuard>
  );
}
