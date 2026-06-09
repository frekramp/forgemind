"use client";

import { useEffect, useState } from "react";
import { Panel } from "./ui/panel";
import { Button } from "./ui/button";
import { ProjectionChart } from "./ProjectionChart";
import { countdownTo, projectStack, HALVING_LABEL, type Countdown } from "@/lib/halving";
import { fmtNum, pct } from "@/lib/format";
import { useCountUp } from "@/hooks/useCountUp";
import type { useVault } from "@/hooks/useVault";

/** Mount-gated so server render (no clock) never mismatches the client. */
function useCountdown() {
  const [c, setC] = useState<Countdown | null>(null);
  useEffect(() => {
    setC(countdownTo());
    const t = setInterval(() => setC(countdownTo()), 1000);
    return () => clearInterval(t);
  }, []);
  return c;
}

export function HalvingTracker({ v }: { v: ReturnType<typeof useVault> }) {
  const s = v.state;
  const c = useCountdown();
  const [goal, setGoal] = useState("");
  const busy = v.txPending || v.txConfirming;
  const current = s?.total ?? 0;
  const goalNum = s?.goal ?? 0;
  const progress = goalNum > 0 ? pct(current, goalNum) : 0;
  const projectedGrow = projectStack(current, true);
  const currentAnim = useCountUp(current);

  const units: [string, number][] = [
    ["Days", c?.days ?? 0],
    ["Hrs", c?.hours ?? 0],
    ["Min", c?.minutes ?? 0],
    ["Sec", c?.seconds ?? 0],
  ];

  return (
    <Panel label="Litecoin Halving Goal" right={<span className="text-[11px] text-dim">Est. {HALVING_LABEL}</span>}>
      <div className="space-y-5">
        <div className="grid grid-cols-4 gap-2">
          {units.map(([l, n]) => (
            <div key={l} className="rounded-lg border border-border bg-bg py-2.5 text-center">
              <div className="tnum font-mono text-xl font-semibold text-ember">{String(n).padStart(2, "0")}</div>
              <div className="label mt-1">{l}</div>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Progress to goal</span>
            <span className="tnum font-mono">
              {fmtNum(currentAnim, 2)} / {goalNum > 0 ? fmtNum(goalNum, 2) : "—"}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-bg">
            <div
              className="h-full rounded-full bg-gradient-to-r from-ember-deep via-ember to-ember-bright transition-[width] duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-dim">
            <span>{progress.toFixed(0)}% complete</span>
            <span>Projected (Grow): {fmtNum(projectedGrow, 2)}</span>
          </div>
        </div>

        <ProjectionChart current={current} goal={goalNum} projectedGrow={projectedGrow} />

        <div className="flex items-center gap-2">
          <input
            inputMode="decimal"
            value={goal}
            placeholder={goalNum > 0 ? `current goal ${fmtNum(goalNum, 0)}` : "Set goal e.g. 500"}
            onChange={(e) => setGoal(e.target.value.replace(/[^0-9.]/g, ""))}
            className="tnum h-10 flex-1 rounded-lg border border-border bg-bg px-3 font-mono text-sm outline-none transition-colors focus:border-ember placeholder:text-dim"
          />
          <Button disabled={busy || !Number(goal)} onClick={async () => { try { await v.setGoal(goal); setGoal(""); } catch {} }}>
            Set goal
          </Button>
        </div>
        <p className="text-[11px] leading-relaxed text-dim">
          Goal must exceed your current balance. Grow-mode yield is a simulated 5% APY paid from a testnet
          reward pool — principal is always custodied 1:1.
        </p>
      </div>
    </Panel>
  );
}
