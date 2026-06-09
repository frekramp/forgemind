// Client mirror of ForgeActionLog.sol enums + helpers for the on-chain decision ledger.
import type { Address, Hex } from "viem";
import type { AgentAction } from "./agent";

/** Must match ForgeActionLog.Kind. */
export enum ActionKind {
  Deposit = 0,
  Withdraw = 1,
  SetMode = 2,
  ClaimYield = 3,
  SetGoal = 4,
  ClaimMission = 5,
  AutoCompound = 6,
  AutoDCA = 7,
}

/** Must match ForgeActionLog.Engine. */
export enum ActionEngine {
  Manual = 0,
  Rules = 1,
  Claude = 2,
}

export const KIND_LABEL: Record<ActionKind, string> = {
  [ActionKind.Deposit]: "Deposit",
  [ActionKind.Withdraw]: "Withdraw",
  [ActionKind.SetMode]: "Switch mode",
  [ActionKind.ClaimYield]: "Claim yield",
  [ActionKind.SetGoal]: "Set goal",
  [ActionKind.ClaimMission]: "Claim mission",
  [ActionKind.AutoCompound]: "Auto-Compound",
  [ActionKind.AutoDCA]: "Auto-DCA",
};

export const ENGINE_LABEL: Record<ActionEngine, string> = {
  [ActionEngine.Manual]: "Manual",
  [ActionEngine.Rules]: "Rules",
  [ActionEngine.Claude]: "Claude",
};

/** A decoded ForgeActionLog entry as the UI consumes it (enriched server-side with the
 *  on-chain tx of the decision and a best-effort link to the vault tx it settled). */
export type DecisionEntry = {
  actor: `0x${string}`;
  kind: ActionKind;
  engine: ActionEngine;
  timestamp: number; // unix seconds (block time)
  amount: number; // zkLTC
  reason: string;
  attested?: boolean; // true => signature from the agent's trusted signer was verified on-chain
  txHash?: string; // tx of the ActionLogged event (the "why", provably on-chain)
  block?: number;
  outcomeTx?: string; // nearest matching vault tx (the "what")
  outcomeType?: string;
  outcomeAmount?: string;
  /** Demo-only: a real precomputed attestation so the UI can recover the agent signer
   *  client-side and prove the ✓Verified badge (live entries are verified on-chain instead). */
  attestation?: {
    signer: Address; // the agent's trusted-signer key the decision should recover to
    actionLog: Address; // contract address bound into the digest
    chainId: number;
    nonce: number;
    sig: Hex;
  };
};

/** Agent chat engine string ("claude" | "rules") → on-chain Engine. */
export function engineFromString(e: "claude" | "rules" | null | undefined): ActionEngine {
  if (e === "claude") return ActionEngine.Claude;
  if (e === "rules") return ActionEngine.Rules;
  return ActionEngine.Manual;
}

/**
 * Map a proposed AgentAction to its on-chain Kind, or null when it has no on-chain
 * action to notarize (e.g. enabling Auto-Pilot is a client-side config change).
 */
export function kindForAction(a: AgentAction): ActionKind | null {
  switch (a.type) {
    case "deposit":
      return ActionKind.Deposit;
    case "withdraw":
      return ActionKind.Withdraw;
    case "setMode":
      return ActionKind.SetMode;
    case "claimYield":
      return ActionKind.ClaimYield;
    case "setGoal":
      return ActionKind.SetGoal;
    case "claimMission":
      return ActionKind.ClaimMission;
    case "enableAutoPilot":
      return null;
  }
}
