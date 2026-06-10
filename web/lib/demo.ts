// Sample data for Demo Mode - lets judges explore a fully-populated dashboard with no
// wallet. Everything here is clearly surfaced as "demo data" in the UI (see DemoProvider
// banner); it never touches the chain and all writes are no-ops in demo mode.
import type { Address } from "viem";
import { Mode } from "./contracts";
import { toWei } from "./format";
import { daysToHalving, projectStack } from "./halving";
import { levelProgress } from "./missions";
import { ActionEngine, ActionKind, type DecisionEntry } from "./actionlog";
import type { VaultState } from "@/hooks/useVault";
import type { MissionState } from "@/hooks/useMissions";
import type { LeaderRow } from "@/hooks/useLeaderboard";
import type { Analytics } from "@/hooks/useAnalytics";
import type { ActivityItem } from "@/hooks/useActivity";

export const DEMO_ADDRESS = "0x5A71c0FFEe1234567890aBCdef1234567890DeAd" as Address;
export const DEMO_USERNAME = "satoshi_jr";
export const DEMO_WALLET_BALANCE = 42.5;

// Demo attestation: a throwaway "agent" signer (anvil acct #0) + a stand-in ForgeActionLog
// address. The signatures on the decisions below are REAL - generated over
// lib/attest.decisionStructHash - so the Decisions tab can recover this signer in the browser
// and genuinely prove the ✓Verified badge (no server, no chain needed for the demo).
export const DEMO_SIGNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address;
export const DEMO_ACTIONLOG = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address;

const fakeTx = (seed: string) => `0x${seed.repeat(64).slice(0, 64)}` as const;

export function demoVaultState(): VaultState {
  const total = 127.42;
  return {
    mode: Mode.Grow,
    stack: 0,
    growPrincipal: 120,
    pendingYield: 7.42,
    total,
    goal: 250,
    daysToHalving: daysToHalving(),
    projected: projectStack(total, true),
    raw: { total: toWei("127.42"), goal: toWei("250"), pendingYield: toWei("7.42") },
  };
}

export const DEMO_MISSION_STATE: MissionState = {
  totalXp: 600,
  level: 3,
  claimedCount: 3,
  met: [true, true, true, true, true],
  done: [true, true, false, true, false], // missions 2 & 4 still claimable
  progress: levelProgress(600),
};

export function demoLeaderboard(): LeaderRow[] {
  return [
    { address: "0xD1A".padEnd(42, "0") as Address, username: "diamond_paws", balance: 312, goal: 500, progressPct: 62, pendingYield: 14.2, xp: 1200, level: 5 },
    { address: DEMO_ADDRESS, username: DEMO_USERNAME, balance: 127.42, goal: 250, progressPct: 51, pendingYield: 7.42, xp: 600, level: 3 },
    { address: "0x17C".padEnd(42, "0") as Address, username: "ltc_maxi", balance: 98, goal: 200, progressPct: 49, pendingYield: 3.1, xp: 450, level: 2 },
    { address: "0x40D".padEnd(42, "0") as Address, username: "hodlonaut", balance: 64, goal: 150, progressPct: 43, pendingYield: 0, xp: 300, level: 2 },
    { address: "0xB10".padEnd(42, "0") as Address, username: "block_reward", balance: 41, goal: 100, progressPct: 41, pendingYield: 1.8, xp: 250, level: 2 },
    { address: "0x5B0".padEnd(42, "0") as Address, username: "stackbot", balance: 22, goal: 80, progressPct: 28, pendingYield: 0, xp: 100, level: 1 },
  ];
}

export function demoDecisions(): DecisionEntry[] {
  const now = Math.floor(Date.now() / 1000);
  // Real signatures over lib/attest.decisionStructHash (see scripts that generated them):
  // actor=DEMO_ADDRESS, actionLog=DEMO_ACTIONLOG, chainId=4441, with the amount/reason/nonce
  // of each entry. The Decisions tab recovers DEMO_SIGNER from these client-side.
  const mkAtt = (nonce: number, sig: `0x${string}`): DecisionEntry["attestation"] => ({
    signer: DEMO_SIGNER,
    actionLog: DEMO_ACTIONLOG,
    chainId: 4441,
    nonce,
    sig,
  });
  const base = (
    kind: ActionKind,
    engine: ActionEngine,
    amount: number,
    reason: string,
    agoSec: number,
    outcomeType?: string,
    outcomeAmount?: string,
    attestation?: DecisionEntry["attestation"]
  ): DecisionEntry => ({
    actor: DEMO_ADDRESS,
    kind,
    engine,
    // Agent-driven moves (Rules/Claude) are notarized via logAttested → verified on-chain;
    // a manual move is only self-attested. Mirrors the real keeper flow.
    attested: engine !== ActionEngine.Manual,
    amount,
    reason,
    timestamp: now - agoSec,
    txHash: fakeTx((kind + 1).toString()),
    block: 1_000_000 - agoSec,
    outcomeTx: outcomeType ? fakeTx((kind + 7).toString()) : undefined,
    outcomeType,
    outcomeAmount,
    attestation,
  });
  return [
    base(ActionKind.AutoCompound, ActionEngine.Rules, 0, "Auto-Compound: yield 0.42 >= 0.10 threshold", 120, "yield", "0.42", mkAtt(3, "0x4a0e086bb8cee9f3daecd52e6fed0d86b5124c34fad3504863c66b3b180410b66153333d78caf4c75645bbd7e95d2256e8f1884a01d5cef83c399b0cf21f15521b")),
    base(ActionKind.SetMode, ActionEngine.Claude, 0, "Projected short of goal in Stack - Grow clears it", 1080, "mode", undefined, mkAtt(2, "0x67d7aea750eea1ecdd6a730c9ceac9168933a9eb59ab31a2be23ce68066482dd5aced924c743d1a5b896eebd45c534bec1ff0853eea32335b115e712b6f212f71c")),
    base(ActionKind.Deposit, ActionEngine.Claude, 25, "DCA top-up toward the 250 zkLTC halving goal", 3600, "deposit", "25", mkAtt(1, "0x993a7cc6a536a68dac978cd8d39254751b3b36f4f159c53c19a6ec44cac8bab270821f7ca1e92f730968fba6d429c71813d578e33e4746519eefbbbe80cc82ef1b")),
    base(ActionKind.SetGoal, ActionEngine.Claude, 250, "Set halving goal to 250 zkLTC", 10_800, "goal", "250", mkAtt(0, "0x62ecdee8174eb9a4dd56b24464b69918b741aad366cc8659693ccf03d7586a1f79ab70b4b34461efe8ac0dccd74e475b8e60c9fe4f799ed1e6c9f175aa9c7dc61b")),
    base(ActionKind.Deposit, ActionEngine.Manual, 100, "Initial deposit", 172_800, "deposit", "100"),
  ];
}

export function demoAnalytics(): Analytics {
  return { tvl: 664.4, users: 6, aprPct: 5, daysToHalving: daysToHalving() };
}

export function demoActivity(): ActivityItem[] {
  return [
    { type: "yield", user: DEMO_ADDRESS, amount: "0.42", block: 999_880, txHash: fakeTx("a") },
    { type: "mode", user: DEMO_ADDRESS, mode: 1, block: 998_920, txHash: fakeTx("b") },
    { type: "deposit", user: "0xD1A".padEnd(42, "0"), amount: "50", block: 998_400, txHash: fakeTx("c") },
    { type: "deposit", user: DEMO_ADDRESS, amount: "25", block: 996_400, txHash: fakeTx("d") },
    { type: "goal", user: "0x17C".padEnd(42, "0"), amount: "200", block: 994_100, txHash: fakeTx("e") },
    { type: "withdraw", user: "0x40D".padEnd(42, "0"), amount: "8", block: 990_200, txHash: fakeTx("f") },
    { type: "deposit", user: DEMO_ADDRESS, amount: "100", block: 827_200, txHash: fakeTx("1") },
  ];
}
