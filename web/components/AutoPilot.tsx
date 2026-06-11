"use client";

import { Panel } from "./ui/panel";
import { Button } from "./ui/button";
import type { useAutoPilot } from "@/hooks/useAutoPilot";
import { fmtNum, shortAddr } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Bot, Repeat, Coins, Power, ExternalLink, ShieldAlert } from "lucide-react";
import { liteforge } from "@/lib/chains";

export function AutoPilot({ ap }: { ap: ReturnType<typeof useAutoPilot> }) {
  const { config, setConfig, enabled, log, spent, remaining } = ap;

  return (
    <div className="space-y-5">
      <Panel
        label="Auto-Pilot"
        right={
          <span className={cn("flex items-center gap-1.5 text-[11px]", enabled ? "text-gain" : config.strategy !== "off" ? "text-ember" : "text-dim")}>
            <span className={cn("h-1.5 w-1.5 rounded-full", enabled ? "bg-gain animate-pulse-ember" : config.strategy !== "off" ? "bg-ember" : "bg-dim")} />
            {enabled ? "active" : config.strategy !== "off" ? "ready" : "idle"}
          </span>
        }
      >
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-muted">
            The agent runs a rule on a timer and acts on-chain automatically. Pick a strategy, set it up, then{" "}
            <span className="text-text">press Start</span>. Nothing fires until you do, and you still confirm every
            transaction in your wallet.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 stagger">
            <StrategyCard
              active={config.strategy === "compound"}
              icon={Coins}
              title="Auto-Compound"
              desc="Claim yield once it crosses a threshold."
              onClick={() => setConfig({ strategy: "compound", running: false })}
            />
            <StrategyCard
              active={config.strategy === "dca"}
              icon={Repeat}
              title="Auto-DCA"
              desc="Deposit a fixed amount on a schedule."
              onClick={() => setConfig({ strategy: "dca", running: false })}
            />
            <StrategyCard
              active={config.strategy === "off"}
              icon={Power}
              title="Off"
              desc="Pause all autonomous actions."
              onClick={() => setConfig({ strategy: "off", running: false })}
            />
          </div>

          {config.strategy === "compound" && (
            <div className="space-y-1.5">
              <Field label="Claim when yield ≥ (zkLTC)">
                <NumberInput value={config.claimThreshold} onChange={(n) => setConfig({ claimThreshold: n })} step="0.01" />
              </Field>
              <p className="text-[11px] leading-relaxed text-dim">
                Only fires while you&apos;re in Grow mode and accrued yield crosses this. In Stack mode there&apos;s no
                yield to claim, so nothing happens until you switch to Grow.
              </p>
            </div>
          )}

          {config.strategy === "dca" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Amount / tick (zkLTC)">
                <NumberInput value={config.dcaAmount} onChange={(n) => setConfig({ dcaAmount: n })} step="0.5" />
              </Field>
              <Field label="Every (minutes)">
                <NumberInput value={config.dcaIntervalMin} onChange={(n) => setConfig({ dcaIntervalMin: n })} step="1" />
              </Field>
              <Field label="Session cap (zkLTC)">
                <NumberInput value={config.cap} onChange={(n) => setConfig({ cap: n })} step="1" />
              </Field>
            </div>
          )}

          {config.strategy === "dca" && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] text-dim">
                <span>Session spend</span>
                <span className="tnum">
                  {fmtNum(spent, 2)} / {fmtNum(config.cap, 2)} zkLTC · {fmtNum(remaining, 2)} left
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-bg">
                <div className="h-full bg-ember" style={{ width: `${config.cap > 0 ? Math.min(100, (spent / config.cap) * 100) : 0}%` }} />
              </div>
            </div>
          )}

          {config.strategy !== "off" && (
            <Button
              onClick={() => setConfig({ running: !config.running })}
              variant={config.running ? "outline" : "primary"}
              className="w-full"
            >
              {config.running ? (
                <>
                  <Power size={15} /> Pause Auto-Pilot
                </>
              ) : (
                <>
                  <Bot size={15} /> Start Auto-Pilot
                </>
              )}
            </Button>
          )}

          <div className="flex items-start gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-[11px] text-dim">
            <ShieldAlert size={14} className="mt-0.5 shrink-0 text-ember" />
            Honest by design: an injected wallet signs every tx, so the spend cap is a client-side guardrail and each
            action needs your one-click confirm. Nothing is custodied or auto-signed.
          </div>
        </div>
      </Panel>

      <Panel label="Auto-Pilot activity">
        {log.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Bot size={20} className="text-dim" />
            <p className="text-sm text-dim">No autonomous actions yet. Configure a strategy and press Start.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {log.map((e, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-panel-2">
                <span className="tnum w-16 shrink-0 font-mono text-[11px] text-dim">
                  {new Date(e.ts).toLocaleTimeString("en-US", { hour12: false })}
                </span>
                <span className="min-w-0 flex-1 truncate text-muted">{e.text}</span>
                {e.tx && (
                  <a
                    href={`${liteforge.blockExplorers.default.url}/tx/${e.tx}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex shrink-0 items-center gap-1 font-mono text-[11px] text-ember hover:underline"
                  >
                    {shortAddr(e.tx)} <ExternalLink size={11} />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function StrategyCard({
  active,
  icon: Icon,
  title,
  desc,
  onClick,
}: {
  active: boolean;
  icon: typeof Bot;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-1.5 rounded-xl border p-3.5 text-left transition-all",
        active ? "border-ember bg-ember-soft text-ember" : "border-border bg-bg text-text hover:border-border-strong"
      )}
    >
      <Icon size={18} className={active ? "text-ember" : "text-dim"} />
      <span className="text-sm font-medium">{title}</span>
      <span className="text-[11px] text-dim">{desc}</span>
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function NumberInput({ value, onChange, step }: { value: number; onChange: (n: number) => void; step: string }) {
  return (
    <input
      type="number"
      min="0"
      step={step}
      value={value}
      onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      className="tnum h-10 w-full rounded-lg border border-border bg-bg px-3 font-mono text-sm outline-none transition-colors focus:border-ember"
    />
  );
}
