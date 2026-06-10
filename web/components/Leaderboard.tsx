"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { Panel } from "./ui/panel";
import { useLeaderboard, type SortKey } from "@/hooks/useLeaderboard";
import { shortAddr, fmtNum } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Trophy, Crown } from "lucide-react";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "xp", label: "XP" },
  { key: "balance", label: "Balance" },
  { key: "progress", label: "Goal %" },
  { key: "yield", label: "Yield" },
];

export function Leaderboard() {
  const [sortBy, setSortBy] = useState<SortKey>("xp");
  const { rows, isLoading, count } = useLeaderboard(sortBy);
  const { address } = useAccount();

  return (
    <Panel
      label="Leaderboard"
      right={
        <div className="flex gap-1 rounded-lg border border-border bg-bg p-0.5">
          {SORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSortBy(s.key)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                sortBy === s.key ? "bg-panel-2 text-ember" : "text-dim hover:text-text"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      }
    >
      <div className="space-y-1">
        <div className="grid grid-cols-[2rem_1fr_auto_auto] items-center gap-3 px-2 pb-2 text-[10px] uppercase tracking-wider text-dim">
          <span>#</span>
          <span>Stacker</span>
          <span className="text-right">Lvl · XP</span>
          <span className="text-right">{SORTS.find((s) => s.key === sortBy)?.label}</span>
        </div>
        {isLoading && rows.length === 0 && <Empty text="Reading the registry…" />}
        {!isLoading && rows.length === 0 && <Empty text="No stackers yet. Be the first." />}
        {rows.map((r, i) => {
          const me = address && r.address.toLowerCase() === address.toLowerCase();
          const metric =
            sortBy === "balance"
              ? `${fmtNum(r.balance, 2)}`
              : sortBy === "progress"
                ? `${fmtNum(r.progressPct, 0)}%`
                : sortBy === "yield"
                  ? `${fmtNum(r.pendingYield, 4)}`
                  : `${fmtNum(r.xp, 0)}`;
          return (
            <div
              key={r.address}
              className={cn(
                "grid grid-cols-[2rem_1fr_auto_auto] items-center gap-3 rounded-lg px-2 py-2.5 transition-colors",
                me ? "border border-ember/30 bg-ember-soft" : "hover:bg-panel-2"
              )}
            >
              <span className="flex items-center font-mono text-sm text-dim">
                {i === 0 ? <Crown size={14} className="text-ember" /> : i + 1}
              </span>
              <span className="min-w-0 truncate text-sm">
                <span className="font-medium text-text">{r.username || shortAddr(r.address)}</span>
                {me && <span className="ml-2 text-[10px] text-ember">you</span>}
              </span>
              <span className="text-right">
                <span className="rounded-md bg-bg px-1.5 py-0.5 font-mono text-xs text-muted">L{r.level}</span>{" "}
                <span className="tnum font-mono text-xs text-dim">{fmtNum(r.xp, 0)}</span>
              </span>
              <span className="tnum text-right font-mono text-sm text-ember">{metric}</span>
            </div>
          );
        })}
      </div>
      {count > 0 && <p className="mt-3 text-[11px] text-dim">{count} stacker{count === 1 ? "" : "s"} on-chain</p>}
    </Panel>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <Trophy size={20} className="text-dim" />
      <p className="text-sm text-dim">{text}</p>
    </div>
  );
}
