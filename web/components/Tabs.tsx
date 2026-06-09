"use client";

import { Fragment } from "react";
import { cn } from "@/lib/cn";
import { LayoutDashboard, Trophy, Activity, Target, BarChart3, Bot, BrainCircuit, type LucideIcon } from "lucide-react";

export type TabKey =
  | "overview"
  | "leaderboard"
  | "activity"
  | "missions"
  | "analytics"
  | "autopilot"
  | "decisions";

// Agent-first order: the three "agent" surfaces lead (Overview · Decisions · Auto-Pilot),
// then the social/stats extras. A divider after index 2 reinforces the split.
const TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "decisions", label: "Decisions", icon: BrainCircuit },
  { key: "autopilot", label: "Auto-Pilot", icon: Bot },
  { key: "missions", label: "Missions", icon: Target },
  { key: "leaderboard", label: "Leaderboard", icon: Trophy },
  { key: "activity", label: "Activity", icon: Activity },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
];

export function Tabs({ active, onChange }: { active: TabKey; onChange: (t: TabKey) => void }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-panel p-1">
      {TABS.map(({ key, label, icon: Icon }, i) => {
        const on = active === key;
        return (
          <Fragment key={key}>
            {i === 3 && <span aria-hidden className="mx-1 hidden w-px self-stretch bg-border sm:block" />}
            <button
              onClick={() => onChange(key)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-all",
                on ? "bg-panel-2 text-ember shadow-[inset_0_0_0_1px_var(--color-border-strong)]" : "text-dim hover:text-text"
              )}
            >
              <Icon size={15} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
