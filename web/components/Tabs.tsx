"use client";

import { cn } from "@/lib/cn";
import { LayoutDashboard, Bot, BrainCircuit, type LucideIcon } from "lucide-react";

export type TabKey =
  | "overview"
  | "leaderboard"
  | "activity"
  | "missions"
  | "analytics"
  | "autopilot"
  | "decisions";

// Focused, agent-first nav — just the three surfaces that tell the AI-agent story.
// Missions / Leaderboard / Activity / Analytics still exist as components (Dashboard can
// still render them); add a line back here to resurface one in the tab bar.
const TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "decisions", label: "Decisions", icon: BrainCircuit },
  { key: "autopilot", label: "Auto-Pilot", icon: Bot },
];

export function Tabs({ active, onChange }: { active: TabKey; onChange: (t: TabKey) => void }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-panel p-1">
      {TABS.map(({ key, label, icon: Icon }) => {
        const on = active === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-all",
              on ? "bg-panel-2 text-ember shadow-[inset_0_0_0_1px_var(--color-border-strong)]" : "text-dim hover:text-text"
            )}
          >
            <Icon size={15} />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
