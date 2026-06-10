"use client";

import { fmtNum } from "@/lib/format";

/** Stack (flat) vs Grow (rising) projection to the halving. Pure SVG, draws on mount.
 *  Strokes use Tailwind stroke-* classes (not stroke="" attrs) so they theme via CSS vars. */
export function ProjectionChart({
  current,
  goal,
  projectedGrow,
}: {
  current: number;
  goal: number;
  projectedGrow: number;
}) {
  const max = Math.max(goal, projectedGrow, current * 1.25, 1);
  const H = 64;
  const y = (val: number) => +(H - (val / max) * H).toFixed(2);

  const stackY = y(current);
  const growEndY = y(projectedGrow);
  const goalY = y(goal);

  const grow = `M 0 ${stackY} C 42 ${stackY}, 64 ${(stackY + growEndY) / 2}, 100 ${growEndY}`;
  const growArea = `${grow} L 100 ${H} L 0 ${H} Z`;
  const stack = `M 0 ${stackY} L 100 ${stackY}`;

  // Overlay positions (percent of height), clamped so markers never clip at the top/bottom edge.
  const clampPct = (v: number) => Math.min(96, Math.max(4, (v / H) * 100));
  const growEndPct = clampPct(growEndY);
  const goalPct = clampPct(goalY);

  return (
    <div className="space-y-3">
      <div className="relative h-44 w-full overflow-hidden rounded-xl border border-border bg-bg">
        <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="h-full w-full">
          <defs>
            <linearGradient id="growfill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff8a4c" stopOpacity="0.3" />
              <stop offset="42%" stopColor="#f4632a" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#f4632a" stopOpacity="0" />
            </linearGradient>
            <filter id="emberGlow" x="-20%" y="-60%" width="140%" height="220%">
              <feGaussianBlur stdDeviation="1.3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* gridlines */}
          {[0.25, 0.5, 0.75].map((g) => (
            <line key={g} x1="0" y1={H * g} x2="100" y2={H * g} className="stroke-border-strong" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
          ))}

          {/* grow fill */}
          <path d={growArea} fill="url(#growfill)" />

          {/* goal line */}
          {goal > 0 && (
            <line
              x1="0"
              y1={goalY}
              x2="100"
              y2={goalY}
              className="stroke-dim"
              strokeWidth="1"
              strokeDasharray="3,2.5"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* stack baseline */}
          <path
            d={stack}
            fill="none"
            className="stroke-muted"
            strokeWidth="1.4"
            strokeDasharray="3.5,3"
            vectorEffect="non-scaling-stroke"
          />

          {/* grow curve: bright ember + glow */}
          <path
            d={grow}
            fill="none"
            className="animate-draw stroke-ember-bright"
            strokeWidth="2.5"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            filter="url(#emberGlow)"
            pathLength={1}
          />
        </svg>

        {/* glowing endpoint for the grow projection */}
        <span
          className="absolute right-[3px] h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-ember-bright shadow-[0_0_12px_2px_rgba(244,99,42,0.55)] ring-2 ring-ember/25"
          style={{ top: `${growEndPct}%` }}
        />
        {/* goal marker */}
        {goal > 0 && (
          <span
            className="absolute left-[3px] -translate-y-1/2 rounded bg-panel-2 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-muted ring-1 ring-border"
            style={{ top: `${goalPct}%` }}
          >
            GOAL {fmtNum(goal, goal < 1 ? 3 : 0)}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted">
          <span className="inline-block h-0 w-3.5 border-t-2 border-dashed border-dim align-middle" /> Stack ·{" "}
          {fmtNum(current, 2)}
        </span>
        <span className="flex items-center gap-1.5 text-ember">
          <span className="inline-block h-[3px] w-3.5 rounded-full bg-ember-bright align-middle shadow-[0_0_8px_rgba(244,99,42,0.5)]" />{" "}
          Grow · {fmtNum(projectedGrow, 2)} by halving
        </span>
      </div>
    </div>
  );
}
