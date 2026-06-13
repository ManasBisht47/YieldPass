import Link from "next/link";

const FOOTER_LINKS = [
  { href: "/dashboard",  label: "Dashboard"  },
  { href: "/stake",      label: "Stake"      },
  { href: "/lending",    label: "Lend"       },
  { href: "/calculator", label: "Calculator" },
  { href: "/reputation", label: "Reputation" },
  { href: "/faq",        label: "FAQ"        },
];

export function Footer() {
  return (
    <footer className="mt-24">
      {/* Boarding-pass tear line */}
      <div className="max-w-6xl mx-auto px-4">
        <div className="perforation w-full" />
      </div>

      <div className="max-w-6xl mx-auto px-4 py-10 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-mark.svg"
            alt="YieldPass"
            width={34}
            height={34}
            className="h-8 w-auto"
          />
          <div>
            <p className="font-heading font-semibold text-sm">
              <span className="text-foreground">Yield</span><span className="text-gold">Pass</span>
            </p>
            <p className="text-[10px] text-muted-foreground">Reputation-powered yield on QIE</p>
          </div>
        </div>

        <nav className="flex items-center gap-1 flex-wrap justify-center">
          {FOOTER_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="underline-grow px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {label}
            </Link>
          ))}
        </nav>

        <p className="text-[10px] text-muted-foreground text-center sm:text-right leading-relaxed">
          QIE Testnet · Yield from real fees, not emissions.<br className="hidden sm:block" />
          DeFi involves risk - read the FAQ before depositing.
        </p>
      </div>
    </footer>
  );
}
