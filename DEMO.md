# ForgeMind — 90-second judge walkthrough

**Live:** https://forgemindapp.xyz · **Demo (no wallet):** https://forgemindapp.xyz/?demo=1

**The pitch in one line:** Most "AI agent" entries only *talk*. ForgeMind's Forge Guardian **reads** live on-chain state, **reasons** step by step, **acts** (prepares real txns you sign), and **records every decision on-chain**, verifiable on LiteForge (LitVM).

> **No wallet needed.** Append **`?demo=1`** (or click **Explore live demo** on the landing page). Everything below runs on clearly-labelled sample data; nothing touches the chain in demo mode.

---

## The path to click (in order)

1. **Landing** — read the hero ("Agentic AI on LiteForge · LitVM"), note the live **halving countdown**, and scan **How it works** (Reads → Reasons → Acts → Records). Click **Explore live demo**.
2. **Overview** — the vault sits at **127.42 zkLTC** in **Grow** mode with **7.42 zkLTC** of yield earned. The **Forge Guardian** (right rail) opens proactively with an on-pace/behind insight, unprompted. Tap **"Am I on pace?"** and watch it read state, show a **reasoning trace** (read → compute → answer), and reply with real numbers. *(Works with no API key: a deterministic rules fallback drives the same tools.)*
3. **Decisions** ← *the differentiator. Spend time here.*
   - A tamper-evident, on-chain ledger of **every agent decision**: the **engine** that decided it (**Forge Guardian** vs rule-based vs manual), a **reason**, and a **verified** signature for keeper moves.
   - Each row links the **decision tx** to the **settled** vault tx: the "why" paired with the "what". Expand **Verify** to recover the signer in your browser and confirm it matches the agent key.
4. **Auto-Pilot** — the agent acting **autonomously**, in two tiers: client-side **Auto-Pilot** (Auto-Compound / Auto-DCA on a timer, you confirm every tx) and an on-chain **keeper delegation** (capped, revocable) that compounds and rebalances 24/7 with no browser. Honest by design: every tx is user-signed and nothing is custodied.

## What to say while clicking
- "It's the **only true agentic app** in the track. Competitors are MCP/data servers or pure DeFi. This one **reads, reasons, acts, and records**."
- "**Honest, non-custodial:** the agent never holds keys. It *prepares* transactions; the user signs. Testnet yield is **simulated** and we say so everywhere."
- "The **Decisions** ledger is the proof: a verifiable on-chain trail of *why*, signed by the agent key and checked on-chain in `logAttested`."

## If asked "is it real or faked?"
- **Real on chain `4441`:** deposits, withdrawals, mode switches, goal setting, yield payout, the decision ledger, and the keeper delegation.
- **Simulated:** the 5% Grow APY (paid from a pre-funded testnet reward pool). Principal is always custodied 1:1. The `IYieldStrategy` interface lets a real protocol drop in on mainnet.

## Stack
Solidity + Foundry (75 passing tests) · Next.js 16 / React 19 / TypeScript · wagmi + viem · Vercel AI SDK + Claude Haiku 4.5 (deterministic fallback when no key).
