export interface ReputationProfile {
  creditScore:      number;
  scoreUpdatedAt:   number;
  kycVerifiedAt:    number;
  kycExpiry:        number;
  kycVerified:      boolean;
  childWalletCount: number;
}

export interface ChildWalletLinkStatus {
  address:   string;
  isLocked:  boolean;
  lockedTo?: string;
}

export type ZKProofType =
  | "TELECOM"
  // India - credit bureaus
  | "CREDIT_CIBIL_PAISABAZAR"
  | "CREDIT_EXPERIAN_IN"
  // USA - credit bureaus
  | "CREDIT_EXPERIAN_US"
  // USA + Canada + UK - Credit Karma (TransUnion)
  | "CREDIT_KARMA";

export const CREDIT_PROOF_TYPES = new Set<ZKProofType>([
  "CREDIT_CIBIL_PAISABAZAR",
  "CREDIT_EXPERIAN_IN",
  "CREDIT_EXPERIAN_US",
  "CREDIT_KARMA",
]);

export interface ZKProofSubmission {
  proofType:  ZKProofType;
  proofHash:  `0x${string}`;
  verified:   boolean;
  verifiedAt: number;
}

// ── Regions ───────────────────────────────────────────────────────────────────

export type CreditRegion = "india" | "usa" | "canada" | "uk" | "other";

export const CREDIT_REGIONS: {
  key:       CreditRegion;
  label:     string;
  supported: boolean;
}[] = [
  { key: "india",  label: "India 🇮🇳",         supported: true  },
  { key: "usa",    label: "United States 🇺🇸",  supported: true  },
  { key: "canada", label: "Canada 🇨🇦",         supported: true  },
  { key: "uk",     label: "United Kingdom 🇬🇧", supported: true  },
  { key: "other",  label: "Other",              supported: false },
];

export const CREDIT_PROVIDERS_BY_REGION: Record<CreditRegion, ZKProofType[]> = {
  india:  ["CREDIT_CIBIL_PAISABAZAR", "CREDIT_EXPERIAN_IN"],
  usa:    ["CREDIT_EXPERIAN_US", "CREDIT_KARMA"],
  canada: ["CREDIT_KARMA"],
  uk:     ["CREDIT_KARMA"],
  other:  [],
};

// ── Proof display metadata ────────────────────────────────────────────────────

export interface ProofTypeInfo {
  type:     ZKProofType;
  label:    string;
  desc:     string;
  maxPts:   number;
  category: "credit" | "web2";
  flag?:    string;
}

export const PROOF_TYPE_INFO: ProofTypeInfo[] = [
  // ── Web2 fallback ─────────────────────────────────────────────────────────
  {
    type:     "TELECOM",
    label:    "Telecom Account",
    desc:     "Prove mobile account age and payment history",
    maxPts:   100,
    category: "web2",
  },

  // ── India ─────────────────────────────────────────────────────────────────
  {
    type:     "CREDIT_CIBIL_PAISABAZAR",
    label:    "Paisabazar CIBIL",
    desc:     "CIBIL score via Paisabazar (Experian + Equifax bureaus)",
    maxPts:   200,
    category: "credit",
    flag:     "🇮🇳",
  },
  {
    type:     "CREDIT_EXPERIAN_IN",
    label:    "Experian India",
    desc:     "Credit score via Experian India (consumer.experian.in)",
    maxPts:   200,
    category: "credit",
    flag:     "🇮🇳",
  },

  // ── USA ───────────────────────────────────────────────────────────────────
  {
    type:     "CREDIT_EXPERIAN_US",
    label:    "Experian USA",
    desc:     "Credit score via Experian USA (usa.experian.com)",
    maxPts:   200,
    category: "credit",
    flag:     "🇺🇸",
  },

  // ── USA + Canada + UK ─────────────────────────────────────────────────────
  {
    type:     "CREDIT_KARMA",
    label:    "Credit Karma",
    desc:     "TransUnion score via Credit Karma (US, Canada, UK)",
    maxPts:   200,
    category: "credit",
    flag:     "🌐",
  },
];
