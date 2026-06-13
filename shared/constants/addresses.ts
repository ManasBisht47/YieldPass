export const CONTRACT_ADDRESSES = {
  "qie-testnet": {
    chainId: 1983,
    qusdc:              "" as `0x${string}`,  // MockQUSDC — filled after testnet deploy
    nullifierRegistry:  "" as `0x${string}`,
    reputationRegistry: "" as `0x${string}`,
    insuranceFund:      "" as `0x${string}`,
    yieldStrategy:      "" as `0x${string}`,
    yieldVault:         "" as `0x${string}`,
  },
  "qie-mainnet": {
    chainId: 1990,
    qusdc:              "0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5" as `0x${string}`,
    nullifierRegistry:  "" as `0x${string}`,  // filled after mainnet deploy
    reputationRegistry: "" as `0x${string}`,
    insuranceFund:      "" as `0x${string}`,
    yieldStrategy:      "" as `0x${string}`,
    yieldVault:         "" as `0x${string}`,
  },
} as const;

export type SupportedNetwork = keyof typeof CONTRACT_ADDRESSES;
