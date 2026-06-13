"use client";

import { createConfig, http } from "wagmi";
import { injected, metaMask } from "wagmi/connectors";
import { qieTestnet, qieMainnet } from "./qie-chain";

export const wagmiConfig = createConfig({
  chains: [qieTestnet, qieMainnet],
  connectors: [
    injected(),
    metaMask(),
  ],
  transports: {
    [qieTestnet.id]: http("https://rpc1testnet.qie.digital/"),
    [qieMainnet.id]: http("https://rpc1mainnet.qie.digital/"),
  },
});
