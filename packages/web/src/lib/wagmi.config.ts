"use client";

import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { qieTestnet, qieMainnet } from "./qie-chain";

const wcProjectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID;

export const wagmiConfig = createConfig({
  chains: [qieTestnet, qieMainnet],
  connectors: [
    injected(),
    // WalletConnect: QR on desktop, deep links to any wallet on mobile.
    // Only added when a project id is configured, so the build is fine without one.
    ...(wcProjectId
      ? [walletConnect({
          projectId: wcProjectId,
          showQrModal: true,
          metadata: {
            name: "YieldPass",
            description: "Reputation-based yield on QIE",
            url: "https://yield-pass-web.vercel.app",
            icons: ["https://yield-pass-web.vercel.app/logo-mark.svg"],
          },
        })]
      : []),
  ],
  transports: {
    [qieTestnet.id]: http("https://rpc1testnet.qie.digital/"),
    [qieMainnet.id]: http("https://rpc1mainnet.qie.digital/"),
  },
});
