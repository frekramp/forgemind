import type { NextConfig } from "next";

// wagmi v3's `wagmi/connectors` barrel statically re-exports every connector
// (porto, tempo, coinbase, metamask, safe, walletconnect, base…), each with
// optional peer deps we don't install. We only use the `injected` connector,
// so we alias those unused modules to `false` (empty) — webpack then resolves
// them cleanly instead of emitting "module not found" warnings.
const UNUSED_CONNECTOR_DEPS = [
  "porto",
  "porto/internal",
  "tempo",
  "accounts",
  "@base-org/account",
  "@coinbase/wallet-sdk",
  "@metamask/connect-evm",
  "@metamask/sdk",
  "@safe-global/safe-apps-sdk",
  "@safe-global/safe-apps-provider",
  "@walletconnect/ethereum-provider",
  "@walletconnect/modal",
];

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      ...Object.fromEntries(UNUSED_CONNECTOR_DEPS.map((p) => [p, false])),
    };
    return config;
  },
};

export default nextConfig;
