"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useAccount, useWriteContract } from "wagmi";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NetworkGuard } from "@/components/layout/NetworkGuard";
import { useCreditScore } from "@/hooks/useCreditScore";
import { CONTRACTS } from "@/lib/constants";

const REPUTATION_ABI = [
  {
    name: "verifyKYC",
    type: "function",
    inputs: [
      { name: "master",    type: "address" },
      { name: "expiry",    type: "uint32"  },
      { name: "signature", type: "bytes"   },
      { name: "nonce",     type: "uint256" },
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

interface KYCTxData {
  master:    `0x${string}`;
  expiry:    number;
  signature: `0x${string}`;
  nonce:     string;
}

interface ScoreUpdateData {
  score:     number;
  signature: `0x${string}`;
  nonce:     string;
}

export default function KYCPage() {
  const { address, isConnected }  = useAccount();
  const { score, isKYCVerified, profile, refetch } = useCreditScore();
  const { writeContractAsync }    = useWriteContract();

  const [requestId, setRequestId]         = useState<string | null>(null);
  const [kycTxData, setKycTxData]         = useState<KYCTxData | null>(null);
  const [scoreUpdateData, setScoreUpdateData] = useState<ScoreUpdateData | null>(null);
  const [submitting, setSubmitting]       = useState(false);
  const [waitingKyc, setWaitingKyc]       = useState(false);
  const [timedOut, setTimedOut]           = useState(false);
  const [kycDone, setKycDone]             = useState(false);
  const [claimingScore, setClaimingScore] = useState(false);

  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  // Poll status after request created
  useEffect(() => {
    if (!requestId || kycTxData) { stopPolling(); return; }

    pollStartRef.current = Date.now();

    pollRef.current = setInterval(async () => {
      if (Date.now() - pollStartRef.current > 90_000) {
        stopPolling();
        setWaitingKyc(false);
        setTimedOut(true);
        return;
      }
      try {
        const res  = await fetch(`/api/reputation/kyc/status?requestId=${requestId}&walletAddress=${address}`);
        const data = await res.json();

        if (data.status === "ready") {
          stopPolling();
          setKycTxData(data.kycData as KYCTxData);
          setScoreUpdateData(data.scoreUpdate as ScoreUpdateData ?? null);
          setWaitingKyc(false);
          setTimedOut(false);
          toast.success("Identity verified! Click below to confirm on-chain.");
        } else if (data.status === "rejected") {
          stopPolling();
          setWaitingKyc(false);
          setRequestId(null);
          toast.error("Verification rejected on QIEPass.");
        } else if (data.status === "error") {
          stopPolling();
          setWaitingKyc(false);
          setRequestId(null);
          toast.error(data.error ?? "KYC verification failed");
        }
      } catch { /* keep polling */ }
    }, 5000);

    return stopPolling;
  }, [requestId, kycTxData, address, stopPolling]);

  const handleVerify = async () => {
    try {
      const res = await fetch("/api/reputation/kyc", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ walletAddress: address }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed to start KYC"); return; }

      // Wallet already verified on QIEPass - backend signed the txs, jump
      // straight to the on-chain confirm step (no polling needed).
      if (data.status === "ready") {
        setKycTxData(data.kycData as KYCTxData);
        setScoreUpdateData((data.scoreUpdate as ScoreUpdateData) ?? null);
        toast.success("Already verified on QIEPass - confirm on-chain to finish.");
        return;
      }

      setRequestId(data.requestId);
      setWaitingKyc(true);

      if (data.redirectUrl && data.status === "pending_kyc") {
        window.open(data.redirectUrl, "_blank", "noopener,noreferrer");
        toast.info("Complete KYC in the QIEPass tab. This page will update automatically.", { duration: 10000 });
      } else {
        toast.info("Check your QIEPass app to approve the credential request.", { duration: 10000 });
      }
    } catch {
      toast.error("Network error - try again");
    }
  };

  // Submit verifyKYC + updateCreditScore (two txs)
  const handleSubmitOnChain = async () => {
    if (!kycTxData || !address) return;
    const registryAddr = CONTRACTS.reputationRegistry;
    if (!registryAddr) { toast.error("Contract not deployed"); return; }

    setSubmitting(true);
    try {
      toast.info("Step 1/2 - Confirming KYC on-chain…");
      await writeContractAsync({
        address:      registryAddr,
        abi:          REPUTATION_ABI,
        functionName: "verifyKYC",
        args: [
          kycTxData.master,
          kycTxData.expiry,
          kycTxData.signature,
          BigInt(kycTxData.nonce),
        ],
      });

      if (scoreUpdateData) {
        toast.info("Step 2/2 - Adding +200 pts to credit score…");
        await writeContractAsync({
          address:      registryAddr,
          abi:          REPUTATION_ABI,
          functionName: "updateCreditScore",
          args: [
            address,
            scoreUpdateData.score,
            scoreUpdateData.signature,
            BigInt(scoreUpdateData.nonce),
          ],
        });
      }

      toast.success("KYC verified on-chain! +200 pts unlocked.");
      setKycTxData(null);
      setScoreUpdateData(null);
      setRequestId(null);
      setKycDone(true);
      setTimeout(refetch, 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? (err as { shortMessage?: string }).shortMessage ?? err.message : "Transaction failed";
      toast.error(msg.length > 120 ? msg.slice(0, 120) + "…" : msg);
    } finally {
      setSubmitting(false);
    }
  };

  // For users who verified KYC but never got score update (old flow)
  const handleClaimScore = async () => {
    if (!address) return;
    const registryAddr = CONTRACTS.reputationRegistry;
    if (!registryAddr) { toast.error("Contract not deployed"); return; }

    setClaimingScore(true);
    try {
      const res = await fetch("/api/reputation/kyc/claim-score", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ walletAddress: address }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed to claim score"); return; }

      const su = data.scoreUpdate as ScoreUpdateData;
      toast.info("Adding +200 pts to your credit score…");
      await writeContractAsync({
        address:      registryAddr,
        abi:          REPUTATION_ABI,
        functionName: "updateCreditScore",
        args: [address, su.score, su.signature, BigInt(su.nonce)],
      });
      toast.success(`Score updated! +200 pts → now ${su.score} pts`);
      setTimeout(refetch, 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? (err as { shortMessage?: string }).shortMessage ?? err.message : "Transaction failed";
      toast.error(msg.length > 120 ? msg.slice(0, 120) + "…" : msg);
    } finally {
      setClaimingScore(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="text-center py-24 space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto text-2xl">🔒</div>
        <p className="text-lg font-semibold">Connect your wallet first.</p>
      </div>
    );
  }

  // KYC verified but score < 200 → old flow, score update was missed
  const scoreClaimNeeded = isKYCVerified && score < 200 && !kycDone;

  return (
    <NetworkGuard>
      <div className="max-w-xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-heading font-bold">QIEPass Identity</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Verify once with QIE Identity. Your DID gates the +200 pts reputation boost.
          </p>
        </div>

        <Card className="glow-card border-border/60">
          <CardContent className="pt-5 pb-5 flex items-center justify-between">
            <span className="text-sm">Verification status</span>
            <Badge
              variant={isKYCVerified ? "default" : "secondary"}
              className={isKYCVerified ? "bg-primary/15 text-primary border-primary/30" : "bg-secondary text-muted-foreground border-border/60"}
            >
              {isKYCVerified ? "✓ Verified" : "Not verified"}
            </Badge>
          </CardContent>
        </Card>

        {/* Unclaimed score banner - KYC done but +200 pts not applied yet */}
        {scoreClaimNeeded && (
          <Card className="border-gold/25 bg-gold/5">
            <CardContent className="pt-4 pb-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-gold/15 border border-gold/25 flex items-center justify-center shrink-0 text-sm">
                  ⚠️
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gold">Your +200 KYC pts weren&apos;t applied</p>
                  <p className="text-xs text-gold mt-0.5">
                    KYC is verified on-chain but the score update transaction was skipped. Claim your points now - one transaction.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                className="w-full bg-gold hover:bg-gold/85 text-gold-foreground font-semibold"
                onClick={handleClaimScore}
                disabled={claimingScore}
              >
                {claimingScore ? "Claiming…" : "Claim +200 pts"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Timeout banner */}
        {timedOut && !kycTxData && (
          <Card className="border-gold/25 bg-gold/5">
            <CardContent className="pt-3 pb-3">
              <div className="flex items-start gap-3">
                <svg className="w-4 h-4 text-gold shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gold">Verification is taking longer than expected</p>
                  <p className="text-xs text-gold mt-0.5">Make sure you approved the credential request in QIEPass, then try again.</p>
                </div>
                <Button size="sm" variant="ghost" className="text-gold hover:text-gold shrink-0"
                  onClick={() => { setTimedOut(false); setRequestId(null); }}>
                  Try Again
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Polling banner */}
        {waitingKyc && !kycTxData && (
          <Card className="border-primary/25 bg-primary/5">
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-primary">Waiting for QIEPass verification…</p>
                  <p className="text-xs text-primary">Complete KYC / approve in QIEPass. This page updates automatically.</p>
                </div>
                <Button size="sm" variant="ghost" className="text-primary hover:text-primary shrink-0"
                  onClick={() => { stopPolling(); setWaitingKyc(false); setRequestId(null); }}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Ready to submit on-chain */}
        {kycTxData && (
          <Card className="border-primary/25 bg-primary/5">
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="text-sm font-medium text-primary">Identity verified - confirm on-chain</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 pb-3 space-y-3">
              <p className="text-xs text-primary">
                QIEPass has verified your identity. Two on-chain transactions will mark KYC verified and add your +200 pts.
              </p>
              <div className="text-xs bg-white/3 border border-primary/20 rounded p-2 text-primary">
                Your wallet will prompt you twice.
              </div>
              <Button size="sm" className="w-full bg-primary hover:bg-primary/85 text-primary-foreground"
                onClick={handleSubmitOnChain} disabled={submitting}>
                {submitting ? "Confirming…" : "Confirm KYC + Claim +200 pts"}
              </Button>
            </CardContent>
          </Card>
        )}

        {isKYCVerified ? (
          <>
            <Card className="glow-card-green border-primary/20">
              <CardContent className="pt-5 pb-5 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Credit score</span>
                  <span className="font-bold">{score} / 1000</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Verified at</span>
                  <span>{profile?.kycVerifiedAt ? new Date(profile.kycVerifiedAt * 1000).toLocaleDateString() : "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Expires</span>
                  <span>{profile?.kycExpiry ? new Date(profile.kycExpiry * 1000).toLocaleDateString() : "-"}</span>
                </div>
                <p className="text-xs text-muted-foreground pt-1">
                  KYC valid for 90 days. Re-verify before expiry to maintain your boost.
                </p>
              </CardContent>
            </Card>
            {(kycDone || score >= 200) && (
              <Card className="border-primary/25 bg-primary/5">
                <CardContent className="pt-4 pb-4">
                  <p className="text-sm font-medium text-primary">KYC done! +200 pts applied.</p>
                  <p className="text-xs text-primary mt-1">Continue building your score with a credit bureau proof.</p>
                  <Link
                    href="/reputation/web2"
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary transition-colors"
                  >
                    Next: Credit Score Verification
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          !kycTxData && !waitingKyc && (
            <>
            {/* Sandbox notice - QIEPass identity isn't on mainnet yet */}
            <Card className="border-gold/30 bg-gold/5">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gold/15 border border-gold/25 flex items-center justify-center shrink-0 text-sm">
                    🧪
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-gold">QIEPass is in sandbox</p>
                    <p className="text-xs text-gold/90 leading-relaxed">
                      Identity verification currently runs on QIEPass <span className="font-medium">testnet</span>.
                      If you&apos;re a new user, complete KYC with a <span className="font-medium">testnet DID</span> -
                      create or use your QIE <span className="font-medium">testnet</span> identity in the QIEPass app.
                      Everything else in YieldPass (staking, lending, scores) is live on <span className="font-medium">mainnet</span>;
                      only this identity step is sandboxed for now.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="glow-card border-border/60">
              <CardHeader>
                <CardTitle className="text-base font-heading">How it works</CardTitle>
                <CardDescription className="text-xs">Privacy-preserving - no PII stored on-chain</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ol className="text-sm space-y-2.5 list-decimal list-inside text-muted-foreground">
                  <li>Click Verify - opens QIEPass identity verification</li>
                  <li>Complete KYC on QIEPass (if first time)</li>
                  <li>Approve the credential share request from YieldPass</li>
                  <li>Return here - confirm with two on-chain transactions</li>
                </ol>
                <button
                  onClick={handleVerify}
                  className="w-full bg-primary text-primary-foreground font-semibold py-2.5 rounded-xl text-sm shadow-lg shadow-primary/30 hover:opacity-90 transition-opacity"
                >
                  Verify with QIEPass
                </button>
              </CardContent>
            </Card>
            </>
          )
        )}
      </div>
    </NetworkGuard>
  );
}
