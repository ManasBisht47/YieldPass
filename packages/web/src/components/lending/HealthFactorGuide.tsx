"use client";

import { ShieldCheck, Eye, AlertTriangle, Skull } from "lucide-react";

// HF = liquidation threshold / current LTV — how far you are from getting
// liquidated. Four bands on the same cutoffs Aave-style UIs use: >=1.5 safe,
// 1.2-1.5 keep an eye on it, 1.0-1.2 danger, <1.0 already gone.
const ZONES = [
  { min: 1.5, label: "Safe",      range: "≥ 1.50",      icon: ShieldCheck,   color: "text-primary",  bg: "bg-primary/10 border-primary/25",
    desc: "Comfortable buffer. A normal market dip won't touch you." },
  { min: 1.2, label: "Monitor",   range: "1.20 – 1.50", icon: Eye,           color: "text-gold",     bg: "bg-gold/10 border-gold/25",
    desc: "Still fine — but keep an eye on the ETH price. Consider adding collateral." },
  { min: 1.0, label: "High risk", range: "1.00 – 1.20", icon: AlertTriangle, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/25",
    desc: "One sharp dip from liquidation. Repay part of the loan or top up collateral now." },
  { min: 0,   label: "Liquidated", range: "< 1.00",     icon: Skull,         color: "text-red-400",  bg: "bg-red-500/10 border-red-500/25",
    desc: "Anyone can repay your debt and take your collateral plus a 5% bonus. Avoid at all costs." },
];

// where an HF lands on the 0–2.5 gauge, clamped to 1–99% so the marker stays on-bar
function gaugePos(hf: number) {
  return Math.min(Math.max((hf / 2.5) * 100, 1), 99);
}

export function HealthFactorGuide({ currentHF }: { currentHF?: number }) {
  const activeZone = currentHF !== undefined
    ? ZONES.find(z => currentHF >= z.min) ?? ZONES[ZONES.length - 1]
    : null;

  return (
    <div className="rounded-2xl border border-border/60 bg-card glow-card overflow-hidden">
      <div className="px-6 pt-5 pb-4">
        <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">Know your Health Factor</p>
        <p className="text-sm text-muted-foreground mt-2.5 leading-relaxed">
          <span className="num text-foreground">HF = liquidation threshold ÷ your current LTV</span>.
          It&apos;s your distance from liquidation — the single number every professional
          borrower watches.
        </p>
      </div>

      {/* The gauge — colored zones with optional live marker */}
      <div className="px-6 pb-2">
        <div className="relative h-3 rounded-full overflow-hidden flex">
          <div className="bg-red-500/70 h-full" style={{ width: `${gaugePos(1.0)}%` }} />
          <div className="bg-orange-500/70 h-full" style={{ width: `${gaugePos(1.2) - gaugePos(1.0)}%` }} />
          <div className="bg-gold/70 h-full" style={{ width: `${gaugePos(1.5) - gaugePos(1.2)}%` }} />
          <div className="bg-primary/70 h-full flex-1" />
          {currentHF !== undefined && currentHF > 0 && (
            <div
              className="absolute -top-0.5 h-4 w-1 rounded-full bg-foreground shadow-[0_0_8px_rgba(255,255,255,0.7)] transition-all duration-700"
              style={{ left: `${gaugePos(currentHF)}%` }}
              title={`Your HF: ${currentHF.toFixed(2)}x`}
            />
          )}
        </div>
        <div className="relative flex text-[10px] num text-muted-foreground mt-1.5 mb-1">
          <span style={{ width: `${gaugePos(1.0)}%` }}>0</span>
          <span style={{ width: `${gaugePos(1.2) - gaugePos(1.0)}%` }}>1.0</span>
          <span style={{ width: `${gaugePos(1.5) - gaugePos(1.2)}%` }}>1.2</span>
          <span>1.5+</span>
        </div>
        {currentHF !== undefined && currentHF > 0 && activeZone && (
          <p className="text-xs mt-1 mb-1">
            Your position: <span className={`num font-bold ${activeZone.color}`}>{currentHF.toFixed(2)}x — {activeZone.label}</span>
          </p>
        )}
      </div>

      {/* Zone cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 px-6 pb-6 pt-2">
        {ZONES.map(zone => {
          const Icon = zone.icon;
          const isYou = activeZone?.label === zone.label;
          return (
            <div
              key={zone.label}
              className={`rounded-xl border p-3.5 transition-all duration-250 ${zone.bg} ${
                isYou ? "ring-1 ring-foreground/30 scale-[1.02]" : currentHF !== undefined ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className={`flex items-center gap-1.5 text-sm font-semibold ${zone.color}`}>
                  <Icon className="w-4 h-4" /> {zone.label}
                  {isYou && <span className="text-[9px] font-mono uppercase tracking-wider bg-foreground/10 px-1.5 py-0.5 rounded-full">you</span>}
                </span>
                <span className={`num text-xs font-bold ${zone.color}`}>{zone.range}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{zone.desc}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
