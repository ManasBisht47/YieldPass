export enum LockTier {
  FLEXIBLE = 0,
  SILVER   = 1,
  GOLD     = 2,
  DIAMOND  = 3,
}

export interface StakePosition {
  principal:        bigint;
  pendingYield:     bigint;
  lastHarvestTime:  bigint;
  lockExpiry:       bigint;
  lockTier:         LockTier;
  reputationOptIn:  boolean;
}

export interface APYBreakdown {
  baseApyBps:       number;
  lockBonusBps:     number;
  scoreMultiplierBps: number;
  effectiveApyBps:  number;
  boostedPrincipal: bigint;
  normalPrincipal:  bigint;
}
