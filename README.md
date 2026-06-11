# ForgeMind 🔥

**An agentic AI vault for zkLTC, on LiteForge.**

🔗 **Live:** https://forgemindapp.xyz
▶️ **Demo (no wallet):** https://forgemindapp.xyz/?demo=1

ForgeMind is an AI smart vault for **zkLTC** on [LiteForge](https://www.litvm.com/), Litecoin's EVM testnet (chain `4441`). You deposit zkLTC and chat with an on-chain agent, the **Forge Guardian**, that actually acts: it moves between safe **Stack** and yield-bearing **Grow** modes, tracks a Litecoin-halving goal, and records every move on-chain.

> Built for the **LiteForge Hackathon**, AI Agents & Agentic Apps track.

---

## Why it's different

Most "AI agent" entries are chatbots that only talk. ForgeMind's agent runs the full loop:

> **Reads** your on-chain vault → **Reasons** step by step (and shows its work) → **Acts** through transactions you sign → **Records** every decision on-chain.

You stay in control the whole way. The agent never holds your keys.

## What it does

- **Reads and reasons** over live on-chain state, and shows the exact steps it took (no black box).
- **Acts by preparing real transactions you sign:** deposit, withdraw, switch mode, set goal, claim yield. Fully non-custodial.
- **Notarizes every decision on-chain** in `ForgeActionLog`, with the reason and a signature anyone can verify.
- **Runs autonomously** if you want it to: Auto-Pilot (timer rules you confirm) or an on-chain keeper that compounds and rebalances 24/7, capped and revocable.
- **Works without an API key**, thanks to a deterministic rules fallback, so the demo never breaks.

## Two modes

| Mode | What happens |
|------|---|
| **Stack** | zkLTC held safely, custodied 1:1. |
| **Grow** | zkLTC earns a simulated 5% APY. Switching moves funds on-chain. |

**We're honest about what's real.** Deposits, withdrawals, mode switches, goals, and yield payouts are all real on-chain transactions on chain `4441`. The 5% APY is **simulated**, paid from a pre-funded testnet pool; principal is always returnable 1:1. A real yield source can drop in on mainnet through the `IYieldStrategy` interface.

---

## How it's built

```
forgemind/
├── contracts/   # Foundry · Solidity 0.8.24 · 75 passing tests
│   ├── ForgeVault.sol         # the vault: deposit/withdraw, Stack/Grow, goal, keeper
│   ├── MockYieldStrategy.sol  # simulated yield (pre-funded reward pool)
│   ├── ForgeActionLog.sol     # on-chain agent-decision ledger
│   └── ForgeProfile.sol       # missions / XP / registry
└── web/         # Next.js + TypeScript
    ├── app/api/agent/route.ts # the agent: tools + Claude + rules fallback
    ├── components/            # Dashboard, VaultPanel, AgentChat, AgentDecisions, AutoPilot, KeeperPanel
    └── hooks/ + lib/          # vault reads, halving math, formatters
```

**Stack:** Solidity + Foundry · Next.js + React + TypeScript · wagmi + viem · Vercel AI SDK + Claude Haiku 4.5.

> **🔒 Security:** fund paths are reentrancy-safe and solvent by construction, the agent and keeper are non-custodial, and all 75 tests pass. Full report in **[SECURITY.md](SECURITY.md)**.

---

## Run locally

**Contracts**
```bash
cd contracts
forge test             # 75 passing
cp .env.example .env   # add a funded testnet PRIVATE_KEY
forge script script/Deploy.s.sol:Deploy --rpc-url liteforge --broadcast
```
Get testnet zkLTC: https://liteforge.hub.caldera.xyz

**Frontend**
```bash
cd web
cp .env.example .env.local   # deployed contract addresses + optional ANTHROPIC_API_KEY
npm install && npm run dev   # http://localhost:3000
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
