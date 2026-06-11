"use client";

import { cn } from "@/lib/cn";
import { LayoutDashboard, Bot, BrainCircuit, type LucideIcon } from "lucide-react";

export type TabKey = "overview" | "decisions" | "autopilot";

// Focused, agent-first nav: the three surfaces that tell the on-chain AI-agent story.
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
            aria-label={label}
            title={label}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-all",
              on ? "bg-panel-2 text-ember shadow-[inset_0_0_0_1px_rgb(var(--color-border-strong))]" : "text-dim hover:text-text"
            )}
          >
            <Icon size={15} />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
