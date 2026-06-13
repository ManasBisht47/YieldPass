// Where the 0-1000 credit score actually gets computed (runs server-side only,
// behind the oracle key). Each signal contributes a capped chunk and they add up:
//
//   KYC verified         +200   (also the gate for any boost at all)
//   Credit bureau        +200   (CIBIL / Experian / Credit Karma)
//   DEX child wallets     +250   (on-chain trading history)
//   Telecom proof         +100
//   Utility proof          +75
//   Master wallet age     +100
//   QIE staking history    +75
//   -> 1000 max
//
// If you add a signal, remember to add it to computeScore() AND the breakdown
// array at the bottom, or the UI bar won't match the total.

export interface ScoreComponents {
  kycBase:        number; // 0 or 200
  creditBureau:   number; // 0-200
  telecomProof:   number; // 0-100
  utilityProof:   number; // 0-75
  childWallets:   number; // 0-250
  walletAge:      number; // 0-100
  stakingHistory: number; // 0-75
}

export interface ScoreBreakdown {
  label:  string;
  pts:    number;
  maxPts: number;
  pct:    number; // 0-100 for progress bar
}

export interface ScoreResult {
  total:      number;
  components: ScoreComponents;
  band:       string;
  multiplier: string;
  breakdown:  ScoreBreakdown[];
}

// Multipliers must track ScoreMultiplier.sol - capped at 1.5x, not the old 2.2x.
const SCORE_BANDS = [
  { min: 801, max: 1000, band: "Platinum", multiplier: "1.5×"  },
  { min: 601, max: 800,  band: "Gold",     multiplier: "1.35×" },
  { min: 401, max: 600,  band: "Silver",   multiplier: "1.2×"  },
  { min: 201, max: 400,  band: "Bronze",   multiplier: "1.1×"  },
  { min: 0,   max: 200,  band: "None",     multiplier: "1.0×"  },
] as const;

// ── Credit bureau scoring (0-200) ────────────────────────────────────────────
// bureauScore: raw score from Paisabazar/Experian/Credit Karma
// scoreMax:    900 for India bureaus, 850 for US/Canada/UK
//
// Normalised linear mapping: (score - 300) / (scoreMax - 300) * 200

export function scoreCreditBureau(bureauScore: number, scoreMax: number = 900): number {
  const MIN_SCORE = 300;
  const normalised = Math.max(0, Math.min(1, (bureauScore - MIN_SCORE) / (scoreMax - MIN_SCORE)));
  return Math.round(normalised * 200);
}

// ── Telecom proof scoring (0-100) ─────────────────────────────────────────────

export function scoreTelecomProof(accountAgeDays?: number): number {
  const base     = 80;
  const ageBonus = (accountAgeDays && accountAgeDays > 730) ? 20 : 0;
  return Math.min(100, base + ageBonus);
}

// ── Utility proof scoring (0-75) ──────────────────────────────────────────────

export function scoreUtilityProof(): number {
  return 75;
}

// ── DEX child wallet scoring (0-250) ─────────────────────────────────────────

export interface WalletMetrics {
  volumeUsd:  number;
  tradeCount: number;
  ageDays:    number;
}

export function scoreChildWallets(wallets: WalletMetrics[]): number {
  if (wallets.length === 0) return 0;

  const top3 = [...wallets]
    .sort((a, b) => b.volumeUsd - a.volumeUsd)
    .slice(0, 3);

  let pts = 0;
  for (const w of top3) {
    pts += Math.min(55, Math.floor(w.volumeUsd  / 100_000 * 55));
    pts += Math.min(20, Math.floor(w.tradeCount / 500     * 20));
    pts += Math.min(8,  Math.floor(w.ageDays    / 365     * 8));
  }

  return Math.min(250, pts);
}

// ── Master wallet age scoring (0-100) ────────────────────────────────────────

export function scoreWalletAge(firstTxTimestamp: number): number {
  const ageDays = (Date.now() / 1000 - firstTxTimestamp) / 86400;
  if (ageDays < 30)  return 0;
  if (ageDays > 365) return 100;
  return Math.floor((ageDays - 30) / (365 - 30) * 100);
}

// ── Staking history scoring (0-75) ────────────────────────────────────────────

export function scoreStakingHistory(totalStakedUsd: number, stakeDays: number): number {
  const amountPts   = Math.min(40, Math.floor(totalStakedUsd / 5_000 * 40));
  const durationPts = Math.min(35, Math.floor(stakeDays      / 180   * 35));
  return amountPts + durationPts;
}

// ── Final score assembly ──────────────────────────────────────────────────────

export function computeScore(components: ScoreComponents): ScoreResult {
  const total = Math.min(1000,
    components.kycBase        +
    components.creditBureau   +
    components.telecomProof   +
    components.utilityProof   +
    components.childWallets   +
    components.walletAge      +
    components.stakingHistory
  );

  const band = SCORE_BANDS.find(b => total >= b.min && total <= b.max)
    ?? SCORE_BANDS[SCORE_BANDS.length - 1];

  const breakdown: ScoreBreakdown[] = [
    { label: "KYC Identity",    pts: components.kycBase,        maxPts: 200, pct: (components.kycBase        / 200) * 100 },
    { label: "Credit Bureau",  pts: components.creditBureau,   maxPts: 200, pct: (components.creditBureau   / 200) * 100 },
    { label: "DEX Wallets",     pts: components.childWallets,   maxPts: 250, pct: (components.childWallets   / 250) * 100 },
    { label: "Telecom Proof",   pts: components.telecomProof,   maxPts: 100, pct: (components.telecomProof   / 100) * 100 },
    { label: "Utility Proof",   pts: components.utilityProof,   maxPts: 75,  pct: (components.utilityProof   / 75)  * 100 },
    { label: "Wallet Age",      pts: components.walletAge,      maxPts: 100, pct: (components.walletAge      / 100) * 100 },
    { label: "Staking History", pts: components.stakingHistory, maxPts: 75,  pct: (components.stakingHistory / 75)  * 100 },
  ];

  return { total, components, band: band.band, multiplier: band.multiplier, breakdown };
}
