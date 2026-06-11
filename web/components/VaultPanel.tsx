"use client";

import { useState, type ReactNode } from "react";
import { Panel } from "./ui/panel";
import { Button } from "./ui/button";
import { ModeToggle } from "./ModeToggle";
import { Mode } from "@/lib/contracts";
import { fmtNum } from "@/lib/format";
import { useCountUp } from "@/hooks/useCountUp";
import type { useVault } from "@/hooks/useVault";
import { cn } from "@/lib/cn";
import { ArrowDownLeft, ArrowUpRight, Coins, Info, Loader2, Shield, TrendingUp } from "lucide-react";

async function safe(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch {
    /* user rejected / surfaced via tx state */
  }
}

export function VaultPanel({ v }: { v: ReturnType<typeof useVault> }) {
  const s = v.state;
  const [dep, setDep] = useState("");
  const [wd, setWd] = useState("");
  const busy = v.txPending || v.txConfirming;
  const isGrow = s?.mode === Mode.Grow;
  const total = s?.total ?? 0;
  const totalAnim = useCountUp(total);
  const pending = s?.pendingYield ?? 0;
  const withdrawable = isGrow ? s?.growPrincipal ?? 0 : s?.stack ?? 0;

  return (
    <Panel
      label="Your Vault"
      right={
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
            isGrow ? "bg-ember-soft text-ember" : "bg-panel-2 text-muted"
          )}
        >
          {isGrow ? <TrendingUp size={12} /> : <Shield size={12} />}
          {isGrow ? "Grow mode" : "Stack mode"}
        </span>
      }
    >
      <div className="space-y-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="label">Total balance</div>
            <div className="tnum mt-1.5 font-mono text-[42px] font-semibold leading-none tracking-tight">
              {fmtNum(totalAnim, 4)} <span className="text-lg text-dim">zkLTC</span>
            </div>
            <div className="mt-2 text-xs text-muted">
              {isGrow
                ? `${fmtNum(withdrawable, 2)} zkLTC deposited, plus ${fmtNum(pending, 4)} yield earned so far`
                : "Held safely. Switch to Grow to start compounding."}
            </div>
          </div>
          {isGrow && pending > 0 && (
            <button
              onClick={() => safe(v.claimYield)}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg border border-gain/30 bg-gain/5 px-3 py-2 text-sm text-gain transition-colors hover:bg-gain/10 disabled:opacity-50"
            >
              <Coins size={14} /> Claim +{fmtNum(pending, 4)}
            </button>
          )}
        </div>

        <ModeToggle mode={s?.mode ?? Mode.Stack} disabled={busy} onChange={(m) => safe(() => v.setMode(m))} />

        {/* Where the 5% comes from - answers the "is this real yield?" question up front. */}
        <div className="flex items-start gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-[11px] leading-relaxed text-dim">
          <Info size={13} className="mt-0.5 shrink-0 text-ember" />
          <span>
            <span className="text-text">The 5% is simulated</span> on testnet, paid from a pre-funded reward pool (not
            real revenue). On mainnet the vault plugs into a real yield source (lending interest, LP fees, or liquid
            staking) through a swappable strategy. Your principal is always custodied <span className="text-text">1:1</span>.
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <AmountBox
            label="Deposit"
            value={dep}
            onChange={setDep}
            max={v.walletBalance}
            onMax={() => setDep(String(v.walletBalance))}
            cta={
              <Button
                size="sm"
                className="w-full"
                disabled={busy || !Number(dep)}
                onClick={() => safe(async () => { await v.deposit(dep); setDep(""); })}
              >
                <ArrowDownLeft size={14} /> Deposit
              </Button>
            }
          />
          <AmountBox
            label="Withdraw"
            value={wd}
            onChange={setWd}
            max={withdrawable}
            onMax={() => setWd(String(withdrawable))}
            cta={
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={busy || !Number(wd)}
                onClick={() => safe(async () => { await v.withdraw(wd); setWd(""); })}
              >
                <ArrowUpRight size={14} /> Withdraw
              </Button>
            }
          />
        </div>

        {withdrawable > 0 && (
          <button
            onClick={() => safe(async () => { await v.withdrawAll(); setWd(""); })}
            disabled={busy}
            className="w-full rounded-lg border border-border bg-bg py-2 text-xs text-muted transition-colors hover:border-ember hover:text-ember disabled:opacity-50"
          >
            Withdraw everything ({fmtNum(withdrawable, 2)} zkLTC
            {isGrow && pending > 0 ? ` plus ${fmtNum(pending, 4)} yield` : ""}) back to my wallet
          </button>
        )}

        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted">
            <Loader2 size={12} className="animate-spin" />
            {v.txConfirming ? "Confirming on-chain…" : "Awaiting wallet signature…"}
          </div>
        )}
      </div>
    </Panel>
  );
}

function AmountBox({
  label,
  value,
  onChange,
  max,
  onMax,
  cta,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  onMax: () => void;
  cta: ReactNode;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-bg p-3 transition-colors focus-within:border-border-strong">
      <div className="flex items-center justify-between">
        <span className="label">{label}</span>
        <button onClick={onMax} className="text-[10px] text-dim transition-colors hover:text-ember">
          max {fmtNum(max, 6)}
        </button>
      </div>
      <input
        inputMode="decimal"
        value={value}
        placeholder="Enter an amount"
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
        className="tnum w-full bg-transparent font-mono text-lg text-text outline-none placeholder:font-sans placeholder:text-sm placeholder:text-dim"
      />
      {cta}
    </div>
  );
}
