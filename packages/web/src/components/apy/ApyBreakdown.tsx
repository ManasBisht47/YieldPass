"use client";

import { TrendingUp, Lock, Award, ArrowRight, Info } from "lucide-react";
import { SCORE_BANDS, LOCK_TIERS } from "@/lib/constants";
import type { LockTier } from "@/types/vault";

interface ApyBreakdownProps {
  baseApyBps: number;          // pool-wide base APY in bps
  score:      number;          // user credit score 0–1000
  lockTier?:  LockTier;        // selected/active lock tier
  compact?:   boolean;         // smaller variant for sidebars
}

/**
 * Mirrors YieldVault.getEffectiveAPY: both the score band and the lock tier are
 * multipliers on your pool share, so they chain rather than add —
 *
 *   Base APY  ×  score multiplier  ×  lock multiplier  =  Your APY
 */
export function ApyBreakdown({ baseApyBps, score, lockTier = 0, compact = false }: ApyBreakdownProps) {
  const band      = SCORE_BANDS.find(b => score >= b.min && score <= b.max) ?? SCORE_BANDS[0];
  const lockInfo  = Object.values(LOCK_TIERS)[lockTier] ?? LOCK_TIERS.FLEXIBLE;
  const basePct   = baseApyBps / 100;
  const multiplier = band.multiplierBps / 10_000;
  const lockMult   = (10_000 + lockInfo.bonusBps) / 10_000;
  const boostedBps = Math.round((baseApyBps * band.multiplierBps * (10_000 + lockInfo.bonusBps)) / 1e8);
  const boostedPct = boostedBps / 100;

  if (compact) {
    return (
      <div className="flex items-baseline gap-3 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Base APY</p>
          <p className="text-lg font-bold text-muted-foreground">{basePct.toFixed(2)}%</p>
        </div>
        <ArrowRight className="w-4 h-4 text-muted-foreground/50 self-center" />
        <div>
          <p className="text-[10px] uppercase tracking-widest text-primary/80">Your APY</p>
          <p className="num text-lg font-black text-primary">{boostedPct.toFixed(2)}%</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl glow-card bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold tracking-tight">How your APY is calculated</p>
      </div>

      {/* The equation, as stat blocks */}
      <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1.2fr] items-center gap-1 sm:gap-2 text-center">
        <div className="rounded-lg bg-muted/40 border border-border/50 py-3 px-1 transition-colors hover:border-border">
          <p className="num text-base sm:text-xl font-bold">{basePct.toFixed(2)}%</p>
          <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Base APY</p>
        </div>
        <span className="text-muted-foreground/60 font-heading text-lg">×</span>
        <div className={`rounded-lg border py-3 px-1 transition-colors ${multiplier > 1 ? "bg-gold/8 border-gold/30 hover:border-gold/50" : "bg-muted/40 border-border/50 hover:border-border"}`}>
          <p className={`num text-base sm:text-xl font-bold ${multiplier > 1 ? "text-gold" : ""}`}>{multiplier.toFixed(2)}×</p>
          <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-widest mt-1">{band.label}</p>
        </div>
        <span className="text-muted-foreground/60 font-heading text-lg">×</span>
        <div className={`rounded-lg border py-3 px-1 transition-colors ${lockInfo.bonusBps > 0 ? "bg-gold/8 border-gold/30 hover:border-gold/50" : "bg-muted/40 border-border/50 hover:border-border"}`}>
          <p className={`num text-base sm:text-xl font-bold ${lockInfo.bonusBps > 0 ? "text-gold" : ""}`}>{lockMult.toFixed(2)}×</p>
          <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Lock</p>
        </div>
        <span className="text-muted-foreground/60 font-heading text-lg">=</span>
        <div className="rounded-lg bg-primary/10 border border-primary/35 py-3 px-1 transition-shadow hover:shadow-[0_0_24px_-8px_var(--primary)]">
          <p className="num text-base sm:text-xl font-black text-primary">{boostedPct.toFixed(2)}%</p>
          <p className="text-[9px] sm:text-[10px] text-primary/70 uppercase tracking-widest mt-1">Your APY</p>
        </div>
      </div>

      {/* Explanations */}
      <div className="space-y-2 pt-1">
        <div className="flex items-start gap-2.5 text-xs text-muted-foreground">
          <Award className="w-3.5 h-3.5 mt-0.5 text-gold shrink-0" />
          <span>
            Score <span className="num text-foreground">{score}</span> puts you in the{" "}
            <span className="text-gold font-medium">{band.label}</span> band ({band.min}–{band.max} pts → {multiplier.toFixed(2)}× multiplier).
            {score < 1000 && (() => {
              const next = SCORE_BANDS.find(b => b.min > score);
              return next
                ? <> Reach <span className="num text-foreground">{next.min}</span> pts for <span className="text-gold font-medium">{(next.multiplierBps / 10_000).toFixed(1)}×</span>.</>
                : null;
            })()}
          </span>
        </div>
        <div className="flex items-start gap-2.5 text-xs text-muted-foreground">
          <Lock className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" />
          <span>
            {lockInfo.bonusBps > 0
              ? <><span className="text-primary font-medium">{lockInfo.label}</span> lock weights your pool share {lockMult.toFixed(2)}× — that&apos;s {(lockInfo.bonusBps / 100).toFixed(0)}% more rewards than an unlocked stake of the same size.</>
              : <>No lock — a 30/90/180-day lock weights your share up to 1.15×.</>}
          </span>
        </div>
        <div className="flex items-start gap-2.5 text-xs text-muted-foreground">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>Boosted rate applies to your first 50,000 QIE staked; anything above earns base APY.</span>
        </div>
      </div>
    </div>
  );
}
