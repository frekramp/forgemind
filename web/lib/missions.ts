import { Shield, Target, TrendingUp, Coins, Flag, type LucideIcon } from "lucide-react";

export type Mission = {
  id: number;
  name: string;
  desc: string;
  xp: number;
  icon: LucideIcon;
};

/** Must match ForgeProfile.sol mission ids + XP table. */
export const MISSIONS: Mission[] = [
  { id: 0, name: "First Forge", desc: "Make your first zkLTC deposit", xp: 100, icon: Flag },
  { id: 1, name: "Stacker", desc: "Deposit 10+ zkLTC in total", xp: 200, icon: Coins },
  { id: 2, name: "Goal-Setter", desc: "Set a Litecoin-halving goal", xp: 100, icon: Target },
  { id: 3, name: "Halfway There", desc: "Reach 50% of your halving goal", xp: 300, icon: TrendingUp },
  { id: 4, name: "Yield Farmer", desc: "Activate Grow mode", xp: 150, icon: Shield },
];

export const TOTAL_XP = MISSIONS.reduce((s, m) => s + m.xp, 0);
export const XP_PER_LEVEL = 250;

export function levelFromXp(xp: number): number {
  return 1 + Math.floor(xp / XP_PER_LEVEL);
}

/** XP progress within the current level, as {into, need, pct}. */
export function levelProgress(xp: number) {
  const into = xp % XP_PER_LEVEL;
  return { into, need: XP_PER_LEVEL, pct: (into / XP_PER_LEVEL) * 100 };
}
