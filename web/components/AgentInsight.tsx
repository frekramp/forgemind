"use client";

import { Mode } from "@/lib/contracts";
import { projectStack } from "@/lib/halving";
import { fmtNum } from "@/lib/format";
import { Sparkles, TriangleAlert, CheckCircle2 } from "lucide-react";
import type { useVault } from "@/hooks/useVault";
import { cn } from "@/lib/cn";

/** Deterministic, always-on proactive guidance (works with or without the LLM). */
export function AgentInsight({
  v,
  onSwitchMode,
}: {
  v: ReturnType<typeof useVault>;
  onSwitchMode?: (m: Mode) => void;
}) {
  const s = v.state;
  let tone: "info" | "warn" | "ok" = "info";
  let msg = "Connect your wallet and deposit zkLTC. I'll help you stack toward the next halving.";
  let cta: { label: string; run: () => void } | null = null;

  if (s) {
    const isGrow = s.mode === Mode.Grow;
    if (s.total <= 0) {
      msg = "Your vault is empty. Deposit zkLTC to start stacking toward the next Litecoin halving.";
    } else if (s.goal <= 0) {
      msg = `You hold ${fmtNum(s.total, 2)} zkLTC. Set a halving goal and I'll tell you whether you're on pace.`;
    } else {
      const growProj = projectStack(s.total, true);
      const reached = (isGrow ? growProj : s.total) >= s.goal;
      if (reached) {
        tone = "ok";
        msg = `On pace - projected ${fmtNum(isGrow ? growProj : s.total, 2)} zkLTC by the halving against your ${fmtNum(s.goal, 2)} goal.`;
      } else if (!isGrow && growProj >= s.goal) {
        tone = "warn";
        msg = `In Stack mode you'd hold ${fmtNum(s.total, 2)} - short of your ${fmtNum(s.goal, 2)} goal. Switching to Grow projects ${fmtNum(growProj, 2)} by the halving.`;
        cta = { label: "Switch to Grow", run: () => onSwitchMode?.(Mode.Grow) };
      } else {
        tone = "warn";
        const gap = s.goal - growProj;
        msg = `Even in Grow you'd reach ~${fmtNum(growProj, 2)} - about ${fmtNum(gap, 2)} short of goal. Consider adding zkLTC.`;
      }
    }
  }

  const Icon = tone === "ok" ? CheckCircle2 : tone === "warn" ? TriangleAlert : Sparkles;
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border px-4 py-3.5",
        tone === "warn"
          ? "border-ember/30 bg-ember-soft"
          : tone === "ok"
            ? "border-gain/25 bg-gain/5"
            : "border-border bg-panel"
      )}
    >
      <Icon size={18} className={cn("mt-0.5 shrink-0", tone === "ok" ? "text-gain" : "text-ember")} />
      <div className="space-y-1.5">
        <p className="text-sm leading-relaxed text-text">
          <span className="label mr-2 align-middle">Guardian</span>
          {msg}
        </p>
        {cta && (
          <button onClick={cta.run} className="text-xs font-medium text-ember hover:text-ember-bright">
            {cta.label} →
          </button>
        )}
      </div>
    </div>
  );
}
