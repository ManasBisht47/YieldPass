"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronDown, Coins, Landmark, ShieldCheck, TrendingUp,
  IdCard, Scale, CircleHelp,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ── FAQ data ──────────────────────────────────────────────────────────────────

interface FaqItem {
  q: string;
  a: React.ReactNode;
}

interface FaqSection {
  id:    string;
  title: string;
  icon:  React.ReactNode;
  items: FaqItem[];
}

const SECTIONS: FaqSection[] = [
  {
    id: "basics",
    title: "Getting Started",
    icon: <CircleHelp className="w-4 h-4" />,
    items: [
      {
        q: "What is YieldPass?",
        a: (
          <>
            YieldPass is a reputation-based DeFi protocol on the QIE blockchain. It has two
            earning products - <strong>Staking</strong> and <strong>Lending</strong> - and one
            superpower: your real-world reputation (KYC, credit history, on-chain track record)
            becomes an on-chain <strong>credit score (0-1000)</strong> that unlocks higher yield
            and better borrowing terms. Your personal data never goes on-chain - only
            zero-knowledge proofs of it.
          </>
        ),
      },
      {
        q: "What do I need to start?",
        a: (
          <>
            A wallet (MetaMask) connected to QIE Testnet. Staking uses native QIE (the gas coin
            you already hold); lending uses QUSDC. Both work with score 0 - building reputation
            is optional but multiplies your earnings up to <strong>1.5×</strong>.
          </>
        ),
      },
      {
        q: "What is QUSDC?",
        a: (
          <>
            QUSDC is the USD-pegged stablecoin of the QIE ecosystem - it powers the
            <strong> lending</strong> side: supply it, borrow it, repay in it, all dollar-stable.
            <strong> Staking</strong> uses native QIE instead, because that&apos;s the asset the
            QIE ecosystem actually pays yield in.
          </>
        ),
      },
    ],
  },
  {
    id: "stake-vs-lend",
    title: "Staking vs Lending - what's the difference?",
    icon: <Scale className="w-4 h-4" />,
    items: [
      {
        q: "Both pay APY on QUSDC. How are they different?",
        a: (
          <div className="space-y-3">
            <p>
              Two different yield engines with two different assets - <strong>QIE</strong> for
              staking (the ecosystem&apos;s earning coin), <strong>QUSDC</strong> for lending
              (the stable unit of account):
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border border-border/50 rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-muted/30">
                    <th className="text-left p-2.5 font-medium"></th>
                    <th className="text-left p-2.5 font-medium text-primary">
                      <span className="flex items-center gap-1.5"><Coins className="w-3.5 h-3.5" /> Staking</span>
                    </th>
                    <th className="text-left p-2.5 font-medium text-gold">
                      <span className="flex items-center gap-1.5"><Landmark className="w-3.5 h-3.5" /> Lending (Earn)</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-t border-border/40">
                    <td className="p-2.5 font-medium text-foreground">Yield source</td>
                    <td className="p-2.5">QIEDex trading fees (you become a liquidity provider)</td>
                    <td className="p-2.5">Interest paid by borrowers (you become the bank)</td>
                  </tr>
                  <tr className="border-t border-border/40">
                    <td className="p-2.5 font-medium text-foreground">APY driver</td>
                    <td className="p-2.5">DEX trading volume - more swaps = more fees</td>
                    <td className="p-2.5">Pool utilisation - more borrowing = higher rate</td>
                  </tr>
                  <tr className="border-t border-border/40">
                    <td className="p-2.5 font-medium text-foreground">Lock-up</td>
                    <td className="p-2.5">Optional 30/90/180-day locks for a 1.05×-1.15× rewards boost</td>
                    <td className="p-2.5">None - withdraw anytime (if liquidity available)</td>
                  </tr>
                  <tr className="border-t border-border/40">
                    <td className="p-2.5 font-medium text-foreground">Score benefit</td>
                    <td className="p-2.5">Multiplies your APY up to 1.5×</td>
                    <td className="p-2.5">Higher borrow LTV (60→75%) + rate discount (up to −12%)</td>
                  </tr>
                  <tr className="border-t border-border/40">
                    <td className="p-2.5 font-medium text-foreground">Main risk</td>
                    <td className="p-2.5">DEX volume drops → lower APY</td>
                    <td className="p-2.5">100% utilisation → withdrawal queue (rates spike to fix it)</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              <strong>Simple rule:</strong> Staking = predictable, score-boosted, optionally locked.
              Lending = flexible, utilisation-driven, also lets you borrow.
              Many users do both.
            </p>
          </div>
        ),
      },
      {
        q: "Can I use both at the same time?",
        a: (
          <>
            Yes - they are independent positions. Your dashboard shows the combined portfolio:
            staked amount, supplied amount, any debt, and total claimable yield across both.
          </>
        ),
      },
    ],
  },
  {
    id: "staking",
    title: "Staking",
    icon: <Coins className="w-4 h-4" />,
    items: [
      {
        q: "Where does staking yield actually come from?",
        a: (
          <>
            You stake native QIE; the vault wraps it to WQIE and the YieldStrategy provides
            liquidity on QIEDex (the QIE chain&apos;s DEX). Every swap pays a fee to liquidity
            providers. A keeper harvests those fees daily and splits them: <strong>85% to
            stakers</strong>, 10% to the protocol treasury, 5% to the Insurance Fund. Your yield
            is paid in QIE - no token printing, every coin of yield is a fee someone actually paid.
          </>
        ),
      },
      {
        q: "How is MY exact APY calculated?",
        a: (
          <div className="space-y-2">
            <p>Three components, shown live on your dashboard:</p>
            <div className="bg-muted/20 border border-border/40 rounded-lg p-3 font-mono text-xs">
              Your APY = Base APY × Score Multiplier × Lock Multiplier
            </div>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Base APY</strong> - pool-wide, recalculated after every harvest from real fees.</li>
              <li><strong>Score multiplier</strong> - 1.0× (score 0-200) up to 1.5× (score 801-1000).</li>
              <li><strong>Lock multiplier</strong> - 1.05× (30d), 1.10× (90d) or 1.15× (180d). Both multipliers scale your share of the pool, so they stack.</li>
            </ul>
            <p className="text-xs">
              Boosted rate applies to your first 50,000 QIE staked; above that earns base APY
              (anti-whale protection so big wallets can&apos;t drain the boost pool).
            </p>
          </div>
        ),
      },
      {
        q: "What happens if I unstake before my lock expires?",
        a: (
          <>
            You pay an early-exit fee on the withdrawn amount: 1% (Silver 30d), 2% (Gold 90d) or
            3% (Diamond 180d). The fee goes to the yield pool - it&apos;s redistributed to the
            stakers who kept their lock. Flexible stakes have no fee, ever.
          </>
        ),
      },
      {
        q: "When can I claim my yield?",
        a: (
          <>
            Anytime. Yield accrues continuously against the harvested pool and shows as
            &quot;Claimable&quot; on your dashboard. Claiming sends QUSDC straight to your wallet
            and doesn&apos;t touch your staked principal.
          </>
        ),
      },
    ],
  },
  {
    id: "lending",
    title: "Lending & Borrowing",
    icon: <Landmark className="w-4 h-4" />,
    items: [
      {
        q: "How do lending rates work?",
        a: (
          <div className="space-y-2">
            <p>
              A <strong>Jump Rate Model</strong> sets rates automatically from utilisation
              (borrowed ÷ supplied):
            </p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>0% utilisation → borrow 2%, supply 0%</li>
              <li>50% utilisation → borrow ~9.5%, supply ~3.8%</li>
              <li>80% utilisation (optimal) → borrow 14%, supply ~9%</li>
              <li>100% utilisation → borrow 44% - the spike pushes borrowers to repay and attracts new supply</li>
            </ul>
            <p>
              Suppliers earn the borrow interest minus a 20% protocol reserve. Everything is
              on-chain and updates per block.
            </p>
          </div>
        ),
      },
      {
        q: "How does borrowing work?",
        a: (
          <>
            Deposit WETH as collateral, borrow QUSDC against it. Your max LTV (loan-to-value)
            depends on your credit score: 60% with no reputation up to 80% at Platinum. Type the
            amount you want to borrow and the app auto-calculates the minimum collateral -
            add a buffer (+25% recommended) so price moves don&apos;t liquidate you.
          </>
        ),
      },
      {
        q: "What is liquidation and how do I avoid it?",
        a: (
          <div className="space-y-2">
            <p>
              If your debt grows past the liquidation threshold (your max LTV + 8%), anyone can
              repay your debt and take equivalent collateral plus a bonus. You keep the borrowed
              QUSDC but lose collateral.
            </p>
            <p><strong>The Health Factor zones (same semantics as major exchanges):</strong></p>
            <ul className="list-none space-y-1 text-xs">
              <li><span className="text-primary font-semibold">≥ 1.50 - Safe.</span> Comfortable buffer; normal dips won&apos;t touch you.</li>
              <li><span className="text-gold font-semibold">1.20-1.50 - Monitor.</span> Fine, but watch the ETH price.</li>
              <li><span className="text-orange-400 font-semibold">1.00-1.20 - High risk.</span> One sharp dip from liquidation. Act now.</li>
              <li><span className="text-red-400 font-semibold">&lt; 1.00 - Liquidated.</span> Anyone can close your position and take a 5% bonus.</li>
            </ul>
            <p><strong>To stay safe:</strong></p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Open positions at HF ≥ 1.5 - use the &quot;+25% safer&quot; button</li>
              <li>Repay partially or add collateral when ETH price drops</li>
              <li>Platinum users (score 801+) get a <strong>2-hour Grace Shield</strong> warning window before liquidation can execute</li>
            </ul>
          </div>
        ),
      },
      {
        q: "Why is the ETH price on the site different from my exchange?",
        a: (
          <>
            The UI shows the live CoinGecko market price (refreshed every 60s). The smart contract
            enforces LTV using its on-chain oracle. The app always uses the more conservative of
            the two for collateral math, so a transaction that passes in the UI never reverts
            on-chain.
          </>
        ),
      },
    ],
  },
  {
    id: "reputation",
    title: "Reputation & Credit Score",
    icon: <IdCard className="w-4 h-4" />,
    items: [
      {
        q: "How do I build my credit score?",
        a: (
          <div className="space-y-2">
            <p>Three steps, all privacy-preserving:</p>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>QIEPass KYC</strong> - verify identity once → <Badge className="bg-primary/10 text-primary border-primary/25 text-[10px]">+200 pts</Badge></li>
              <li><strong>Web2 proofs</strong> - prove your credit bureau score (CIBIL, Experian, Credit Karma) via Reclaim ZK proofs → <Badge className="bg-primary/10 text-primary border-primary/25 text-[10px]">up to +300 pts</Badge></li>
              <li><strong>DEX wallets</strong> - link wallets with real on-chain history → <Badge className="bg-primary/10 text-primary border-primary/25 text-[10px]">up to +250 pts</Badge></li>
            </ul>
            <p className="text-xs">
              KYC unlocks the other two steps. Scores are signed by the YieldPass oracle and
              written on-chain - the underlying documents never leave your device.
            </p>
          </div>
        ),
      },
      {
        q: "What exactly does each score band give me?",
        a: (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border border-border/50 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-muted/30">
                  <th className="text-left p-2 font-medium">Band</th>
                  <th className="text-left p-2 font-medium">Score</th>
                  <th className="text-left p-2 font-medium">Stake APY</th>
                  <th className="text-left p-2 font-medium">Borrow LTV</th>
                  <th className="text-left p-2 font-medium">Rate discount</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                {[
                  ["No boost", "0-200", "1.00×", "60%", "-"],
                  ["Bronze", "201-400", "1.10×", "64%", "−3%"],
                  ["Silver", "401-600", "1.20×", "68%", "−6%"],
                  ["Gold", "601-800", "1.35×", "72%", "−9%"],
                  ["Platinum", "801-1000", "1.50×", "75%", "−12% + Grace Shield"],
                ].map(([band, range, apy, ltv, disc]) => (
                  <tr key={band} className="border-t border-border/40">
                    <td className="p-2 font-medium text-foreground">{band}</td>
                    <td className="p-2 font-mono">{range}</td>
                    <td className="num p-2 text-primary">{apy}</td>
                    <td className="num p-2 text-gold">{ltv}</td>
                    <td className="num p-2 text-primary">{disc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      },
      {
        q: "Is my personal data stored on-chain?",
        a: (
          <>
            No. KYC happens on QIEPass - YieldPass only receives a signed &quot;verified&quot;
            attestation. Credit bureau proofs use Reclaim Protocol zero-knowledge proofs: the chain
            only sees &quot;score ≥ X&quot; was proven, never the document, account number or even
            the exact score. Each document has a nullifier so it can&apos;t be reused by another
            wallet.
          </>
        ),
      },
      {
        q: "Does my KYC expire?",
        a: (
          <>
            Yes - 90 days. Re-verify before expiry to keep your +200 pts and boost active. The
            dashboard shows your expiry date.
          </>
        ),
      },
    ],
  },
  {
    id: "security",
    title: "Security & Risk",
    icon: <ShieldCheck className="w-4 h-4" />,
    items: [
      {
        q: "What protects my deposits?",
        a: (
          <div className="space-y-2">
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Insurance Fund</strong> - 5% of all yield accrues to a dedicated fund for shortfall events.</li>
              <li><strong>Overcollateralisation</strong> - every loan is backed by more WETH value than the debt, enforced per block by the oracle.</li>
              <li><strong>Anti-whale caps</strong> - boosted APY caps at $10k per wallet so the yield pool can&apos;t be drained.</li>
              <li><strong>Proof nullifiers</strong> - one document = one wallet = one score boost. No farming.</li>
              <li><strong>Liquidation engine + keeper bots</strong> - underwater positions are closed before they damage the pool.</li>
            </ul>
          </div>
        ),
      },
      {
        q: "What are the real risks?",
        a: (
          <div className="space-y-2">
            <p>Honest answer - DeFi always has risk:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li><strong>Smart-contract risk</strong> - bugs are possible in any protocol.</li>
              <li><strong>Variable APY</strong> - staking yield depends on real DEX volume; it can drop.</li>
              <li><strong>Liquidation risk</strong> - borrowers can lose collateral if ETH falls fast.</li>
              <li><strong>Utilisation risk</strong> - at 100% utilisation supply withdrawals queue until rates rebalance.</li>
            </ul>
            <p className="text-xs">Never deposit more than you can afford to lose. This is testnet - perfect time to learn.</p>
          </div>
        ),
      },
    ],
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FaqPage() {
  const [open, setOpen] = useState<string | null>("stake-vs-lend-0");

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">

      {/* Header */}
      <div className="text-center space-y-3 pt-4">
        <div className="w-12 h-12 rounded-2xl qie-gradient flex items-center justify-center mx-auto shadow-lg shadow-emerald-950/50">
          <CircleHelp className="w-6 h-6 text-emerald-950" />
        </div>
        <h1 className="font-heading text-4xl sm:text-5xl tracking-tight">How YieldPass works</h1>
        <p className="text-muted-foreground text-base max-w-md mx-auto">
          Staking, lending, reputation, risk - straight answers, no jargon.
        </p>
      </div>

      {/* Quick nav */}
      <div className="flex flex-wrap justify-center gap-2">
        {SECTIONS.map(s => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-border/50 hover:border-gold/50 hover:bg-gold/5 hover:-translate-y-0.5 rounded-full px-3 py-1.5 transition-all"
          >
            {s.icon}
            {s.title}
          </a>
        ))}
      </div>

      {/* Sections */}
      {SECTIONS.map(section => (
        <section key={section.id} id={section.id} className="space-y-3 scroll-mt-24">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gold/10 border border-gold/25 flex items-center justify-center text-gold">
              {section.icon}
            </div>
            <h2 className="font-heading text-2xl">{section.title}</h2>
          </div>

          <div className="space-y-2">
            {section.items.map((item, i) => {
              const key = `${section.id}-${i}`;
              const isOpen = open === key;
              return (
                <Card
                  key={key}
                  className={`border transition-colors ${isOpen ? "border-primary/35 bg-primary/4" : "border-border/50 hover:border-foreground/25 hover:bg-white/2"}`}
                >
                  <button
                    className="w-full text-left"
                    onClick={() => setOpen(isOpen ? null : key)}
                  >
                    <CardContent className="py-3.5 flex items-center justify-between gap-3">
                      <span className="text-[15px] font-medium">{item.q}</span>
                      <ChevronDown
                        className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                      />
                    </CardContent>
                  </button>
                  {isOpen && (
                    <CardContent className="pt-0 pb-5 text-[15px] text-muted-foreground leading-relaxed animate-in fade-in slide-in-from-top-1 duration-200">
                      {item.a}
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        </section>
      ))}

      {/* Footer CTA */}
      <Card className="glow-card border-gold/20 text-center">
        <CardContent className="py-8 space-y-3">
          <TrendingUp className="w-6 h-6 text-gold mx-auto" />
          <p className="font-heading text-2xl">Enough reading. Go earn.</p>
          <div className="flex justify-center gap-3 flex-wrap pt-1">
            <Link href="/stake" className="bg-primary text-primary-foreground text-sm font-semibold px-5 py-2 rounded-lg shadow-lg shadow-emerald-950/40 hover:shadow-[0_0_24px_-6px_var(--primary)] hover:-translate-y-px transition-all">
              Start Staking
            </Link>
            <Link href="/reputation" className="text-sm font-medium border border-border/60 px-5 py-2 rounded-lg hover:bg-white/5 transition-colors">
              Build Reputation
            </Link>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
