import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { liteforge } from "./chains";

export const config = createConfig({
  chains: [liteforge],
  // `injected()` is the always-available fallback; EIP-6963 discovery (on by
  // default) adds each installed wallet (Rabby, MetaMask, Coinbase…) as its own
  // connector so the user can pick the exact one.
  connectors: [injected({ shimDisconnect: true })],
  multiInjectedProviderDiscovery: true,
  transports: {
    [liteforge.id]: http(),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
