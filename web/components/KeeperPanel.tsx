"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { Panel } from "./ui/panel";
import { Button } from "./ui/button";
import { useKeeper } from "@/hooks/useKeeper";
import type { useVault } from "@/hooks/useVault";
import { fmtNum, shortAddr, nowSec } from "@/lib/format";
import { liteforge } from "@/lib/chains";
import { cn } from "@/lib/cn";
import { Bot, Coins, Repeat, ShieldCheck, Zap, ExternalLink, Loader2, Power } from "lucide-react";

const DURATIONS = [
  { label: "1 day", secs: 86_400 },
  { label: "7 days", secs: 7 * 86_400 },
  { label: "30 days", secs: 30 * 86_400 },
];

type RunResult = { ran: number; actions: { user: string; action: string; txHash: string }[]; note?: string } | null;

/** On-chain autonomous keeper - grant a capped, revocable delegation that runs server-side
 *  24/7 (no browser, no per-tx clicks). This is what makes "AI agent" literally true. */
export function KeeperPanel({ v }: { v: ReturnType<typeof useVault> }) {
  const k = useKeeper();
  const { isConnected } = useAccount();
  // The delegation/run buttons can only do something with a wallet AND a keeper agent set on the
  // vault. Otherwise they'd be clickable but silently no-op - so we disable + explain instead.
  const canDelegate = isConnected && k.agentConfigured;
  const [compound, setCompound] = useState(true);
  const [rebalance, setRebalance] = useState(true);
  const [durIdx, setDurIdx] = useState(1);
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<RunResult>(null);

  const expiresIn = k.auth.expiry > 0 ? Math.max(0, k.auth.expiry - nowSec()) : 0;
  const expiryLabel = expiresIn > 86400 ? `${Math.floor(expiresIn / 86400)}d` : `${Math.floor(expiresIn / 3600)}h`;

  async function runKeeper() {
    setRunning(true);
    try {
      const res = await fetch("/api/keeper", { method: "POST" });
      setRun(await res.json());
    } catch {
      setRun({ ran: 0, actions: [], note: "Keeper unreachable." });
    } finally {
      setRunning(false);
    }
  }

  return (
    <Panel
      label="Autonomous Keeper"
      right={
        <span className={cn("flex items-center gap-1.5 text-[11px]", k.active ? "text-gain" : "text-dim")}>
          <span className={cn("h-1.5 w-1.5 rounded-full", k.active ? "bg-gain animate-pulse-ember" : "bg-dim")} />
          {k.active ? "delegated · live" : "not delegated"}
        </span>
      }
    >
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-muted">
          Grant the agent an <span className="text-text">on-chain delegation</span> and it runs server-side 24/7,
          auto-compounding yield and rebalancing toward your goal with <span className="text-text">no browser open and no
          per-tx clicks</span>. Capped by an expiry, revocable instantly, and it can only ever move your own funds.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Toggle
            active={compound}
            icon={Coins}
            title="Auto-compound"
            desc="Claim yield once it builds up."
            onClick={() => setCompound((x) => !x)}
          />
          <Toggle
            active={rebalance}
            icon={Repeat}
            title="Auto-rebalance"
            desc="Move to Grow when behind goal."
            onClick={() => setRebalance((x) => !x)}
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="label">Until</span>
          <div className="flex gap-1 rounded-lg border border-border bg-bg p-0.5">
            {DURATIONS.map((d, i) => (
              <button
                key={d.label}
                onClick={() => setDurIdx(i)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                  durIdx === i ? "bg-panel-2 text-ember" : "text-dim hover:text-text"
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {k.active && (
          <div className="flex items-center justify-between rounded-lg border border-gain/25 bg-gain/5 px-3 py-2 text-xs">
            <span className="flex items-center gap-1.5 text-gain">
              <ShieldCheck size={13} /> Delegated: {k.auth.compound && "compound"}
              {k.auth.compound && k.auth.rebalance && " + "}
              {k.auth.rebalance && "rebalance"} · expires in {expiryLabel}
            </span>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={k.busy || (!compound && !rebalance) || !canDelegate}
            onClick={() => v && k.authorize(compound, rebalance, DURATIONS[durIdx].secs).catch(() => {})}
          >
            {k.busy ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            {k.active ? "Update delegation" : "Delegate to keeper"}
          </Button>
          {k.active && (
            <Button size="sm" variant="outline" disabled={k.busy || !canDelegate} onClick={() => k.revoke().catch(() => {})}>
              <Power size={14} /> Revoke
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={running || !canDelegate} onClick={runKeeper}>
            {running ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
            Run keeper now
          </Button>
        </div>

        {!canDelegate && (
          <div className="flex items-start gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-[11px] leading-relaxed text-dim">
            <ShieldCheck size={13} className="mt-0.5 shrink-0 text-ember" />
            {!isConnected
              ? "Connect a wallet to delegate the keeper. The 'delegated' status above shows how an active grant looks in the demo."
              : "The autonomous keeper isn't activated on this testnet deployment yet. Explore the demo to see a live delegation in action."}
          </div>
        )}

        {run && (
          <div className="rounded-lg border border-border bg-bg p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted">
              <Bot size={13} className="text-ember" />
              {run.note ? run.note : `Keeper tick: ${run.ran} action${run.ran === 1 ? "" : "s"}.`}
            </div>
            <div className="space-y-1">
              {run.actions.map((a, i) => (
                <a
                  key={i}
                  href={`${liteforge.blockExplorers.default.url}/tx/${a.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-[11px] text-dim hover:text-ember"
                >
                  <span className="font-mono">{shortAddr(a.user)}</span>
                  <span className="text-muted">{a.action}</span>
                  <ExternalLink size={10} className="ml-auto" />
                </a>
              ))}
            </div>
          </div>
        )}

        {v.state && (
          <p className="text-[11px] text-dim">
            Right now the keeper would{" "}
            {v.state.pendingYield >= 0.01
              ? `auto-compound ~${fmtNum(v.state.pendingYield, 4)} zkLTC`
              : "wait, yield below the 0.01 threshold"}
            .
          </p>
        )}
      </div>
    </Panel>
  );
}

function Toggle({
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
        "flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all",
        active ? "border-ember bg-ember-soft" : "border-border bg-bg hover:border-border-strong"
      )}
    >
      <Icon size={16} className={cn("mt-0.5", active ? "text-ember" : "text-dim")} />
      <div>
        <div className={cn("text-sm font-medium", active ? "text-ember" : "text-text")}>{title}</div>
        <div className="text-[11px] text-dim">{desc}</div>
      </div>
    </button>
  );
}
