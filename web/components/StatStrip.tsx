"use client";

import { Mode } from "@/lib/contracts";
import { fmtNum } from "@/lib/format";
import { useCountUp } from "@/hooks/useCountUp";
import { daysToHalving } from "@/lib/halving";
import type { useVault } from "@/hooks/useVault";
import { Coins, Shield, TrendingUp, Clock, Sparkles, type LucideIcon } from "lucide-react";

type Item = { label: string; value: string; unit: string; Icon: LucideIcon; accent: boolean };

export function StatStrip({ v }: { v: ReturnType<typeof useVault> }) {
  const s = v.state;
  const total = useCountUp(s?.total ?? 0);
  const yieldNum = useCountUp(s?.pendingYield ?? 0);
  const isGrow = s?.mode === Mode.Grow;
  const days = s?.daysToHalving || daysToHalving();

  const items: Item[] = [
    { label: "Vault balance", value: fmtNum(total, 4), unit: "zkLTC", Icon: Coins, accent: true },
    { label: "Mode", value: isGrow ? "Grow" : "Stack", unit: isGrow ? "5% APY" : "safe", Icon: isGrow ? TrendingUp : Shield, accent: false },
    { label: "Yield accruing", value: fmtNum(yieldNum, 4), unit: "zkLTC", Icon: Sparkles, accent: false },
    { label: "Halving in", value: String(days), unit: "days", Icon: Clock, accent: false },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map(({ label, value, unit, Icon, accent }) => (
        <div
          key={label}
          className="rounded-xl border border-border bg-panel p-4 transition-colors hover:border-border-strong"
        >
          <div className="flex items-center justify-between">
            <span className="label">{label}</span>
            <Icon size={14} className={accent ? "text-ember" : "text-dim"} />
          </div>
          <div className="tnum mt-2 font-mono text-2xl font-semibold">
            <span className={accent ? "text-ember" : "text-text"}>{value}</span>
            <span className="ml-1 text-xs text-dim">{unit}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
