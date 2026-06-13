"use client";

import Link from "next/link";
import { useCreditScore } from "@/hooks/useCreditScore";

export function KYCGate({ children }: { children: React.ReactNode }) {
  const { isKYCVerified, isLoading } = useCreditScore();

  if (isLoading) return null;

  if (!isKYCVerified) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-6">
          {/* Lock icon */}
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>

          {/* Message */}
          <div className="space-y-2">
            <h2 className="text-xl font-heading font-bold">QIEPass KYC Required</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              This section is only accessible to verified QIEPass holders.
              Complete your identity verification first to unlock credit bureau,
              telecom, and wallet linking.
            </p>
          </div>

          {/* Steps preview */}
          <div className="rounded-xl border border-border/60 bg-secondary/30 p-4 text-left space-y-2.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Unlock order</p>
            {[
              { n: 1, label: "QIEPass KYC", active: true },
              { n: 2, label: "Credit Bureau / Telecom", active: false },
              { n: 3, label: "DEX Wallets", active: false },
            ].map(s => (
              <div key={s.n} className={`flex items-center gap-3 text-sm ${s.active ? "text-primary font-medium" : "text-muted-foreground"}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  s.active
                    ? "bg-primary/20 border border-primary/40 text-primary"
                    : "bg-secondary border border-border/60"
                }`}>
                  {s.n}
                </div>
                {s.label}
                {!s.active && (
                  <svg className="w-3 h-3 ml-auto text-muted-foreground/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75" />
                    <rect x="3.75" y="10.5" width="16.5" height="11.25" rx="2.25" />
                  </svg>
                )}
              </div>
            ))}
          </div>

          <Link
            href="/reputation/kyc"
            className="inline-flex w-full items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold py-2.5 rounded-xl text-sm shadow-lg shadow-emerald-950/40 hover:shadow-[0_0_24px_-6px_var(--primary)] hover:-translate-y-px transition-all"
          >
            Verify with QIEPass
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
