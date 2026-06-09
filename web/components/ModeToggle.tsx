"use client";

import { Mode } from "@/lib/contracts";
import { cn } from "@/lib/cn";
import { Shield, TrendingUp } from "lucide-react";

export function ModeToggle({
  mode,
  onChange,
  disabled,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
  disabled?: boolean;
}) {
  const opts = [
    { m: Mode.Stack, label: "Stack", icon: Shield, desc: "Hold safely" },
    { m: Mode.Grow, label: "Grow", icon: TrendingUp, desc: "Earn 5% APY" },
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-bg p-1">
      {opts.map(({ m, label, icon: Icon, desc }) => {
        const active = mode === m;
        return (
          <button
            key={m}
            disabled={disabled}
            onClick={() => onChange(m)}
            className={cn(
              "flex flex-col items-start gap-1 rounded-md px-3 py-2.5 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50",
              active
                ? cn(
                    "bg-panel-2 shadow-[inset_0_0_0_1px_var(--color-border-strong)]",
                    m === Mode.Grow ? "text-ember" : "text-text"
                  )
                : "text-dim hover:text-muted"
            )}
          >
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Icon size={14} /> {label}
            </span>
            <span className="text-[11px] text-dim">{desc}</span>
          </button>
        );
      })}
    </div>
  );
}
