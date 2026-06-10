// Litecoin halving math. The next halving is block 3,360,000 (~early Aug 2027).
// We mirror the on-chain constant in ForgeVault (HALVING_TIMESTAMP) so the UI and
// contract agree. The frontend shows a live countdown to this estimate.
export const HALVING_TIMESTAMP = 1_816_934_400; // seconds (≈ Aug 2027)
export const HALVING_DATE = new Date(HALVING_TIMESTAMP * 1000);
// Fixed display label - avoids server/client timezone hydration mismatches.
export const HALVING_LABEL = "Aug 2027";
export const APR_BPS = 500; // 5.00% simulated APR (matches MockYieldStrategy)

export type Countdown = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
};

export function countdownTo(target = HALVING_TIMESTAMP, nowMs = Date.now()): Countdown {
  const total = Math.max(0, target * 1000 - nowMs);
  const s = Math.floor(total / 1000);
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
    total,
  };
}

/** Days remaining until the halving. */
export function daysToHalving(nowMs = Date.now()): number {
  return Math.max(0, Math.floor((HALVING_TIMESTAMP * 1000 - nowMs) / 86_400_000));
}

/**
 * Simple-interest projection of `balance` (zkLTC) held in Grow mode until the
 * halving. Mirrors ForgeVault.getProjectedStack.
 */
export function projectStack(balance: number, isGrow: boolean, aprBps = APR_BPS): number {
  if (!isGrow) return balance;
  const days = daysToHalving();
  const gain = (balance * aprBps * days) / (365 * 10_000);
  return balance + gain;
}

/** Constant Grow-mode contribution needed to hit `goal` by the halving. */
export function requiredVelocityPerDay(current: number, goal: number): number {
  const days = daysToHalving();
  if (days <= 0 || goal <= current) return 0;
  return (goal - current) / days;
}
