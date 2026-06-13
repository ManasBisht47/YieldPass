import Link from "next/link";
import {
  Coins, Landmark, ShieldCheck, TrendingUp, ArrowRight, ArrowUpRight,
  IdCard, Lock, CircleHelp, Sparkle,
} from "lucide-react";

const TICKER_ITEMS = [
  { label: "Yield source", value: "Real QIEDex fees" },
  { label: "Max score boost", value: "1.5×" },
  { label: "Staker share", value: "85%" },
  { label: "Lock boost", value: "up to 1.15×" },
  { label: "Borrow LTV", value: "60–75%" },
  { label: "Rate discount", value: "up to −12%" },
  { label: "Insurance fund", value: "5% of yield" },
  { label: "Token emissions", value: "Zero" },
];

// Simplified mark for the floating coins — just the Y + rising arrow (no ticket
// frame), so it stays legible at coin size. Uses currentColor to sit on the disc.
function CoinGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 104 100" fill="none" className={className} aria-hidden="true">
      <g stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M26 30 L50 54 L50 78" />
        <path d="M50 54 Q 70 50 86 28" />
        <path d="M77 25 L87 28 L85 38" />
      </g>
    </svg>
  );
}

export default function HomePage() {
  return (
    <div className="space-y-28 sm:space-y-36">

      {/* ════════════════════════ HERO ════════════════════════ */}
      <section className="relative grid-bg rounded-3xl border border-border/50 overflow-hidden">
        {/* Aurora light */}
        <div className="aurora w-105 h-105 bg-primary/14 -top-40 left-1/2 -translate-x-1/2" />
        <div className="aurora w-72 h-72 bg-gold/10 top-20 -right-20 [animation-delay:-7s]" />

        {/* Floating coins — the crypto wink, kept classy */}
        <div className="coin hidden md:flex w-20 h-20 absolute top-24 left-[8%] items-center justify-center">
          <CoinGlyph className="w-11 h-11 text-gold-foreground" />
        </div>
        <div className="coin hidden md:flex w-11 h-11 absolute bottom-36 right-[10%] items-center justify-center [animation-name:coin-bob-alt] [animation-delay:-2s]">
          <CoinGlyph className="w-6 h-6 text-gold-foreground" />
        </div>

        <div className="relative px-6 sm:px-10 pt-24 pb-20 text-center space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="eyebrow justify-center mx-auto after:content-[''] after:w-7 after:h-px after:bg-gold/45">
            On QIE Chain
          </div>

          <h1 className="font-heading text-[2.9rem] leading-[1.04] sm:text-7xl md:text-[5.2rem] tracking-tight">
            Reputation
            <br />
            <em className="qie-gradient-text italic">pays here.</em>
          </h1>

          <p className="text-muted-foreground text-lg sm:text-xl max-w-xl mx-auto leading-relaxed">
            KYC once. Prove your credit score. Link your wallets.
            The protocol pays you like it knows you — <span className="text-foreground font-medium">because it does.</span>
          </p>

          <div className="flex gap-3.5 justify-center flex-wrap pt-2">
            <Link
              href="/stake"
              className="group bg-primary text-primary-foreground font-semibold px-8 py-3.5 rounded-xl text-base shadow-lg shadow-emerald-950/50 hover:shadow-[0_0_40px_-8px_var(--primary)] hover:-translate-y-0.5 transition-all duration-250 inline-flex items-center gap-2"
            >
              Start earning
              <ArrowRight className="w-4.5 h-4.5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link
              href="/faq"
              className="group text-base font-medium border border-border/70 text-foreground px-7 py-3.5 rounded-xl hover:border-foreground/30 hover:bg-white/4 hover:-translate-y-0.5 transition-all duration-250 inline-flex items-center gap-2"
            >
              <CircleHelp className="w-4.5 h-4.5 text-muted-foreground group-hover:text-foreground transition-colors" />
              How it works
            </Link>
          </div>

          <p className="text-xs text-muted-foreground/70 pt-1">
            Fees from real traders. Interest from real borrowers. Zero token printing.
          </p>
        </div>

        {/* Live ticker */}
        <div className="relative border-t border-border/50 bg-background/60 backdrop-blur overflow-hidden py-3.5 select-none">
          <div className="flex w-max [animation:ticker-scroll_38s_linear_infinite] hover:[animation-play-state:paused]">
            {[0, 1].map(dup => (
              <div key={dup} className="flex shrink-0">
                {TICKER_ITEMS.map(item => (
                  <span key={`${dup}-${item.label}`} className="flex items-center gap-2 px-7 text-[13px] whitespace-nowrap">
                    <Sparkle className="w-2.5 h-2.5 text-gold/70" />
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="num font-semibold text-foreground">{item.value}</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════ TWO PRODUCTS ════════════════════════ */}
      <section className="space-y-12">
        <div className="max-w-2xl">
          <p className="eyebrow">Two engines</p>
          <h2 className="font-heading text-4xl sm:text-5xl tracking-tight mt-4">
            Pick your yield.
            <span className="text-muted-foreground"> Or run both.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Stake */}
          <Link href="/stake" className="group block">
            <div className="tilt-card glow-card rounded-2xl bg-card h-full p-8 space-y-6">
              <div className="flex items-start justify-between">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/25 flex items-center justify-center group-hover:bg-primary/20 group-hover:scale-105 transition-all duration-300">
                  <Coins className="w-6 h-6 text-primary" />
                </div>
                <ArrowUpRight className="w-6 h-6 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-1 group-hover:-translate-y-1 transition-all duration-250" />
              </div>
              <div>
                <h3 className="font-heading text-3xl">Stake</h3>
                <p className="text-sm text-gold/80 mt-1.5 font-medium tracking-wide uppercase text-[11px]">You become the liquidity</p>
              </div>
              <p className="text-base text-muted-foreground leading-relaxed">
                Stake the chain&apos;s own coin — native QIE, one transaction, no approvals.
                It becomes QIEDex liquidity, and 85% of the trading fees land with stakers, daily.
              </p>
              <ul className="text-[15px] text-muted-foreground space-y-2.5 pt-1">
                <li className="flex items-center gap-3"><TrendingUp className="w-4 h-4 text-primary shrink-0" /> Up to 1.5× with a top score</li>
                <li className="flex items-center gap-3"><Lock className="w-4 h-4 text-primary shrink-0" /> Lock 30–180 days, take +0.5–1.5% more</li>
                <li className="flex items-center gap-3"><ShieldCheck className="w-4 h-4 text-primary shrink-0" /> 5% of every harvest backs the insurance fund</li>
              </ul>
            </div>
          </Link>

          {/* Lend */}
          <Link href="/lending" className="group block">
            <div className="tilt-card glow-card rounded-2xl bg-card h-full p-8 space-y-6">
              <div className="flex items-start justify-between">
                <div className="w-14 h-14 rounded-2xl bg-gold/10 border border-gold/25 flex items-center justify-center group-hover:bg-gold/20 group-hover:scale-105 transition-all duration-300">
                  <Landmark className="w-6 h-6 text-gold" />
                </div>
                <ArrowUpRight className="w-6 h-6 text-muted-foreground/40 group-hover:text-gold group-hover:translate-x-1 group-hover:-translate-y-1 transition-all duration-250" />
              </div>
              <div>
                <h3 className="font-heading text-3xl">Lend &amp; Borrow</h3>
                <p className="text-sm text-gold/80 mt-1.5 font-medium tracking-wide uppercase text-[11px]">You become the bank</p>
              </div>
              <p className="text-base text-muted-foreground leading-relaxed">
                Supply QUSDC and collect what borrowers pay. No lock, leave whenever.
                Need cash instead? Borrow against WETH — your score talks the rates down.
              </p>
              <ul className="text-[15px] text-muted-foreground space-y-2.5 pt-1">
                <li className="flex items-center gap-3"><TrendingUp className="w-4 h-4 text-gold shrink-0" /> Rates follow demand, block by block</li>
                <li className="flex items-center gap-3"><IdCard className="w-4 h-4 text-gold shrink-0" /> 75% LTV and −12% rates at Platinum</li>
                <li className="flex items-center gap-3"><ShieldCheck className="w-4 h-4 text-gold shrink-0" /> Every loan overcollateralised, always</li>
              </ul>
            </div>
          </Link>
        </div>
      </section>

      {/* ════════════════════════ HOW IT WORKS — banded ════════════════════════ */}
      <section className="section-band px-6 sm:px-12 py-14 sm:py-16 space-y-12">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div className="max-w-xl">
            <p className="eyebrow">The loop</p>
            <h2 className="font-heading text-4xl sm:text-5xl tracking-tight mt-4">
              Three moves.
              <span className="text-muted-foreground"> That&apos;s the game.</span>
            </h2>
          </div>
          <Link href="/faq" className="underline-grow text-base text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5 pb-1">
            Every detail, in the FAQ <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8">
          {[
            {
              n: "I",
              title: "Put your coins to work",
              desc: "Stake native QIE or supply QUSDC to the lending pool — base APY starts the same minute.",
            },
            {
              n: "II",
              title: "Show your receipts",
              desc: "QIEPass KYC. ZK proof of your credit score. Wallet history. Nothing personal ever touches the chain.",
            },
            {
              n: "III",
              title: "Watch the multiplier",
              desc: "Score 0–1000. At the top: 1.5× staking yield, 75% borrow LTV, −12% off your rates.",
            },
          ].map((item) => (
            <div key={item.n} className="group space-y-4">
              <div className="flex items-baseline gap-4">
                <span className="font-heading text-6xl italic text-gold/35 group-hover:text-gold transition-colors duration-300">
                  {item.n}
                </span>
                <div className="h-px flex-1 bg-border/60 group-hover:bg-gold/40 transition-colors duration-300" />
              </div>
              <p className="font-semibold text-xl">{item.title}</p>
              <p className="text-base text-muted-foreground leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ════════════════════════ LOCK TIERS ════════════════════════ */}
      <section className="space-y-12">
        <div className="max-w-2xl">
          <p className="eyebrow">Commitment pricing</p>
          <h2 className="font-heading text-4xl sm:text-5xl tracking-tight mt-4">
            Patience has
            <span className="text-muted-foreground"> a price list.</span>
          </h2>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {[
            { name: "Flexible", duration: "No lock",  bonus: "1.00×", penalty: "Leave anytime, free", gold: false },
            { name: "Silver",   duration: "30 days",  bonus: "1.05×", penalty: "1% if you bail early", gold: false },
            { name: "Gold",     duration: "90 days",  bonus: "1.10×", penalty: "2% if you bail early", gold: true  },
            { name: "Diamond",  duration: "180 days", bonus: "1.15×", penalty: "3% if you bail early", gold: true  },
          ].map((tier) => (
            <div
              key={tier.name}
              className={`tilt-card group rounded-2xl border bg-card overflow-hidden ${
                tier.gold ? "border-gold/30 glow-card-pink" : "border-border/60 glow-card"
              }`}
            >
              <div className={`px-5 pt-5 pb-3.5 flex items-center justify-between ${tier.gold ? "bg-gold/6" : ""}`}>
                <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">{tier.duration}</span>
                <span className={`w-2 h-2 rounded-full ${tier.gold ? "bg-gold pulse-dot" : "bg-muted-foreground/40"}`} />
              </div>
              <div className="perforation mx-4" />
              <div className="px-5 pt-4 pb-6 text-center space-y-2">
                <p className={`font-heading text-2xl ${tier.gold ? "gold-text italic" : ""}`}>{tier.name}</p>
                <p className={`num text-4xl font-bold tracking-tight ${tier.gold ? "text-gold" : "text-foreground"}`}>
                  {tier.bonus}
                </p>
                <p className="text-xs text-muted-foreground pt-0.5">{tier.penalty}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ════════════════════════ FAQ TEASER ════════════════════════ */}
      <section>
        <div className="tilt-card section-band section-band-gold px-7 sm:px-12 py-12 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="text-center sm:text-left max-w-lg">
            <p className="font-heading text-3xl">Staking vs lending —<br className="sm:hidden" /> which one&apos;s yours?</p>
            <p className="text-base text-muted-foreground mt-2.5">
              You&apos;re not the first to ask. The FAQ settles it in plain language — liquidation, ZK proofs, risk, all of it.
            </p>
          </div>
          <Link
            href="/faq"
            className="group shrink-0 inline-flex items-center gap-2 text-base font-semibold border border-gold/35 text-gold px-7 py-3.5 rounded-xl hover:bg-gold/10 hover:border-gold/55 hover:-translate-y-0.5 transition-all duration-250"
          >
            Read the FAQ
            <ArrowRight className="w-4.5 h-4.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      </section>

    </div>
  );
}
