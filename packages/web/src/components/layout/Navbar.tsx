"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useConnect, useConnectors, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { Button } from "@/components/ui/button";
import { ACTIVE_CHAIN } from "@/lib/constants";

const NAV_LINKS = [
  { href: "/dashboard",  label: "Dashboard"  },
  { href: "/stake",      label: "Stake"      },
  { href: "/lending",    label: "Lend"       },
  { href: "/calculator", label: "Calculator" },
  { href: "/reputation", label: "Reputation" },
  { href: "/faq",        label: "FAQ"        },
];

export function Navbar() {
  const { address, isConnected }  = useAccount();
  const { connect }               = useConnect();
  const connectors                = useConnectors();
  const { disconnect }            = useDisconnect();
  const chainId                   = useChainId();
  const { switchChain }           = useSwitchChain();
  const pathname                  = usePathname();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [copied, setCopied]         = useState(false);

  // wagmi reconnects from storage only on the client, so isConnected/chainId
  // differ between SSR and the first client render → hydration mismatch. Gate
  // all wallet-derived UI on `mounted` so the first client paint matches server.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const mmConnector    = connectors.find(c => c.id === "metaMask") ?? connectors[0];
  const connected      = mounted && isConnected;
  const isCorrectChain = chainId === ACTIVE_CHAIN.id;

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-2xl">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">

        {/* Logo + desktop nav */}
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 shrink-0 group" onClick={() => setMobileOpen(false)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-mark.svg"
              alt="YieldPass"
              width={40}
              height={40}
              className="h-9 w-auto transition-transform duration-300 group-hover:scale-105"
            />
            <span className="font-heading font-semibold text-xl tracking-tight">
              <span className="text-foreground">Yield</span><span className="text-gold">Pass</span>
            </span>
          </Link>

          <div className="hidden sm:flex items-center gap-1">
            {NAV_LINKS.map(({ href, label }) => {
              const active = pathname === href || (href !== "/" && pathname?.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  className={`group/nav relative px-3 py-1.5 text-[13px] font-medium rounded-md transition-colors duration-200 ${
                    active
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                  {/* Active: gold underline. Hover: emerald underline grows from left. */}
                  <span
                    className={`absolute left-3 right-3 -bottom-px h-px transition-transform duration-300 origin-left ${
                      active
                        ? "bg-gold scale-x-100"
                        : "bg-primary scale-x-0 group-hover/nav:scale-x-100"
                    }`}
                  />
                </Link>
              );
            })}
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {/* Network chip - pulsing live dot */}
          <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground border border-border/60 rounded-full px-3 py-1">
            <span className={`w-1.5 h-1.5 rounded-full ${connected && isCorrectChain ? "bg-primary pulse-dot" : "bg-muted-foreground/50"}`} />
            {ACTIVE_CHAIN.name}
          </span>

          {connected && !isCorrectChain && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => switchChain({ chainId: ACTIVE_CHAIN.id })}
            >
              Switch Network
            </Button>
          )}

          {connected ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                title={copied ? "Copied!" : "Copy address"}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/80 border border-border/60 hover:border-primary/40 hover:bg-secondary transition-all duration-200 group"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 pulse-dot" />
                <span className="text-xs text-secondary-foreground font-mono">
                  {address?.slice(0, 6)}···{address?.slice(-4)}
                </span>
                {copied ? (
                  <svg className="w-3 h-3 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3 text-muted-foreground group-hover:text-foreground transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
              <Button
                variant="ghost"
                size="sm"
                className="hidden sm:flex text-muted-foreground hover:text-foreground"
                onClick={() => disconnect()}
              >
                Disconnect
              </Button>
            </div>
          ) : (
            <button
              onClick={() => mmConnector && connect({ connector: mmConnector })}
              className="hidden sm:block bg-primary text-primary-foreground text-sm font-semibold px-4 py-2 rounded-lg shadow-lg shadow-emerald-950/40 hover:shadow-[0_0_28px_-6px_var(--primary)] hover:-translate-y-px transition-all duration-200"
            >
              Connect Wallet
            </button>
          )}

          {/* Mobile hamburger */}
          <button
            className="sm:hidden p-2 rounded-lg hover:bg-white/5 transition-colors"
            onClick={() => setMobileOpen(o => !o)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu dropdown */}
      {mobileOpen && (
        <div className="sm:hidden border-t border-border/50 bg-background/95 backdrop-blur-2xl px-4 py-3 space-y-1 animate-in fade-in slide-in-from-top-2 duration-200">
          {NAV_LINKS.map(({ href, label }) => {
            const active = pathname === href || (href !== "/" && pathname?.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={`block px-3 py-2.5 text-sm font-medium rounded-lg transition-all ${
                  active ? "text-foreground bg-white/5 border-l-2 border-gold pl-4" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                }`}
              >
                {label}
              </Link>
            );
          })}
          <div className="pt-2 border-t border-border/40 mt-2">
            {connected ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-secondary/50 border border-border/40">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary pulse-dot" />
                    <span className="text-xs font-mono text-secondary-foreground">
                      {address?.slice(0, 8)}···{address?.slice(-6)}
                    </span>
                  </div>
                  <button onClick={handleCopy} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <button
                  onClick={() => { disconnect(); setMobileOpen(false); }}
                  className="w-full text-sm text-muted-foreground px-3 py-2 rounded-lg border border-border/60 hover:text-foreground hover:border-border transition-all"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={() => { mmConnector && connect({ connector: mmConnector }); setMobileOpen(false); }}
                className="w-full bg-primary text-primary-foreground text-sm font-semibold px-4 py-2.5 rounded-lg hover:opacity-90 transition-opacity"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
