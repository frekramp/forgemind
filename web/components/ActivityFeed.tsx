"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { Panel } from "./ui/panel";
import { useActivity, type ActivityItem } from "@/hooks/useActivity";
import { shortAddr, fmtNum } from "@/lib/format";
import { liteforge } from "@/lib/chains";
import { cn } from "@/lib/cn";
import { ArrowDownLeft, ArrowUpRight, Shield, TrendingUp, Target, Coins, ExternalLink } from "lucide-react";

const META = {
  deposit: { icon: ArrowDownLeft, color: "text-gain", verb: "deposited" },
  withdraw: { icon: ArrowUpRight, color: "text-loss", verb: "withdrew" },
  mode: { icon: TrendingUp, color: "text-ember", verb: "switched mode" },
  goal: { icon: Target, color: "text-muted", verb: "set goal" },
  yield: { icon: Coins, color: "text-gain", verb: "claimed yield" },
} as const;

function line(it: ActivityItem): string {
  switch (it.type) {
    case "deposit":
      return `deposited ${fmtNum(Number(it.amount ?? 0), 2)} zkLTC`;
    case "withdraw":
      return `withdrew ${fmtNum(Number(it.amount ?? 0), 2)} zkLTC`;
    case "mode":
      return `switched to ${it.mode === 1 ? "Grow" : "Stack"} mode`;
    case "goal":
      return `set a goal of ${fmtNum(Number(it.amount ?? 0), 0)} zkLTC`;
    case "yield":
      return `claimed ${fmtNum(Number(it.amount ?? 0), 4)} zkLTC yield`;
  }
}

export function ActivityFeed() {
  const { address } = useAccount();
  const [scope, setScope] = useState<"all" | "me">("all");
  const { items, isLoading } = useActivity(scope === "me" ? address : undefined);

  return (
    <Panel
      label="Activity"
      right={
        <div className="flex gap-1 rounded-lg border border-border bg-bg p-0.5">
          {(["all", "me"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              disabled={s === "me" && !address}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-30",
                scope === s ? "bg-panel-2 text-ember" : "text-dim hover:text-text"
              )}
            >
              {s === "all" ? "Global" : "You"}
            </button>
          ))}
        </div>
      }
    >
      <div className="space-y-1">
        {isLoading && items.length === 0 && <Empty text="Loading on-chain activity…" />}
        {!isLoading && items.length === 0 && (
          <Empty text={scope === "me" ? "No activity yet — make your first move." : "No vault activity yet."} />
        )}
        {items.map((it, i) => {
          const m = META[it.type];
          const Icon = m.icon;
          return (
            <a
              key={`${it.txHash}-${i}`}
              href={`${liteforge.blockExplorers.default.url}/tx/${it.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-panel-2"
            >
              <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border bg-bg", m.color)}>
                <Icon size={14} />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">
                <span className="font-mono text-text">{shortAddr(it.user)}</span>{" "}
                <span className="text-muted">{line(it)}</span>
              </span>
              <ExternalLink size={12} className="shrink-0 text-dim opacity-0 transition-opacity group-hover:opacity-100" />
            </a>
          );
        })}
      </div>
    </Panel>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <Shield size={20} className="text-dim" />
      <p className="text-sm text-dim">{text}</p>
    </div>
  );
}
