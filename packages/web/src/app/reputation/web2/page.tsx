"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAccount, useWriteContract } from "wagmi";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NetworkGuard } from "@/components/layout/NetworkGuard";
import { KYCGate } from "@/components/layout/KYCGate";
import { useCreditScore } from "@/hooks/useCreditScore";
import { useOnChainProofs } from "@/hooks/useOnChainProofs";
import { CONTRACTS } from "@/lib/constants";
import {
  PROOF_TYPE_INFO,
  CREDIT_REGIONS,
  CREDIT_PROVIDERS_BY_REGION,
  CREDIT_PROOF_TYPES,
  type ZKProofType,
  type CreditRegion,
} from "@/types/reputation";

// ── Minimal ABI fragments ─────────────────────────────────────────────────────

const REPUTATION_ABI = [
  {
    name: "commitZKProof",
    type: "function",
    inputs: [
      { name: "master",            type: "address" },
      { name: "proofHash",         type: "bytes32" },
      { name: "proofTypeHash",     type: "bytes32" },
      { name: "documentNullifier", type: "bytes32" },
      { name: "signature",         type: "bytes"   },
      { name: "nonce",             type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "updateCreditScore",
    type: "function",
    inputs: [
      { name: "master",    type: "address" },
      { name: "score",     type: "uint16"  },
      { name: "signature", type: "bytes"   },
      { name: "nonce",     type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

interface OracleResult {
  commitProof: {
    proofHash:          `0x${string}`;
    proofTypeHash:      `0x${string}`;
    documentNullifier:  `0x${string}`;
    signature:          `0x${string}`;
    nonce:              string;
  } | null;
  updateScore: {
    score:     number;
    signature: `0x${string}`;
    nonce:     string;
  };
  delta:         number;
  previousScore: number;
  newScore:      number;
  scoreOnly?:    boolean;
}

// ── Provider card ─────────────────────────────────────────────────────────────

function ProviderCard({
  type, label, desc, maxPts, flag,
  submitting, onVerify, done,
}: {
  type:       ZKProofType;
  label:      string;
  desc:       string;
  maxPts:     number;
  flag?:      string;
  submitting: ZKProofType | null;
  onVerify:   (t: ZKProofType) => void;
  done?:      boolean;
}) {
  const loading = submitting === type;
  return (
    <Card className={done ? "border-primary/20 bg-primary/3" : ""}>
      <CardContent className="pt-3 pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0 space-y-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              {flag && <span>{flag}</span>}
              <span className="text-sm font-medium">{label}</span>
              {done ? (
                <Badge className="text-xs bg-primary/15 text-primary border-primary/30">✓ Submitted</Badge>
              ) : (
                <Badge variant="outline" className="text-xs font-mono">+up to {maxPts} pts</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">{desc}</p>
          </div>
          {done ? (
            <span className="text-xs text-primary shrink-0 font-medium">Done</span>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onVerify(type)}
              disabled={loading || submitting !== null}
              className="shrink-0"
            >
              {loading ? "Opening…" : "Verify"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Web2Page() {
  const { address, isConnected } = useAccount();
  const { score, refetch }       = useCreditScore();
  const { writeContractAsync }   = useWriteContract();

  const [submitting, setSubmitting]     = useState<ZKProofType | null>(null);
  const [creditRegion, setCreditRegion] = useState<CreditRegion>("india");

  const [pendingSession, setPendingSession] = useState<{
    sessionId: string;
    proofType: ZKProofType;
  } | null>(null);

  const [oracleResult, setOracleResult] = useState<OracleResult | null>(null);
  const [doneProofs, setDoneProofs]     = useState<Set<ZKProofType>>(new Set());

  // On-chain source of truth — reads ZKProofCommitted event logs for this wallet
  const { done: onChainDone } = useOnChainProofs(address as `0x${string}` | undefined);
  // Union: localStorage (fast) + on-chain (authoritative for pre-feature submissions)
  const effectiveDone = new Set([...doneProofs, ...onChainDone]);

  type SubmitPhase = "idle" | "committing" | "scoring" | "done";
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>("idle");

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load submitted proofs from localStorage on wallet connect
  useEffect(() => {
    if (!address) return;
    try {
      const raw = localStorage.getItem(`yp_proofs_${address}`);
      if (raw) setDoneProofs(new Set(JSON.parse(raw) as ZKProofType[]));
    } catch { /* ignore */ }
  }, [address]);

  // ── Polling ──────────────────────────────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => {
    if (!pendingSession || oracleResult) { stopPolling(); return; }

    pollRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`/api/reputation/zkproof/status?sessionId=${pendingSession.sessionId}`);
        const data = await res.json();
        if (data.status === "ready") {
          stopPolling();
          setOracleResult(data.result as OracleResult);
          toast.success("Proof verified! Review and submit for scoring below.");
        } else if (data.status === "error") {
          stopPolling();
          toast.error(data.error ?? "Proof verification failed");
          setPendingSession(null);
        }
      } catch { /* network glitch — keep polling */ }
    }, 3000);

    return stopPolling;
  }, [pendingSession, oracleResult, stopPolling]);

  // ── Start proof session ───────────────────────────────────────────────────────

  const handleProof = async (proofType: ZKProofType) => {
    setSubmitting(proofType);
    try {
      const res = await fetch("/api/reputation/zkproof", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ walletAddress: address, proofType }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed to start proof"); return; }

      window.open(data.reclaimUrl, "_blank", "noopener,noreferrer");
      setPendingSession({ sessionId: data.sessionId, proofType });
      toast.info("Complete verification in the Reclaim tab. This page polls automatically.", { duration: 8000 });
    } catch {
      toast.error("Network error — try again");
    } finally {
      setSubmitting(null);
    }
  };

  // ── Submit on-chain ───────────────────────────────────────────────────────────

  const handleSubmitOnChain = async () => {
    if (!oracleResult || !address) return;
    const registryAddr = CONTRACTS.reputationRegistry;
    if (!registryAddr) {
      toast.error("Contract not deployed — set NEXT_PUBLIC_REPUTATION_REGISTRY_ADDRESS");
      return;
    }
    try {
      // Re-sync (scoreOnly): proof is already committed, so we only push the
      // corrected score — one transaction, no commit step.
      if (oracleResult.commitProof) {
        setSubmitPhase("committing");
        toast.info("Step 1/2 — Committing proof hash on-chain…");
        await writeContractAsync({
          address:      registryAddr,
          abi:          REPUTATION_ABI,
          functionName: "commitZKProof",
          args: [
            address,
            oracleResult.commitProof.proofHash,
            oracleResult.commitProof.proofTypeHash,
            oracleResult.commitProof.documentNullifier,
            oracleResult.commitProof.signature,
            BigInt(oracleResult.commitProof.nonce),
          ],
        });
      }

      setSubmitPhase("scoring");
      toast.info(oracleResult.commitProof ? "Step 2/2 — Updating credit score on-chain…" : "Syncing your credit score on-chain…");
      await writeContractAsync({
        address:      registryAddr,
        abi:          REPUTATION_ABI,
        functionName: "updateCreditScore",
        args: [
          address,
          oracleResult.updateScore.score,
          oracleResult.updateScore.signature,
          BigInt(oracleResult.updateScore.nonce),
        ],
      });

      setSubmitPhase("done");
      toast.success(
        `Score updated! ${oracleResult.previousScore} → ${oracleResult.newScore} (+${oracleResult.delta} pts)`,
        { duration: 6000 },
      );
      // Persist completed proof type to localStorage
      if (pendingSession) {
        setDoneProofs(prev => {
          const next = new Set(prev);
          next.add(pendingSession.proofType);
          try { localStorage.setItem(`yp_proofs_${address}`, JSON.stringify([...next])); } catch { /* ignore */ }
          return next;
        });
      }
      setOracleResult(null);
      setPendingSession(null);
      setTimeout(refetch, 2000);
    } catch (err: unknown) {
      setSubmitPhase("idle");
      const msg = err instanceof Error ? err.message : "Transaction failed";
      toast.error(msg.length > 120 ? msg.slice(0, 120) + "…" : msg);
    }
  };

  if (!isConnected) {
    return <div className="text-center py-24"><p>Connect your wallet first.</p></div>;
  }

  const selectedRegionInfo  = CREDIT_REGIONS.find(r => r.key === creditRegion)!;
  const providersForRegion  = CREDIT_PROVIDERS_BY_REGION[creditRegion];
  const providerInfoList    = providersForRegion.map(t => PROOF_TYPE_INFO.find(p => p.type === t)!).filter(Boolean);
  const telecomInfo         = PROOF_TYPE_INFO.find(p => p.type === "TELECOM")!;
  const isSubmitting        = submitPhase === "committing" || submitPhase === "scoring";

  // True when ANY credit bureau proof has been committed on-chain for this wallet
  const creditBureauDone     = [...CREDIT_PROOF_TYPES].some(t => effectiveDone.has(t));
  const completedBureauInfo  = PROOF_TYPE_INFO.find(p => CREDIT_PROOF_TYPES.has(p.type) && effectiveDone.has(p.type));

  return (
    <NetworkGuard>
    <KYCGate>
      <div className="max-w-xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-heading font-bold">Credit Score Verification</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Verify your credit bureau score via ZK proof. No raw data leaves your device —
            only a cryptographic hash is stored on-chain.
          </p>
        </div>

        {/* Score summary */}
        <Card className="glow-card border-border/60">
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Current credit score</span>
              <span className="font-bold text-lg">{score} / 1000</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-2 text-xs text-muted-foreground">
              <span>Credit bureau → +up to 200 pts</span>
              <span>Telecom → +100 pts</span>
            </div>
          </CardContent>
        </Card>

        {/* Polling banner */}
        {pendingSession && !oracleResult && (
          <Card className="border-primary/25 bg-primary/5">
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-primary">Waiting for Reclaim proof…</p>
                  <p className="text-xs text-primary">Complete verification in the Reclaim tab. This page polls automatically.</p>
                </div>
                <Button size="sm" variant="ghost" className="text-primary hover:text-primary shrink-0"
                  onClick={() => { stopPolling(); setPendingSession(null); }}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Oracle result banner */}
        {oracleResult && (
          <Card className="border-primary/25 bg-primary/5">
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="text-sm font-medium text-primary">
                Proof verified — ready to submit on-chain
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 pb-3 space-y-3">
              <div className="text-xs text-primary space-y-0.5">
                <p>Current score: <span className="font-mono font-semibold">{oracleResult.previousScore}</span></p>
                <p>Points gained: <span className="font-mono font-semibold">+{oracleResult.delta}</span></p>
                <p>New score: <span className="font-mono font-semibold">{oracleResult.newScore}</span></p>
              </div>
              <div className="text-xs bg-white/3 border border-primary/20 rounded p-2 text-primary">
                Two on-chain transactions required — your wallet will prompt you twice.
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSubmitOnChain} disabled={isSubmitting}
                  className="flex-1 bg-primary hover:bg-primary/85 text-primary-foreground">
                  {submitPhase === "committing" ? "Committing proof…"
                    : submitPhase === "scoring" ? "Updating score…"
                    : submitPhase === "done"    ? "Done!"
                    : "Submit for Scoring"}
                </Button>
                {!isSubmitting && submitPhase !== "done" && (
                  <Button size="sm" variant="outline" className="border-border/60"
                    onClick={() => { setOracleResult(null); setPendingSession(null); }}>
                    Dismiss
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Credit Bureau Section ─────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">Credit Bureau</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {creditBureauDone ? "Proof submitted — re-verification not allowed." : "Select your country to see available providers."}
              </p>
            </div>
            {creditBureauDone && (
              <Badge className="bg-primary/15 text-primary border-primary/30 text-xs shrink-0">
                ✓ Verified
              </Badge>
            )}
          </div>

          {/* ── LOCKED state — bureau already verified ─────────────────────── */}
          {creditBureauDone ? (
            <Card className="border-primary/20 bg-primary/4">
              <CardContent className="pt-4 pb-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0 text-base">
                    ✓
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-primary">
                      {completedBureauInfo ? `${completedBureauInfo.flag ?? ""} ${completedBureauInfo.label}`.trim() : "Credit Bureau"} — Verified
                    </p>
                    <p className="text-xs text-primary mt-0.5">
                      Proof hash committed on-chain
                    </p>
                  </div>
                </div>

                {/* All regions locked */}
                <div className="pt-1">
                  <p className="text-xs text-muted-foreground mb-2">All regions locked</p>
                  <div className="flex flex-wrap gap-2">
                    {CREDIT_REGIONS.filter(r => r.key !== "other").map(r => (
                      <span
                        key={r.key}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border/40 text-muted-foreground/50 cursor-not-allowed select-none"
                      >
                        {r.label}
                      </span>
                    ))}
                  </div>
                </div>

                {completedBureauInfo && (
                  <div className="border-t border-border/30 pt-3 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Score lower than expected? Re-read your bureau score and sync it on-chain — no re-commit, just one transaction.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full border-gold/30 text-gold hover:bg-gold/10"
                      disabled={submitting !== null || !!pendingSession || isSubmitting}
                      onClick={() => handleProof(completedBureauInfo.type)}
                    >
                      {pendingSession || submitting === completedBureauInfo.type ? "Syncing…" : "Re-sync credit score"}
                    </Button>
                  </div>
                )}

                <p className="text-xs text-muted-foreground border-t border-border/30 pt-2">
                  Each wallet is limited to one credit bureau verification. Re-submission is blocked on-chain regardless of points earned.
                </p>
              </CardContent>
            </Card>

          ) : (
            <>
              {/* Region selector */}
              <div className="flex flex-wrap gap-2">
                {CREDIT_REGIONS.map(r => (
                  <button
                    key={r.key}
                    onClick={() => {
                      if (pendingSession && r.key !== creditRegion) {
                        if (!window.confirm("Switching region will cancel your active verification session. Continue?")) return;
                        stopPolling();
                        setPendingSession(null);
                      }
                      setCreditRegion(r.key);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      creditRegion === r.key
                        ? "bg-primary text-primary-foreground border-transparent shadow-sm shadow-primary/30"
                        : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              {/* Supported region — show providers */}
              {selectedRegionInfo.supported && (
                <div className="space-y-2">
                  {providerInfoList.map(info => (
                    <ProviderCard
                      key={info.type}
                      type={info.type}
                      label={info.label}
                      desc={info.desc}
                      maxPts={info.maxPts}
                      flag={info.flag}
                      submitting={submitting}
                      onVerify={handleProof}
                      done={effectiveDone.has(info.type)}
                    />
                  ))}
                  <div className="text-xs bg-primary/8 border border-primary/20 rounded-lg p-3 text-primary space-y-1">
                    <p className="font-medium">How it works</p>
                    <p>1. Click Verify → log into the provider in the Reclaim tab</p>
                    <p>2. Reclaim generates a ZK proof on your device — your raw score is never shared</p>
                    <p>3. Score is mapped to YieldPass points and committed on-chain</p>
                  </div>
                </div>
              )}

              {/* Unsupported region */}
              {!selectedRegionInfo.supported && (
                <Card className="border-gold/20 bg-gold/5">
                  <CardContent className="pt-4 pb-4 space-y-2">
                    <p className="text-sm font-medium text-gold">
                      Credit bureau verification not available for your region yet.
                    </p>
                    <p className="text-xs text-gold">
                      Currently supported: India, USA, Canada, and UK. More regions coming soon — you&apos;ll be able to unlock boosted APY once your region is live.
                    </p>
                    <p className="text-xs text-gold font-medium">
                      In the meantime, use Telecom Verification below to earn base reputation points.
                    </p>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>

        {/* ── Telecom Section ───────────────────────────────────────────────── */}
        {(() => {
          const telecomDone = effectiveDone.has(telecomInfo.type);
          return (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold">Telecom Verification</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {telecomDone ? "Proof submitted — re-verification not allowed." : "Coming soon — telecom ZK proof provider is being onboarded."}
                  </p>
                </div>
                {telecomDone && (
                  <Badge className="bg-primary/15 text-primary border-primary/30 text-xs shrink-0">
                    ✓ Verified
                  </Badge>
                )}
              </div>

              {telecomDone ? (
                <Card className="border-primary/20 bg-primary/4">
                  <CardContent className="pt-4 pb-4 space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0 text-base">
                        ✓
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-primary">Telecom Account — Verified</p>
                        <p className="text-xs text-primary mt-0.5">Proof hash committed on-chain</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground border-t border-border/30 pt-2">
                      Each wallet is limited to one telecom verification. Re-submission is blocked on-chain regardless of points earned.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-border/40 bg-muted/5 opacity-70">
                  <CardContent className="pt-3 pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-medium">{telecomInfo.label}</span>
                          <Badge variant="outline" className="text-xs">Coming Soon</Badge>
                          <Badge variant="outline" className="text-xs font-mono">+up to {telecomInfo.maxPts} pts</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">Telecom ZK proof provider is pending — check back soon.</p>
                      </div>
                      <Button size="sm" variant="outline" disabled className="shrink-0 cursor-not-allowed opacity-50">
                        Soon
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          );
        })()}

        {/* Scoring breakdown */}
        <Card className="border-dashed">
          <CardHeader className="pb-2 pt-3">
            <CardTitle className="text-xs font-medium">Score breakdown — Credit Bureau</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 pb-3 text-xs text-muted-foreground space-y-0.5">
            <p>• Score 300 (min) → +0 pts</p>
            <p>• Score 600 → +100 pts</p>
            <p>• Score 750 → +150 pts</p>
            <p>• Score 900 / 850 (max) → +200 pts</p>
            <p className="pt-1 text-foreground/60">Linear mapping — higher bureau score = more YieldPass points.</p>
          </CardContent>
        </Card>

        {/* Privacy footer */}
        <Card className="border-dashed">
          <CardContent className="pt-3 pb-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Privacy guarantee</p>
            <p>• All proofs generated locally via Reclaim Protocol&apos;s TLS verification</p>
            <p>• Only a SHA-256 hash of the proof is stored on-chain</p>
            <p>• Which bureau or service you used is never visible on-chain</p>
            <p>• Your exact credit score is never shared — only the earned points</p>
            <p>• Each proof type submittable once per wallet address</p>
          </CardContent>
        </Card>

      </div>
    </KYCGate>
    </NetworkGuard>
  );
}
