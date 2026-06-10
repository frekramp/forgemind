// Proactive, deterministic opening analysis the Guardian "speaks first" with on connect.
// Pure + client-safe (no LLM call), so it's instant, free, and always available.
import { Mode } from "./contracts";
import { projectStack } from "./halving";
import { fmtNum } from "./format";

type InsightInput = {
  mode: Mode;
  total: number;
  goal: number;
  daysToHalving: number;
  pendingYield: number;
};

/** A 1-2 sentence proactive insight tailored to the user's live vault state. */
export function chatOpeningInsight(s: InsightInput): string {
  const isGrow = s.mode === Mode.Grow;
  const modeLabel = isGrow ? "Grow" : "Stack";
  const d = s.daysToHalving;

  if (s.total <= 0) {
    return `Welcome back. Your vault's empty right now. Deposit some zkLTC and I'll start tracking your pace to the halving (~${d}d out). Tell me an amount and I'll prep it.`;
  }
  if (s.goal <= 0) {
    return `You're holding ${fmtNum(s.total, 2)} zkLTC in ${modeLabel} mode with no halving goal set. Want me to set a target? Give me a number above ${fmtNum(s.total, 2)} and I'll track whether you're on pace.`;
  }

  const growProj = projectStack(s.total, true);
  const proj = isGrow ? growProj : s.total;

  if (proj >= s.goal) {
    const yieldNote = isGrow && s.pendingYield > 0 ? ` (~${fmtNum(s.pendingYield, 4)} yield already accruing)` : "";
    return `On pace ✅. At your current ${modeLabel} rate you're projected ~${fmtNum(proj, 2)} zkLTC by the halving, clearing your ${fmtNum(s.goal, 2)} goal${yieldNote}. Want me to lock in any moves?`;
  }
  if (!isGrow && growProj >= s.goal) {
    return `Heads up: in Stack mode you'd hold ${fmtNum(s.total, 2)} zkLTC, short of your ${fmtNum(s.goal, 2)} goal. Switching to Grow projects ~${fmtNum(growProj, 2)} by the halving, which clears it. Want me to switch you?`;
  }
  const gap = s.goal - growProj;
  return `You're at ${fmtNum(s.total, 2)} zkLTC toward a ${fmtNum(s.goal, 2)} goal, but even in Grow you'd reach ~${fmtNum(growProj, 2)}, about ${fmtNum(gap, 2)} short. Add more zkLTC or raise your pace and I'll re-check.`;
}
