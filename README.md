# ForgeMind 🔥

**An AI guardian for your zkLTC stack - on LiteForge.**

ForgeMind is an AI-powered smart vault for **zkLTC** on [LiteForge](https://www.litvm.com/) (Litecoin's EVM testnet, chain `4441`). Deposit zkLTC, then **chat with an on-chain agent that executes real transactions** - switch between safe **Stack** mode and yield-bearing **Grow** mode, set a **Litecoin-halving goal**, and watch your projected stack.

Built for the **LiteForge Hackathon - AI Agents & Agentic Apps track**.

> **▶ Try it in 30s - no wallet:** open the deployed app and append **`?demo=1`** (or hit **Explore live demo** on the landing page) to walk the full dashboard, chat with the Guardian, and inspect the on-chain **Decisions** ledger - all on clearly-labelled sample data. A guided judge walkthrough lives in **[DEMO.md](DEMO.md)**.

> Most "AI agent" entries are chatbots that only talk. ForgeMind's agent reads live on-chain state, **shows its reasoning step-by-step**, **prepares real transactions you sign in your wallet**, and **writes every decision on-chain** - deposit, withdraw, switch mode, set goal, claim yield.

---

## What makes it agentic (not a toy chatbot)

- **Reads on-chain state** via a single `getVaultState` view, then reasons over it.
- **Shows its work**: every reply exposes a collapsible **reasoning trace** - the exact tools the agent called (read state → compute projection → prepare tx), so the multi-step loop is visible, not hidden.
- **Speaks first**: on connect, the Guardian proactively reads your vault and opens with a personalized, on-pace/behind insight - it doesn't wait to be prompted.
- **Takes real actions**: the agent calls `propose*` tools that return prepared transactions; you confirm in your wallet (the agent never holds your keys).
- **Notarizes decisions on-chain**: each action is recorded in **`ForgeActionLog`** with the engine that decided it (Claude vs. rule-based) and a reason - a verifiable "why", paired with the vault's record of "what". See the **Decisions** tab.
- **Multi-step tool use** (Vercel AI SDK + Claude Haiku 4.5) - e.g. _"am I on pace?"_ → reads state → computes projection → recommends switching to Grow → prepares the `setMode` tx.
- **Autonomous Auto-Pilot**: opt-in compound/DCA rules act on a timer (you still sign), each one notarized on-chain.
- **Deterministic fallback**: with no model key set, a rule-based engine drives the exact same tools, so the demo never breaks.

> **The only true agentic app in its track.** Competing "AI" entries are data/MCP servers or pure DeFi protocols; ForgeMind is the one that actually *reads, reasons, acts, and records* on LitVM - and it's wired to the **hard-money** thesis: stacking sound money toward the Litecoin halving.

## Two modes

| Mode | What happens on-chain |
|------|------------------------|
| **Stack** | zkLTC held safely in the vault, fully custodied 1:1. |
| **Grow** | zkLTC routed to a pluggable yield strategy earning a **simulated 5% APY**. Switching modes **moves funds on-chain**. |

### Real vs. simulated (we're explicit)
- **Real:** deposits, withdrawals, mode switching, goal setting, and yield payout are all real on-chain transactions on chain `4441`, verifiable on the explorer.
- **Simulated:** the 5% APY in Grow mode is paid from a pre-funded **testnet reward pool** - it is not real protocol revenue. Principal is always custodied 1:1 and fully returnable. (This mirrors how the LiteForge ecosystem itself advertises simulated testnet yield.) The `IYieldStrategy` interface lets a real protocol (e.g. LitStake liquid staking) drop in on mainnet without changing the vault.

---

## Architecture

```
forgemind/
├── contracts/                 # Foundry (Solidity 0.8.24) - 54 passing tests
│   ├── src/ForgeVault.sol            # native-zkLTC vault: deposit/withdraw(All), modes, halving goal, projection
│   ├── src/MockYieldStrategy.sol     # simulated-yield backend (reward pool, linear APR, pro-rata payout)
│   ├── src/ForgeProfile.sol          # missions → XP → levels, usernames, leaderboard registry
│   ├── src/ForgeActionLog.sol        # on-chain agent-decision ledger (engine + reason per action)
│   ├── src/interfaces/IYieldStrategy.sol
│   ├── test/*.t.sol                  # core + adversarial/edge + aggregates + profile + action-log
│   └── script/Deploy.s.sol           # deploys + wires + seeds reward pool
└── web/                       # Next.js 16 (App Router) + TypeScript
    ├── app/api/agent/route.ts        # the AI agent: tools + Claude + rule-based fallback + reasoning trace
    ├── components/                   # Dashboard, VaultPanel, AgentChat, AgentDecisions, AutoPilot, Missions…
    ├── hooks/                        # useVault, useActionLog, useAutoPilot, useMissions, useLeaderboard
    └── lib/                          # chain (4441), abi, halving math, insight, action-log enums, formatters
```

**Stack:** Solidity + Foundry · Next.js 16 / React 19 / TypeScript · Tailwind CSS · wagmi + viem · Vercel AI SDK + Anthropic (Claude Haiku 4.5).

### Contracts
| Contract | Role |
|---|---|
| `ForgeVault` | Custody, Stack/Grow modes, halving goal, projection, TVL + user registry. `withdrawAll()` exits principal + yield in one tx; `setStrategy` is guarded so a swap can't orphan Grow funds. |
| `MockYieldStrategy` | Simulated 5% APY from a pre-funded reward pool; partial withdrawals pay a **pro-rata** share of accrued yield. |
| `ForgeProfile` | On-chain missions, XP/levels, usernames, leaderboard registry. |
| `ForgeActionLog` | Tamper-evident ledger of agent decisions (Kind + Engine + reason). **Deployed via [Dappit](https://dappit.io)**, the hackathon's autonomous-deploy partner. |

---

## Run locally

### 1. Contracts (Foundry)
```bash
cd contracts
forge test                      # 54 tests passing
cp .env.example .env            # add your funded testnet PRIVATE_KEY
forge script script/Deploy.s.sol:Deploy --rpc-url liteforge --broadcast
# note the printed ForgeVault / MockYieldStrategy / ForgeProfile / ForgeActionLog addresses
```
Get testnet zkLTC from the faucet: **https://liteforge.hub.caldera.xyz**

> **Deploying via Dappit:** `ForgeActionLog.sol` is a single self-contained file - paste it into
> [Dappit](https://dappit.io) (the hackathon's autonomous-deploy partner), target LiteForge (chain 4441),
> and deploy. Set the resulting address as `NEXT_PUBLIC_ACTIONLOG_ADDRESS` to light up the **Decisions** tab.

### 2. Frontend (Next.js)
```bash
cd web
cp .env.example .env.local
#   NEXT_PUBLIC_VAULT_ADDRESS=<deployed ForgeVault>
#   NEXT_PUBLIC_STRATEGY_ADDRESS=<deployed MockYieldStrategy>
#   NEXT_PUBLIC_PROFILE_ADDRESS=<deployed ForgeProfile>
#   NEXT_PUBLIC_ACTIONLOG_ADDRESS=<deployed ForgeActionLog>   (enables the on-chain Decisions feed)
#   ANTHROPIC_API_KEY=...   (optional - enables the live Claude agent; omit to use the rule-based fallback)
npm install
npm run dev                     # http://localhost:3000
```

> Note: this repo pins **Tailwind v3** and builds with **`next build --webpack`** for portability across machines that lack native Turbopack / lightningcss bindings. On Vercel, native bindings are available - deployment works out of the box.

### 3. Deploy the frontend (Vercel)
```bash
cd web && vercel        # set the same env vars in the Vercel dashboard
```

---

## Network
| | |
|---|---|
| Chain | LiteForge (LitVM) · `4441` |
| Gas token | zkLTC |
| RPC | https://liteforge.rpc.caldera.xyz/http |
| Explorer | https://liteforge.explorer.caldera.xyz |
| Faucet | https://liteforge.hub.caldera.xyz |
