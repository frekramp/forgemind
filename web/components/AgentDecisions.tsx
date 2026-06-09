"use client";

import { useEffect, useState } from "react";
import { getAddress, parseEther } from "viem";
import { Panel } from "./ui/panel";
import type { ActionLog } from "@/hooks/useActionLog";
import { ActionEngine, ActionKind, ENGINE_LABEL, KIND_LABEL, type DecisionEntry } from "@/lib/actionlog";
import { recoverDecisionSigner } from "@/lib/attest";
import { shortAddr, fmtNum } from "@/lib/format";
import { liteforge } from "@/lib/chains";
import { cn } from "@/lib/cn";
import {
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  Coins,
  Target,
  Award,
  Repeat,
  Sparkles,
  Cog,
  Hand,
  BrainCircuit,
  ExternalLink,
  Fingerprint,
  Loader2,
  ShieldCheck,
  Link as LinkIcon,
  type LucideIcon,
} from "lucide-react";

const KIND_ICON: Record<ActionKind, LucideIcon> = {
  [ActionKind.Deposit]: ArrowDownLeft,
  [ActionKind.Withdraw]: ArrowUpRight,
  [ActionKind.SetMode]: TrendingUp,
  [ActionKind.ClaimYield]: Coins,
  [ActionKind.SetGoal]: Target,
  [ActionKind.ClaimMission]: Award,
  [ActionKind.AutoCompound]: Repeat,
  [ActionKind.AutoDCA]: Repeat,
};

const ENGINE_STYLE: Record<ActionEngine, { icon: LucideIcon; cls: string }> = {
  [ActionEngine.Claude]: { icon: Sparkles, cls: "border-ember/40 bg-ember-soft text-ember" },
  [ActionEngine.Rules]: { icon: Cog, cls: "border-border bg-bg text-muted" },
  [ActionEngine.Manual]: { icon: Hand, cls: "border-border bg-bg text-dim" },
};

function ago(tsSec: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - tsSec);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function AgentDecisions({ al }: { al: ActionLog }) {
  // `deployed` comes from the hook: true on a real deployment AND in demo mode (where it
  // serves demoDecisions). Gating on the static contract flag would blank the demo.
  const { entries, isLoading, deployed, notarize, setNotarize } = al;

  return (
    <Panel
      label="Agent Decisions"
      right={
        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-dim">
          <span>Notarize on-chain</span>
          <button
            type="button"
            role="switch"
            aria-checked={notarize}
            onClick={() => setNotarize(!notarize)}
            className={cn(
              "relative h-4 w-7 rounded-full transition-colors",
              notarize ? "bg-ember" : "bg-border"
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-3 w-3 rounded-full bg-bg transition-transform",
                notarize ? "translate-x-3.5" : "translate-x-0.5"
              )}
            />
          </button>
        </label>
      }
    >
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-[11px] leading-relaxed text-dim">
          <BrainCircuit size={14} className="mt-0.5 shrink-0 text-ember" />
          <span>
            Every move the guardian makes is written on-chain with the engine that decided it
            (<span className="text-ember">Claude</span> vs. rule-based) and a reason — a verifiable trail of{" "}
            <span className="text-text">why</span>, paired with the vault&apos;s record of <span className="text-text">what</span>.
            Autonomous keeper moves are signed by the agent&apos;s key and{" "}
            <span className="inline-flex items-center gap-0.5 text-gain"><ShieldCheck size={11} /> verified</span> on-chain — proof, not a claim.
          </span>
        </div>

        {!deployed ? (
          <NotDeployed />
        ) : (
          <div className="space-y-1">
            {isLoading && entries.length === 0 && <Empty text="Reading the on-chain decision ledger…" />}
            {!isLoading && entries.length === 0 && (
              <Empty text="No agent decisions yet — ask the guardian to act, then confirm." />
            )}
            {entries.map((e, i) => (
              <Row key={`${e.timestamp}-${e.actor}-${i}`} e={e} />
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

function Row({ e }: { e: DecisionEntry }) {
  const [showVerify, setShowVerify] = useState(false);
  const KIcon = KIND_ICON[e.kind] ?? Cog;
  const eng = ENGINE_STYLE[e.engine] ?? ENGINE_STYLE[ActionEngine.Manual];
  const EIcon = eng.icon;
  const amount = e.amount > 0 ? `${fmtNum(e.amount, 2)} zkLTC` : "";
  const explorer = liteforge.blockExplorers.default.url;
  return (
    <div className="flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-panel-2">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border bg-bg text-muted">
        <KIcon size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text">{KIND_LABEL[e.kind] ?? "Action"}</span>
          {amount && <span className="tnum font-mono text-xs text-ember">{amount}</span>}
          <span
            className={cn(
              "ml-auto flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
              eng.cls
            )}
          >
            <EIcon size={10} /> {ENGINE_LABEL[e.engine] ?? "Manual"}
          </span>
          {e.attested && (
            <button
              type="button"
              onClick={() => setShowVerify((v) => !v)}
              title="Cryptographically verified — signed by the agent's trusted key, checked in logAttested(). Click to verify it yourself."
              className="flex shrink-0 items-center gap-1 rounded-md border border-gain/40 bg-gain/5 px-1.5 py-0.5 text-[10px] font-medium text-gain transition-colors hover:bg-gain/15"
            >
              <ShieldCheck size={10} /> Verified
            </button>
          )}
        </div>
        {e.reason && <p className="mt-0.5 truncate text-xs text-muted">{e.reason}</p>}

        {/* decision → outcome: the "why" tx, paired with the vault "what" tx */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-dim">
          <a
            href={`${explorer}/address/${e.actor}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono hover:text-ember hover:underline"
          >
            {shortAddr(e.actor)}
          </a>
          <span>·</span>
          <span className="tnum">{e.timestamp > 0 ? `${ago(e.timestamp)} ago` : "pending"}</span>
          {e.txHash && (
            <>
              <span>·</span>
              <a
                href={`${explorer}/tx/${e.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-0.5 text-ember hover:underline"
              >
                decision <ExternalLink size={9} />
              </a>
            </>
          )}
          {e.outcomeTx && (
            <a
              href={`${explorer}/tx/${e.outcomeTx}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-0.5 rounded border border-gain/30 bg-gain/5 px-1.5 py-0.5 text-gain hover:underline"
            >
              <LinkIcon size={9} /> settled{e.outcomeAmount && Number(e.outcomeAmount) > 0 ? ` ${fmtNum(Number(e.outcomeAmount), 2)}` : ""}
            </a>
          )}
        </div>
        {e.attested && showVerify && <VerifyPanel e={e} />}
      </div>
    </div>
  );
}

/** Cryptographic proof on demand. Demo entries carry a real signature → recover the signer
 *  in-browser and show it matches the agent key. Live entries were already enforced on-chain
 *  by logAttested(), so we link that tx instead (the signature isn't stored on-chain). */
function VerifyPanel({ e }: { e: DecisionEntry }) {
  const [st, setSt] = useState<{ status: "loading" | "ok" | "fail"; recovered?: string }>({ status: "loading" });
  const explorer = liteforge.blockExplorers.default.url;

  useEffect(() => {
    const a = e.attestation;
    if (!a) return;
    let cancelled = false;
    recoverDecisionSigner(
      {
        actionLog: getAddress(a.actionLog.toLowerCase()),
        chainId: a.chainId,
        actor: getAddress(e.actor.toLowerCase()),
        kind: e.kind,
        engine: e.engine,
        amount: parseEther(String(e.amount)),
        reason: e.reason,
        nonce: BigInt(a.nonce),
      },
      a.sig
    )
      .then((rec) => {
        if (!cancelled) setSt({ status: rec.toLowerCase() === a.signer.toLowerCase() ? "ok" : "fail", recovered: rec });
      })
      .catch(() => {
        if (!cancelled) setSt({ status: "fail" });
      });
    return () => {
      cancelled = true;
    };
  }, [e]);

  // Live entry (real chain): signature isn't stored on-chain, but the contract enforced it.
  if (!e.attestation) {
    return (
      <div className="mt-2 rounded-lg border border-gain/25 bg-gain/[0.06] px-3 py-2 text-[11px] leading-relaxed text-muted">
        <span className="font-medium text-gain">Verified on-chain.</span>{" "}
        <span className="font-mono text-text">logAttested()</span> recovered the agent&apos;s signature and rejected
        any mismatch before recording this decision.
        {e.txHash && (
          <>
            {" "}
            <a
              href={`${explorer}/tx/${e.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ember hover:underline"
            >
              view the logAttested tx →
            </a>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-border bg-bg px-3 py-2.5 text-[10px] leading-relaxed">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted">
        <Fingerprint size={12} className="text-ember" /> Verify attestation
      </div>
      {st.status === "loading" && (
        <div className="flex items-center gap-1.5 text-dim">
          <Loader2 size={11} className="animate-spin" /> recovering signer from the signature…
        </div>
      )}
      {st.status === "ok" && (
        <div className="space-y-1">
          <div className="text-dim">recovered signer (client-side ecrecover)</div>
          <div className="break-all font-mono text-text">{st.recovered}</div>
          <div className="flex items-start gap-1.5 text-gain">
            <ShieldCheck size={12} className="mt-px shrink-0" /> matches the ForgeMind agent key — proven in your
            browser, no server, no trust required.
          </div>
        </div>
      )}
      {st.status === "fail" && <div className="text-loss">Couldn&apos;t recover the expected signer.</div>}
    </div>
  );
}

function NotDeployed() {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <BrainCircuit size={20} className="text-dim" />
      <p className="text-sm text-dim">Decision ledger not configured.</p>
      <p className="max-w-sm text-[11px] text-dim">
        Deploy <code className="font-mono text-muted">ForgeActionLog</code> (via Dappit or{" "}
        <code className="font-mono text-muted">forge script</code>) and set{" "}
        <code className="font-mono text-muted">NEXT_PUBLIC_ACTIONLOG_ADDRESS</code>.
      </p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <Sparkles size={20} className="text-dim" />
      <p className="text-sm text-dim">{text}</p>
    </div>
  );
}
