"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Calculator, Coins, Landmark, TrendingUp, Lock, Award, ArrowRight,
  TriangleAlert, Repeat, Clock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CountUp } from "@/components/ui/count-up";
import { SCORE_BANDS, LOCK_TIERS } from "@/lib/constants";

type Mode = "stake" | "lend";
type Compound = "none" | "yearly" | "monthly" | "daily";

const COMPOUND_PERIODS: Record<Compound, number> = {
  none: 0, yearly: 1, monthly: 12, daily: 365,
};

const COMPOUND_LABEL: Record<Compound, string> = {
  none: "Simple", yearly: "Yearly", monthly: "Monthly", daily: "Daily",
};

// Lock tiers as an ordered array for the stake mode picker
const LOCK_LIST = Object.entries(LOCK_TIERS).map(([key, v]) => ({ key, ...v }));

function projectValue(
  principal: number, apyPct: number, years: number, compound: Compound,
): number {
  const r = apyPct / 100;
  if (compound === "none") return principal * (1 + r * years);
  const n = COMPOUND_PERIODS[compound];
  return principal * Math.pow(1 + r / n, n * years);
}

export default function CalculatorPage() {
  const [mode, setMode]           = useState<Mode>("stake");
  const [amount, setAmount]       = useState("1000");
  const [months, setMonths]       = useState(12);
  const [compound, setCompound]   = useState<Compound>("monthly");

  // Stake-mode inputs
  const [baseApy, setBaseApy]     = useState("7.5");
  const [scoreIdx, setScoreIdx]   = useState(0);  // SCORE_BANDS index
  const [lockIdx, setLockIdx]     = useState(0);   // LOCK_LIST index

  // Lend-mode input (utilisation-driven, entered directly)
  const [supplyApy, setSupplyApy] = useState("9.0");

  const principal = parseFloat(amount) || 0;
  const years     = months / 12;
  const unit      = mode === "stake" ? "QIE" : "QUSDC";

  // Effective APY
  const effectiveApy = useMemo(() => {
    if (mode === "lend") return parseFloat(supplyApy) || 0;
    const base = parseFloat(baseApy) || 0;
    const band = SCORE_BANDS[scoreIdx];
    const lock = LOCK_LIST[lockIdx];
    // score band and lock both scale your pool share, so they multiply
    return (base * band.multiplierBps * (10_000 + lock.bonusBps)) / 1e8;
  }, [mode, supplyApy, baseApy, scoreIdx, lockIdx]);

  const finalValue = projectValue(principal, effectiveApy, years, compound);
  const profit     = finalValue - principal;
  const roiPct     = principal > 0 ? (profit / principal) * 100 : 0;

  // Growth series for the chart — one point per month
  const series = useMemo(() => {
    const pts: { m: number; v: number }[] = [];
    for (let m = 0; m <= months; m++) {
      pts.push({ m, v: projectValue(principal, effectiveApy, m / 12, compound) });
    }
    return pts;
  }, [principal, effectiveApy, months, compound]);

  const maxV = series.length ? series[series.length - 1].v : principal;
  const minV = principal;

  // Build SVG area path (0..100 viewBox)
  const W = 100, H = 100;
  const areaPath = useMemo(() => {
    if (series.length < 2 || maxV === minV) return "";
    const x = (i: number) => (i / (series.length - 1)) * W;
    const y = (v: number) => H - ((v - minV) / (maxV - minV)) * H;
    let d = `M ${x(0)} ${y(series[0].v)}`;
    series.forEach((p, i) => { d += ` L ${x(i)} ${y(p.v)}`; });
    d += ` L ${W} ${H} L 0 ${H} Z`;
    return d;
  }, [series, maxV, minV]);

  const linePath = useMemo(() => {
    if (series.length < 2 || maxV === minV) return "";
    const x = (i: number) => (i / (series.length - 1)) * W;
    const y = (v: number) => H - ((v - minV) / (maxV - minV)) * H;
    return series.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.v)}`).join(" ");
  }, [series, maxV, minV]);

  const fmt = (n: number, d = 2) =>
    n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">

      {/* Header */}
      <div>
        <p className="eyebrow">Plan ahead</p>
        <h1 className="font-heading text-4xl sm:text-5xl tracking-tight mt-3 flex items-center gap-3">
          <Calculator className="w-8 h-8 text-primary" />
          Yield Calculator
        </h1>
        <p className="text-base text-muted-foreground mt-2">
          Run the numbers before you commit. Adjust amount, rate, time and compounding — see exactly where you land.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex rounded-xl border border-border/60 overflow-hidden bg-card max-w-md">
        {([
          { m: "stake" as Mode, icon: Coins,    label: "Stake QIE" },
          { m: "lend"  as Mode, icon: Landmark, label: "Supply QUSDC" },
        ]).map(({ m, icon: Icon, label }) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 py-3 text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2
              ${mode === m ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-white/4"}`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-6">

        {/* ─────────────── INPUTS ─────────────── */}
        <div className="space-y-4">

          {/* Amount + duration */}
          <Card className="glow-card border-0">
            <CardContent className="pt-6 space-y-5">
              <div className="space-y-2">
                <Label>Amount ({unit})</Label>
                <Input
                  type="number"
                  className="num h-11 text-lg"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Duration</Label>
                  <span className="num text-sm font-semibold text-primary">
                    {months} {months === 1 ? "month" : "months"}
                    {months >= 12 && ` · ${(months / 12).toFixed(months % 12 === 0 ? 0 : 1)}y`}
                  </span>
                </div>
                <input
                  type="range"
                  min={1} max={60} step={1}
                  value={months}
                  onChange={e => setMonths(Number(e.target.value))}
                  className="w-full accent-[var(--primary)] cursor-pointer"
                />
                <div className="flex gap-1.5">
                  {[3, 6, 12, 24, 36].map(m => (
                    <button
                      key={m}
                      onClick={() => setMonths(m)}
                      className={`flex-1 text-[11px] py-1 rounded-md border transition-colors ${
                        months === m ? "border-primary/50 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:border-border"
                      }`}
                    >
                      {m >= 12 ? `${m / 12}y` : `${m}m`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Compounding */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5"><Repeat className="w-3.5 h-3.5" /> Compounding</Label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(["none", "yearly", "monthly", "daily"] as Compound[]).map(c => (
                    <button
                      key={c}
                      onClick={() => setCompound(c)}
                      className={`text-[11px] py-1.5 rounded-md border transition-colors ${
                        compound === c ? "border-primary/50 bg-primary/10 text-primary font-medium" : "border-border/50 text-muted-foreground hover:border-border"
                      }`}
                    >
                      {COMPOUND_LABEL[c]}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {compound === "none"
                    ? "Simple interest — yield paid on principal only."
                    : `Yield re-staked ${COMPOUND_LABEL[compound].toLowerCase()} — interest earns interest.`}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Rate config */}
          {mode === "stake" ? (
            <Card className="glow-card border-0">
              <CardContent className="pt-6 space-y-5">
                <div className="space-y-2">
                  <Label>Base APY (%)</Label>
                  <Input
                    type="number"
                    className="num h-10"
                    value={baseApy}
                    onChange={e => setBaseApy(e.target.value)}
                    placeholder="7.5"
                  />
                  <p className="text-[11px] text-muted-foreground">Protocol base rate — currently ~7.5%, varies with DEX volume.</p>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><Award className="w-3.5 h-3.5 text-gold" /> Reputation tier</Label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {SCORE_BANDS.map((b, i) => (
                      <button
                        key={b.label}
                        onClick={() => setScoreIdx(i)}
                        className={`text-[10px] py-1.5 rounded-md border transition-all ${
                          scoreIdx === i ? "border-gold/50 bg-gold/10 text-gold font-medium scale-105" : "border-border/50 text-muted-foreground hover:border-border"
                        }`}
                      >
                        {(b.multiplierBps / 10_000).toFixed(2)}×
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{SCORE_BANDS[scoreIdx].label} ({SCORE_BANDS[scoreIdx].min}–{SCORE_BANDS[scoreIdx].max} pts)</p>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5 text-primary" /> Lock tier</Label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {LOCK_LIST.map((l, i) => (
                      <button
                        key={l.key}
                        onClick={() => setLockIdx(i)}
                        className={`text-[10px] py-1.5 rounded-md border transition-all ${
                          lockIdx === i ? "border-primary/50 bg-primary/10 text-primary font-medium scale-105" : "border-border/50 text-muted-foreground hover:border-border"
                        }`}
                      >
                        {((10_000 + l.bonusBps) / 10_000).toFixed(2)}×
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{LOCK_LIST[lockIdx].label}</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="glow-card border-0">
              <CardContent className="pt-6 space-y-3">
                <Label>Supply APY (%)</Label>
                <Input
                  type="number"
                  className="num h-10"
                  value={supplyApy}
                  onChange={e => setSupplyApy(e.target.value)}
                  placeholder="9.0"
                />
                <p className="text-[11px] text-muted-foreground">
                  Lending APY moves with pool utilisation: ~0% idle, ~9% at the 80% sweet spot, 20%+ when nearly full.
                  Enter the rate you expect.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ─────────────── RESULT ─────────────── */}
        <div className="space-y-4">

          {/* Headline result */}
          <Card className="glow-card-green border-0 overflow-hidden">
            <CardContent className="pt-6 pb-6">
              <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.25em] text-primary/80 mb-3">
                <TrendingUp className="w-3.5 h-3.5" /> Projected · {COMPOUND_LABEL[compound]} compounding
              </div>

              <p className="text-xs text-muted-foreground">After {months} {months === 1 ? "month" : "months"} you&apos;d have</p>
              <p className="num text-4xl sm:text-5xl font-bold tracking-tight mt-1">
                <CountUp value={finalValue} decimals={2} /> <span className="text-xl text-muted-foreground font-normal">{unit}</span>
              </p>

              <div className="grid grid-cols-3 gap-3 mt-5">
                <div className="rounded-lg bg-muted/30 border border-border/40 p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Deposited</p>
                  <p className="num text-base font-semibold mt-0.5">{fmt(principal)}</p>
                </div>
                <div className="rounded-lg bg-primary/8 border border-primary/25 p-3">
                  <p className="text-[10px] text-primary/70 uppercase tracking-wider">Earned</p>
                  <p className="num text-base font-bold text-primary mt-0.5">+{fmt(profit)}</p>
                </div>
                <div className="rounded-lg bg-gold/8 border border-gold/25 p-3">
                  <p className="text-[10px] text-gold/80 uppercase tracking-wider">ROI</p>
                  <p className="num text-base font-bold text-gold mt-0.5">+{fmt(roiPct, 1)}%</p>
                </div>
              </div>

              <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/40 text-sm">
                <span className="text-muted-foreground">Effective APY</span>
                <span className="num font-bold text-primary text-lg">{fmt(effectiveApy)}%</span>
              </div>
            </CardContent>
          </Card>

          {/* Growth chart */}
          <Card className="glow-card border-0">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold">Growth over time</p>
                <span className="text-[11px] text-muted-foreground num">{unit}</span>
              </div>
              <div className="relative h-44">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                  <defs>
                    <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {/* baseline (principal) */}
                  <line x1="0" y1="100" x2="100" y2="100" stroke="var(--border)" strokeWidth="0.4" />
                  {areaPath && <path d={areaPath} fill="url(#grad)" />}
                  {linePath && <path d={linePath} fill="none" stroke="var(--primary)" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />}
                </svg>
                {/* End-value marker */}
                <div className="absolute top-0 right-0 text-right">
                  <span className="num text-xs font-bold text-primary">{fmt(maxV)}</span>
                </div>
                <div className="absolute bottom-0 left-0 text-left">
                  <span className="num text-[10px] text-muted-foreground">{fmt(minV)}</span>
                </div>
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5">
                <span>now</span>
                <span>{months >= 12 ? `${(months/12).toFixed(months % 12 === 0 ? 0 : 1)} year${months >= 24 ? "s" : ""}` : `${months} months`}</span>
              </div>
            </CardContent>
          </Card>

          {/* Volatility warning */}
          <div className="flex items-start gap-3 rounded-xl border border-gold/30 bg-gold/6 p-4">
            <TriangleAlert className="w-5 h-5 text-gold shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground leading-relaxed">
              <p className="text-sm font-semibold text-gold mb-1">This is an estimate, not a promise.</p>
              Crypto is volatile — rates move, prices swing, and yield rarely accrues at a perfectly straight line.
              Base APY changes with real DEX volume and pool utilisation; the QIE price itself can rise or fall.
              Treat these figures as a guide to the <em>shape</em> of your returns, not a guaranteed outcome.
              Never deposit more than you can afford to lock up.
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-border/60 bg-card glow-card px-6 sm:px-8 py-6">
        <p className="text-sm text-muted-foreground text-center sm:text-left">
          Numbers look good? Put them to work — {mode === "stake" ? "stake native QIE in one transaction." : "supply QUSDC and start earning."}
        </p>
        <Link
          href={mode === "stake" ? "/stake" : "/lending"}
          className="group shrink-0 inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-semibold px-6 py-3 rounded-xl shadow-lg shadow-emerald-950/40 hover:shadow-[0_0_28px_-6px_var(--primary)] hover:-translate-y-0.5 transition-all duration-250"
        >
          {mode === "stake" ? "Go to Stake" : "Go to Lending"}
          <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>
    </div>
  );
}
