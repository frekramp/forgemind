"use client";

import { Mode } from "@/lib/contracts";
import { cn } from "@/lib/cn";
import { fmtNum } from "@/lib/format";
import { useCountUp } from "@/hooks/useCountUp";
import { daysToHalving } from "@/lib/halving";
import type { useVault } from "@/hooks/useVault";
import { Coins, Shield, TrendingUp, Clock, Sparkles, type LucideIcon } from "lucide-react";

type Item = { label: string; value: string; unit: string; Icon: LucideIcon; accent: boolean; hint?: string };

export function StatStrip({ v }: { v: ReturnType<typeof useVault> }) {
  const s = v.state;
  const total = useCountUp(s?.total ?? 0);
  const yieldNum = useCountUp(s?.pendingYield ?? 0);
  const isGrow = s?.mode === Mode.Grow;
  const days = s?.daysToHalving || daysToHalving();

  const items: Item[] = [
    {
      label: "Vault balance",
      value: fmtNum(total, 4),
      unit: "zkLTC",
      Icon: Coins,
      accent: true,
      hint: "Your total zkLTC in the vault: deposited principal plus any unclaimed yield.",
    },
    {
      label: "Mode",
      value: isGrow ? "Grow" : "Stack",
      unit: isGrow ? "earning 5% APY" : "held 1:1",
      Icon: isGrow ? TrendingUp : Shield,
      accent: false,
      hint: isGrow
        ? "Grow earns a simulated 5% APY from a testnet pool. Your principal stays custodied 1:1."
        : "Stack holds your zkLTC 1:1, earning nothing. Switch to Grow to start earning.",
    },
    {
      label: "Unclaimed yield",
      value: fmtNum(yieldNum, 4),
      unit: "zkLTC",
      Icon: Sparkles,
      accent: false,
      hint: "Simulated yield earned so far (only grows in Grow mode). Claim it into your balance anytime.",
    },
    {
      label: "Halving in",
      value: String(days),
      unit: "days",
      Icon: Clock,
      accent: false,
      hint: "Days until the next Litecoin halving.",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 stagger">
      {items.map(({ label, value, unit, Icon, accent, hint }) => (
        <div
          key={label}
          title={hint}
          className={cn(
            "lift rounded-xl border bg-panel p-4",
            accent ? "border-ember/45 ring-1 ring-ember/15" : "border-border hover:border-border-strong"
          )}
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
