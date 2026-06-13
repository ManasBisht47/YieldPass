import { qieMainnet } from "./qie-chain";

// Active network — LIVE ON MAINNET
export const ACTIVE_CHAIN = qieMainnet;

// Contract addresses — set NEXT_PUBLIC_* env vars after deployment
export const CONTRACTS = {
  qusdc:              (process.env.NEXT_PUBLIC_QUSDC_ADDRESS              ?? "") as `0x${string}`,
  nullifierRegistry:  (process.env.NEXT_PUBLIC_NULLIFIER_REGISTRY_ADDRESS  ?? "") as `0x${string}`,
  reputationRegistry: (process.env.NEXT_PUBLIC_REPUTATION_REGISTRY_ADDRESS ?? "") as `0x${string}`,
  insuranceFund:      (process.env.NEXT_PUBLIC_INSURANCE_FUND_ADDRESS       ?? "") as `0x${string}`,
  yieldStrategy:      (process.env.NEXT_PUBLIC_YIELD_STRATEGY_ADDRESS       ?? "") as `0x${string}`,
  yieldVault:         (process.env.NEXT_PUBLIC_YIELD_VAULT_ADDRESS           ?? "") as `0x${string}`,
  lendingPool:        (process.env.NEXT_PUBLIC_LENDING_POOL_ADDRESS          ?? "") as `0x${string}`,
  priceOracle:        (process.env.NEXT_PUBLIC_PRICE_ORACLE_ADDRESS          ?? "") as `0x${string}`,
  weth:               (process.env.NEXT_PUBLIC_WETH_ADDRESS                  ?? "") as `0x${string}`,
  interestRateModel:  (process.env.NEXT_PUBLIC_INTEREST_RATE_MODEL_ADDRESS   ?? "") as `0x${string}`,
};

// Anti-whale caps — staking is in native QIE (18 decimals)
export const STANDARD_BOOSTED_CAP_QIE = 50_000;
export const WHALE_BOOSTED_CAP_QIE    = 75_000;
export const WHALE_THRESHOLD_QIE      = 5_000_000;

// QIE testnet faucet — for users with no QIE
export const QIE_FAUCET_URL = "https://www.qie.digital/faucet";

// Lock tiers. bonusBps is a bump to your *share weight*, not a flat APY add —
// it mirrors the contract's *_SHARE_BONUS constants (5/10/15%), so a Diamond
// lock means you hold 15% more of the pool than an unlocked staker with the
// same principal. penaltyBps is the early-exit fee. Both match YieldVault.sol.
export const LOCK_TIERS = {
  FLEXIBLE: { days: 0,   bonusBps: 0,    penaltyBps: 0,   label: "Flexible"     },
  SILVER:   { days: 30,  bonusBps: 500,  penaltyBps: 100, label: "Silver (30d)" },
  GOLD:     { days: 90,  bonusBps: 1000, penaltyBps: 200, label: "Gold (90d)"   },
  DIAMOND:  { days: 180, bonusBps: 1500, penaltyBps: 300, label: "Diamond (180d)"},
} as const;

// Credit score → multiplier (bps)
export const SCORE_BANDS = [
  { min: 0,   max: 200,  multiplierBps: 10_000, label: "No boost"   },
  { min: 201, max: 400,  multiplierBps: 11_000, label: "Bronze"     },
  { min: 401, max: 600,  multiplierBps: 12_000, label: "Silver"     },
  { min: 601, max: 800,  multiplierBps: 13_500, label: "Gold"       },
  { min: 801, max: 1000, multiplierBps: 15_000, label: "Platinum"   },
] as const;
