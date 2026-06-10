import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

export function Panel({
  label,
  right,
  className,
  bodyClassName,
  children,
}: {
  label?: string;
  right?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("card-elev rounded-2xl border border-border bg-panel", className)}>
      {(label || right) && (
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          {label ? <span className="label">{label}</span> : <span />}
          {right}
        </header>
      )}
      <div className={cn("p-6", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label">{label}</span>
      <span className={cn("tnum font-mono text-2xl font-semibold", accent ? "text-ember" : "text-text")}>
        {value}
      </span>
      {sub && <span className="tnum text-xs text-muted">{sub}</span>}
    </div>
  );
}
