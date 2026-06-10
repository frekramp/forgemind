"use client";

import { Panel } from "./ui/panel";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useCountUp } from "@/hooks/useCountUp";
import { fmtNum } from "@/lib/format";
import { Lock, Users, Percent, CalendarClock, type LucideIcon } from "lucide-react";

export function Analytics() {
  const { data, deployed } = useAnalytics();
  const tvl = useCountUp(data?.tvl ?? 0);
  const users = useCountUp(data?.users ?? 0);

  const cards: { label: string; value: string; unit: string; Icon: LucideIcon; accent?: boolean }[] = [
    { label: "Total value locked", value: fmtNum(tvl, 2), unit: "zkLTC", Icon: Lock, accent: true },
    { label: "Participants", value: fmtNum(users, 0), unit: "stackers", Icon: Users },
    { label: "Grow APY", value: fmtNum(data?.aprPct ?? 0, 2), unit: "% simulated", Icon: Percent },
    { label: "Next halving", value: fmtNum(data?.daysToHalving ?? 0, 0), unit: "days", Icon: CalendarClock },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(({ label, value, unit, Icon, accent }) => (
          <div key={label} className="rounded-xl border border-border bg-panel p-4 transition-colors hover:border-border-strong">
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

      <Panel label="Protocol Overview">
        <div className="space-y-4 text-sm leading-relaxed text-muted">
          <p>
            ForgeMind is an AI-managed zkLTC vault on LiteForge. Every figure here is read{" "}
            <span className="text-text">live from the contract</span> via{" "}
            <code className="font-mono text-text">globalStats()</code>, no off-chain database.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Mini label="Stack mode" desc="Principal held 1:1, fully custodied and withdrawable anytime." />
            <Mini label="Grow mode" desc="Principal deployed to a yield strategy earning simulated 5% APY." />
            <Mini label="Halving goal" desc="Each stacker targets a zkLTC balance before the ~Aug 2027 halving." />
          </div>
          {!deployed && (
            <p className="text-[11px] text-dim">
              Numbers populate once the vault is deployed and stackers begin depositing.
            </p>
          )}
        </div>
      </Panel>
    </div>
  );
}

function Mini({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg p-3">
      <div className="text-sm font-medium text-text">{label}</div>
      <div className="mt-1 text-xs text-dim">{desc}</div>
    </div>
  );
}
