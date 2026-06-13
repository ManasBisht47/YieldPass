"use client";

import { useState, useEffect } from "react";
import { useAccount, useSignTypedData, useWriteContract, useChainId, useReadContract } from "wagmi";
import { isAddress } from "viem";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { NetworkGuard } from "@/components/layout/NetworkGuard";
import { KYCGate } from "@/components/layout/KYCGate";
import { useCreditScore } from "@/hooks/useCreditScore";
import { useWalletLockStatus } from "@/hooks/useWalletLockStatus";
import { reputationRegistryContract } from "@/lib/contracts";

// ── Types ─────────────────────────────────────────────────────────────────────

type Step =
  | { id: "idle" }
  | { id: "checking" }
  | { id: "nonce_ready";   nonce: string; eip712: Eip712Payload }
  | { id: "master_signed"; nonce: string; eip712: Eip712Payload; masterSig: `0x${string}` }
  | { id: "child_signed";  nonce: string; masterSig: `0x${string}`; childSig: `0x${string}` }
  | { id: "submitting" }
  | { id: "done" };

interface Eip712Payload {
  domain:      Record<string, unknown>;
  types:       Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message:     Record<string, unknown>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function WalletsPage() {
  const { address, isConnected } = useAccount();
  const chainId                  = useChainId();
  const { profile, refetch }     = useCreditScore();

  const [childInput, setChildInput] = useState("");
  const [step, setStep]             = useState<Step>({ id: "idle" });

  const { isLocked, maskedMaster, isLoading: lockLoading } = useWalletLockStatus(childInput);

  const { data: linkedWalletsRaw, refetch: refetchLinked } = useReadContract({
    ...reputationRegistryContract,
    functionName: "getChildWallets",
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: !!address },
  });
  const linkedWallets = (linkedWalletsRaw as `0x${string}`[] | undefined) ?? [];

  // Wagmi hooks
  const { signTypedDataAsync }        = useSignTypedData();
  const { writeContractAsync, isPending: txPending } = useWriteContract();

  // When wallet switches to child address during child-signing step, auto-trigger
  useEffect(() => {
    if (
      step.id === "master_signed" &&
      address?.toLowerCase() === childInput.toLowerCase()
    ) {
      handleChildSign(step);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, step.id]);

  // ── Step 1: Generate nonce ────────────────────────────────────────────────

  const handlePrepare = async () => {
    if (!isAddress(childInput)) { toast.error("Invalid wallet address"); return; }
    if (isLocked)               { toast.error("Wallet already linked"); return; }
    if (!address)               { toast.error("Connect your wallet"); return; }

    setStep({ id: "checking" });
    try {
      const res  = await fetch("/api/reputation/child-wallet/check", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ masterAddress: address, childAddress: childInput }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Check failed");
        setStep({ id: "idle" });
        return;
      }

      setStep({ id: "nonce_ready", nonce: data.nonce, eip712: data.eip712 });
    } catch {
      toast.error("Network error");
      setStep({ id: "idle" });
    }
  };

  // ── Step 2: Master wallet signs ────────────────────────────────────────────

  const handleMasterSign = async (s: Extract<Step, { id: "nonce_ready" }>) => {
    try {
      toast.info("Sign the EIP-712 message in your wallet…");
      const sig = await signTypedDataAsync({
        domain:      s.eip712.domain as Parameters<typeof signTypedDataAsync>[0]["domain"],
        types:       s.eip712.types  as Parameters<typeof signTypedDataAsync>[0]["types"],
        primaryType: s.eip712.primaryType as string,
        message:     s.eip712.message,
      });
      toast.success("Master wallet signed. Now sign with child wallet.");
      setStep({ id: "master_signed", nonce: s.nonce, eip712: s.eip712, masterSig: sig });
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes("rejected")) {
        toast.error("Signature rejected");
      } else {
        toast.error("Signing failed");
      }
      setStep({ id: "idle" });
    }
  };

  // ── Step 3: Child wallet signs ─────────────────────────────────────────────

  const handleChildSign = async (s: Extract<Step, { id: "master_signed" }>) => {
    if (address?.toLowerCase() !== childInput.toLowerCase()) {
      toast.error(`Switch MetaMask to the child wallet (${childInput.slice(0, 6)}••••${childInput.slice(-4)}) first`);
      return;
    }
    try {
      toast.info("Sign the EIP-712 message with your child wallet…");
      const sig = await signTypedDataAsync({
        domain:      s.eip712.domain as Parameters<typeof signTypedDataAsync>[0]["domain"],
        types:       s.eip712.types  as Parameters<typeof signTypedDataAsync>[0]["types"],
        primaryType: s.eip712.primaryType as string,
        message:     s.eip712.message,
      });
      toast.success("Child wallet signed. Ready to submit.");
      setStep({ id: "child_signed", nonce: s.nonce, masterSig: s.masterSig, childSig: sig });
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes("rejected")) {
        toast.error("Signature rejected");
      } else {
        toast.error("Child signing failed");
      }
    }
  };

  // ── Step 4: Submit on-chain ────────────────────────────────────────────────

  const handleSubmit = async (s: Extract<Step, { id: "child_signed" }>) => {
    setStep({ id: "submitting" });
    try {
      // Server validates both sigs before we broadcast
      const check = await fetch("/api/reputation/child-wallet/link", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          masterAddress: address,
          childAddress:  childInput,
          nonce:         s.nonce,
          masterSig:     s.masterSig,
          childSig:      s.childSig,
        }),
      });
      const checkData = await check.json();
      if (!check.ok) {
        toast.error(checkData.error ?? "Validation failed");
        setStep({ id: "idle" });
        return;
      }

      // Call linkChildWallet from master wallet
      await writeContractAsync({
        ...reputationRegistryContract,
        functionName: "linkChildWallet",
        args: [
          childInput   as `0x${string}`,
          s.masterSig,
          s.childSig,
          BigInt(s.nonce),
        ],
      });

      toast.success("Child wallet linked successfully!");
      setStep({ id: "done" });
      setChildInput("");
      refetch();
      refetchLinked();
    } catch (e: unknown) {
      const msg = e instanceof Error ? (e as unknown as { shortMessage?: string }).shortMessage ?? e.message : "Transaction failed";
      toast.error(msg);
      setStep({ id: "idle" });
    }
  };

  // ── Reset ──────────────────────────────────────────────────────────────────

  const reset = () => { setStep({ id: "idle" }); setChildInput(""); };

  if (!isConnected) {
    return <div className="text-center py-24"><p>Connect your wallet to link DEX wallets.</p></div>;
  }

  const currentStepId = step.id;

  const FLOW_STEPS = [
    { id: "nonce_ready",   label: "Sign (Master)"  },
    { id: "master_signed", label: "Sign (Child)"   },
    { id: "child_signed",  label: "Submit"         },
    { id: "done",          label: "Done"           },
  ] as const;

  const activeFlowIndex = FLOW_STEPS.findIndex(s => s.id === currentStepId);
  const inFlow = activeFlowIndex >= 0;

  return (
    <NetworkGuard>
    <KYCGate>
      <div className="max-w-xl mx-auto space-y-6">

        <div>
          <h1 className="text-2xl font-bold">Link DEX Wallets</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Linked wallets contribute their on-chain trading history to your credit score.
          </p>
        </div>

        {/* Step progress bar — shown only during active flow */}
        {inFlow && (
          <div className="flex items-center gap-1">
            {FLOW_STEPS.map((s, i) => {
              const done    = i < activeFlowIndex;
              const active  = i === activeFlowIndex;
              return (
                <div key={s.id} className="flex-1 flex flex-col items-center gap-1">
                  <div className={`h-1 w-full rounded-full transition-colors ${
                    done ? "bg-primary" : active ? "bg-primary" : "bg-muted/40"
                  }`} />
                  <span className={`text-[10px] font-medium transition-colors ${
                    done ? "text-primary" : active ? "text-primary" : "text-muted-foreground/50"
                  }`}>
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Linked count */}
        <Card>
          <CardContent className="pt-4 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Wallets linked</span>
            <Badge variant="outline">{profile?.childWalletCount ?? 0} / 10</Badge>
          </CardContent>
        </Card>

        {/* Linked wallets list */}
        {linkedWallets.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Linked Wallets</CardTitle>
              <CardDescription className="text-xs">
                Top 3 by DEX volume count toward your score. Max +250 pts total.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {linkedWallets.map((wallet, i) => (
                <div
                  key={wallet}
                  className="flex items-center justify-between rounded-lg border border-border/50 bg-background/40 px-3 py-2.5"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center text-[10px] font-semibold text-primary">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-xs font-mono text-white/80">
                        {wallet.slice(0, 8)}••••{wallet.slice(-6)}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        No QIE DEX activity detected
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-gold/80">0 pts</p>
                    <p className="text-[10px] text-muted-foreground">of 83 max</p>
                  </div>
                </div>
              ))}

              <p className="text-[10px] text-muted-foreground pt-1">
                Points are calculated from on-chain DEX volume, trade count, and wallet age on QIE network. Score updates as trading history accumulates.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Step 1 — Enter child address */}
        {(currentStepId === "idle" || currentStepId === "checking") && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Link a Child Wallet</CardTitle>
              <CardDescription className="text-xs">
                Both wallets must sign the same message. Once linked, the child wallet
                is permanently locked and cannot boost any other account.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Child Wallet Address</Label>
                <Input
                  placeholder="0x..."
                  value={childInput}
                  onChange={e => setChildInput(e.target.value)}
                  disabled={currentStepId === "checking"}
                />

                {/* Real-time lock check */}
                {isAddress(childInput) && !lockLoading && (
                  <div className={`text-xs rounded p-2 ${
                    isLocked
                      ? "bg-red-50 border border-red-200 text-red-700"
                      : "bg-green-50 border border-green-200 text-green-700"
                  }`}>
                    {isLocked
                      ? `⚠️ Already linked to ${maskedMaster}. Cannot be reused.`
                      : "✓ This wallet is available to link."
                    }
                  </div>
                )}
              </div>

              <Button
                className="w-full"
                onClick={handlePrepare}
                disabled={
                  currentStepId === "checking" ||
                  isLocked ||
                  !isAddress(childInput) ||
                  childInput.toLowerCase() === address?.toLowerCase()
                }
              >
                {currentStepId === "checking" ? "Checking…" : "Prepare Link"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 2 — Sign with master wallet */}
        {currentStepId === "nonce_ready" && (
          <StepCard
            stepNum={1}
            title="Sign with master wallet"
            desc={`Connected wallet: ${address?.slice(0, 6)}••••${address?.slice(-4)}`}
          >
            <Button className="w-full" onClick={() => handleMasterSign(step as Extract<Step, { id: "nonce_ready" }>)}>
              Sign with Master Wallet
            </Button>
            <Button variant="ghost" size="sm" className="w-full mt-2" onClick={reset}>Cancel</Button>
          </StepCard>
        )}

        {/* Step 3 — Switch to child wallet and sign */}
        {currentStepId === "master_signed" && (() => {
          const onChild = address?.toLowerCase() === childInput.toLowerCase();
          return (
            <StepCard
              stepNum={2}
              title="Sign with child wallet"
              desc={`Required: ${childInput.slice(0, 6)}••••${childInput.slice(-4)}`}
            >
              {onChild ? (
                <div className="text-xs border border-primary/25 bg-primary/5 rounded p-2 text-primary space-y-1">
                  <p className="font-medium">Child wallet detected</p>
                  <p>MetaMask is now on the child wallet. Click below to sign.</p>
                </div>
              ) : (
                <div className="text-xs border border-primary/25 bg-primary/5 rounded p-2 text-primary space-y-1">
                  <p className="font-medium">Switch your MetaMask account</p>
                  <p>
                    Currently on{" "}
                    <span className="font-mono text-white/70">{address?.slice(0, 6)}••••{address?.slice(-4)}</span>
                    {" "}— switch to{" "}
                    <span className="font-mono text-white/70">{childInput.slice(0, 6)}••••{childInput.slice(-4)}</span>.
                    We&apos;ll auto-detect when you&apos;re ready.
                  </p>
                </div>
              )}

              <Button
                className="w-full mt-3"
                disabled={!onChild}
                onClick={() => handleChildSign(step as Extract<Step, { id: "master_signed" }>)}
              >
                {onChild
                  ? `Sign with Child Wallet (${address?.slice(0, 6)}••••${address?.slice(-4)})`
                  : "Waiting for wallet switch…"
                }
              </Button>
              <Button variant="ghost" size="sm" className="w-full mt-2" onClick={reset}>Cancel</Button>
            </StepCard>
          );
        })()}

        {/* Step 4 — Submit transaction */}
        {(currentStepId === "child_signed" || currentStepId === "submitting") && (() => {
          const onMaster = address?.toLowerCase() !== childInput.toLowerCase();
          return (
            <StepCard
              stepNum={3}
              title="Submit on-chain"
              desc="Switch back to your master wallet to submit."
            >
              {onMaster ? (
                <div className="text-xs border border-primary/25 bg-primary/5 rounded p-2 text-primary">
                  Both signatures collected. Ready to submit.
                </div>
              ) : (
                <div className="text-xs border border-gold/25 bg-gold/5 rounded p-2 text-gold">
                  Switch MetaMask back to your master wallet to send the transaction.
                </div>
              )}
              <Button
                className="w-full mt-3"
                onClick={() => handleSubmit(step as Extract<Step, { id: "child_signed" }>)}
                disabled={currentStepId === "submitting" || txPending || !onMaster}
              >
                {(currentStepId === "submitting" || txPending) ? "Submitting…" : onMaster ? "Link Wallet" : "Waiting for master wallet…"}
              </Button>
              <Button variant="ghost" size="sm" className="w-full mt-2" onClick={reset}>Cancel</Button>
            </StepCard>
          );
        })()}

        {/* Done */}
        {currentStepId === "done" && (
          <Card className="border-primary/25 bg-primary/5">
            <CardContent className="pt-6 space-y-3">
              <p className="font-semibold text-primary">Wallet linked successfully!</p>
              <div className="flex items-center justify-between text-xs border border-border/40 rounded p-2">
                <span className="text-muted-foreground">Points earned now</span>
                <span className="font-mono font-semibold text-gold">+0 pts</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Score from DEX wallets is calculated from on-chain trading history — volume, trade count, and wallet age on QIE network. A freshly linked wallet with no QIE DEX activity starts at 0 pts and earns up to <span className="text-white/60">+250 pts</span> as history accumulates.
              </p>
              <Button size="sm" className="w-full" onClick={() => setStep({ id: "idle" })}>Link another wallet</Button>
            </CardContent>
          </Card>
        )}

        {/* Info */}
        <Card>
          <CardContent className="pt-4 text-xs text-muted-foreground space-y-1">
            <p>• Points are earned from DEX trading history — volume, trade count, and wallet age on QIE.</p>
            <p>• Top 3 wallets by volume are counted (max 10 linked). Max potential: <span className="text-white/50">+250 pts</span>.</p>
            <p>• Linking is irreversible — the child wallet is permanently locked globally.</p>
          </CardContent>
        </Card>

      </div>
    </KYCGate>
    </NetworkGuard>
  );
}

function StepCard({
  stepNum,
  title,
  desc,
  children,
}: {
  stepNum: number;
  title:   string;
  desc:    string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
            {stepNum}
          </span>
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
        <CardDescription className="text-xs">{desc}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
