import { defineChain } from "viem";

/** LiteForge - Litecoin's EVM testnet (Caldera-hosted, chain id 4441). */
export const liteforge = defineChain({
  id: 4441,
  name: "LiteForge",
  nativeCurrency: { name: "zkLTC", symbol: "zkLTC", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_LITEFORGE_RPC_URL ??
          "https://liteforge.rpc.caldera.xyz/http",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://liteforge.explorer.caldera.xyz",
    },
  },
  testnet: true,
});
