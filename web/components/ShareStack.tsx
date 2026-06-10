"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useVault } from "@/hooks/useVault";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { useMissions } from "@/hooks/useMissions";
import { Mode } from "@/lib/contracts";
import { fmtNum, shortAddr } from "@/lib/format";
import { HALVING_LABEL, daysToHalving } from "@/lib/halving";
import { cn } from "@/lib/cn";
import { Flame, Share2, X, Trophy, TrendingUp, Shield, Copy, Check, Target } from "lucide-react";

/** Header button that opens a screenshot-ready "Stack Card" with one-click sharing. */
export function ShareStackButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm text-muted transition-colors hover:border-ember hover:text-ember"
        title="Share your stack"
      >
        <Share2 size={14} />
        <span className="hidden sm:inline">Share</span>
      </button>
      {open && <ShareModal onClose={() => setOpen(false)} />}
    </>
  );
}

function ShareModal({ onClose }: { onClose: () => void }) {
  const { address } = useAccount();
  const v = useVault();
  const { username } = useMissions();
  const { rows } = useLeaderboard("xp");
  const [copied, setCopied] = useState(false);

  const s = v.state;
  const total = s?.total ?? 0;
  const projected = s?.projected ?? total;
  const isGrow = s?.mode === Mode.Grow;
  const days = s?.daysToHalving || daysToHalving();
  const goal = s?.goal ?? 0;
  const progress = goal > 0 ? Math.min(100, (total / goal) * 100) : 0;

  const rankIdx = address ? rows.findIndex((r) => r.address.toLowerCase() === address.toLowerCase()) : -1;
  const rank = rankIdx >= 0 ? rankIdx + 1 : null;
  const name = username || shortAddr(address);

  const shareText =
    `I'm stacking ${fmtNum(total, 2)} zkLTC toward the Litecoin halving on ForgeMind 🔥` +
    (rank ? ` · ranked #${rank}` : "") +
    ` · projected ~${fmtNum(projected, 2)} by ${HALVING_LABEL}. Are you on pace?`;
  const shareUrl = typeof window !== "undefined" ? window.location.origin : "";
  const xHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${shareText} ${shareUrl}`.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="w-full max-w-md animate-rise-in" onClick={(e) => e.stopPropagation()}>
        {/* The card */}
        <div className="relative overflow-hidden rounded-2xl border border-ember/30 bg-gradient-to-br from-panel to-bg p-6 shadow-2xl">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-ember/20 blur-3xl" />
          <button onClick={onClose} className="absolute right-3 top-3 text-dim transition-colors hover:text-text">
            <X size={16} />
          </button>

          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-ember-bright to-ember-deep text-black">
              <Flame size={16} />
            </div>
            <div className="leading-none">
              <div className="text-sm font-semibold tracking-tight">ForgeMind</div>
              <div className="label mt-1">zkLTC stack card</div>
            </div>
            <span
              className={cn(
                "ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                isGrow ? "bg-ember-soft text-ember" : "bg-panel-2 text-muted"
              )}
            >
              {isGrow ? <TrendingUp size={10} /> : <Shield size={10} />}
              {isGrow ? "Grow" : "Stack"}
            </span>
          </div>

          <div className="mt-5">
            <div className="label">{name}&apos;s stack</div>
            <div className="tnum mt-1 font-mono text-4xl font-semibold tracking-tight">
              {fmtNum(total, 2)} <span className="text-lg text-dim">zkLTC</span>
            </div>
          </div>

          {goal > 0 && (
            <div className="mt-4 space-y-1.5">
              <div className="flex justify-between text-[11px] text-dim">
                <span className="flex items-center gap-1">
                  <Target size={11} /> Halving goal
                </span>
                <span className="tnum">
                  {fmtNum(total, 0)} / {fmtNum(goal, 0)} zkLTC
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-bg">
                <div className="h-full bg-gradient-to-r from-ember-deep to-ember-bright" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          <div className="mt-5 grid grid-cols-3 gap-3">
            <Metric icon={Trophy} label="Rank" value={rank ? `#${rank}` : "-"} />
            <Metric icon={TrendingUp} label="Projected" value={fmtNum(projected, 1)} />
            <Metric icon={Flame} label="Halving in" value={`${days}d`} />
          </div>

          <div className="mt-5 border-t border-border pt-3 text-center text-[10px] text-dim">
            AI-guarded zkLTC vault · LiteForge testnet · {HALVING_LABEL} halving
          </div>
        </div>

        {/* Actions */}
        <div className="mt-3 flex gap-2">
          <a
            href={xHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-ember py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            <Share2 size={15} /> Share on X
          </a>
          <button
            onClick={copy}
            className="flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm text-muted transition-colors hover:border-ember hover:text-ember"
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="mt-2 text-center text-[10px] text-dim">Tip: screenshot the card to post the visual too.</p>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Flame; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg p-2.5 text-center">
      <Icon size={13} className="mx-auto text-ember" />
      <div className="tnum mt-1 font-mono text-sm font-semibold text-text">{value}</div>
      <div className="label mt-0.5">{label}</div>
    </div>
  );
}
