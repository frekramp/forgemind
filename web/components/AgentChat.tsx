"use client";

import { useEffect, useRef, useState } from "react";
import { Panel } from "./ui/panel";
import { Button } from "./ui/button";
import { Mode } from "@/lib/contracts";
import type { useVault } from "@/hooks/useVault";
import type { ActionLog } from "@/hooks/useActionLog";
import type { AgentAction, ChatMessage, AutoPilotStrategy, TraceStep } from "@/lib/agent";
import { engineFromString, kindForAction } from "@/lib/actionlog";
import { chatOpeningInsight } from "@/lib/insight";
import { toWei } from "@/lib/format";
import { useDemoMode } from "./DemoProvider";
import { Send, Loader2, Check, BrainCircuit, ChevronDown, ChevronUp, Cog, ShieldCheck, TrendingUp, Target, Bot } from "lucide-react";
import { cn } from "@/lib/cn";

const CHIPS = ["How safe is my stack?", "Am I on pace?", "Switch to Grow", "Claim my yield"];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Demo mode reasons over the on-screen demo numbers (chain reads would be empty for the demo address).
function demoStateOverride(s: ReturnType<typeof useVault>["state"]) {
  if (!s) return undefined;
  return {
    mode: s.mode === Mode.Grow ? "grow" : "stack",
    stack: s.stack,
    growPrincipal: s.growPrincipal,
    pendingYield: s.pendingYield,
    total: s.total,
    goal: s.goal,
    daysToHalving: s.daysToHalving,
    projected: s.projected,
  };
}

export function AgentChat({
  v,
  record,
  onAutoPilot,
}: {
  v: ReturnType<typeof useVault>;
  record?: ActionLog["record"];
  onAutoPilot?: (strategy: AutoPilotStrategy, cap: number) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "I'm your Forge Guardian. Ask me to audit your stack, switch modes, set a halving goal, or move zkLTC. I'll prepare the transaction for you to sign.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [engine, setEngine] = useState<"claude" | "rules" | null>(null);
  // Transient "streaming reveal": the agent's steps cascade in, then the answer types out.
  const [reveal, setReveal] = useState<{ steps: TraceStep[]; text: string } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const greeted = useRef<string | undefined>(undefined);
  const { isDemo } = useDemoMode();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy, reveal]);

  // Proactive: once a wallet connects and on-chain state loads, the Guardian speaks first
  // with a personalized insight - but only if the user hasn't started the conversation.
  useEffect(() => {
    if (!v.address || !v.state) return;
    if (greeted.current === v.address) return;
    greeted.current = v.address;
    const insight = chatOpeningInsight(v.state);
    setMessages((m) => (m.some((x) => x.role === "user") ? m : [{ role: "assistant", content: insight }]));
  }, [v.address, v.state]);

  async function send(text: string) {
    if (!text.trim() || busy || reveal) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map(({ role, content }) => ({ role, content })),
          address: v.address,
          stateOverride: isDemo ? demoStateOverride(v.state) : undefined,
        }),
      });
      const data = await res.json();
      if (data.engine) setEngine(data.engine);
      setBusy(false);
      await playReveal(data);
    } catch {
      setBusy(false);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            "I couldn't reach the agent just now. Your vault and funds are untouched. Try again in a moment, or use the Vault panel directly.",
        },
      ]);
    }
  }

  // Reveal the response progressively: cascade the reasoning steps, then type the answer.
  async function playReveal(data: { text?: string; actions?: AgentAction[]; trace?: TraceStep[] }) {
    const steps = data.trace ?? [];
    const full = data.text ?? "Done. Check the dashboard.";
    setReveal({ steps: [], text: "" });
    for (let i = 0; i < steps.length; i++) {
      await sleep(steps[i].kind === "read" ? 380 : 260);
      setReveal({ steps: steps.slice(0, i + 1), text: "" });
    }
    if (steps.length) await sleep(220);
    const words = full.split(/(\s+)/);
    let acc = "";
    for (const w of words) {
      acc += w;
      await sleep(w.trim() ? 24 : 0);
      setReveal({ steps, text: acc });
    }
    await sleep(120);
    setMessages((m) => [...m, { role: "assistant", content: full, actions: data.actions, trace: steps }]);
    setReveal(null);
  }

  async function runAction(a: AgentAction) {
    try {
      let amountWei = 0n;
      if (a.type === "deposit") {
        amountWei = toWei(a.amount);
        await v.deposit(a.amount);
      } else if (a.type === "withdraw") {
        amountWei = toWei(a.amount);
        await v.withdraw(a.amount);
      } else if (a.type === "setMode") await v.setMode(a.mode as Mode);
      else if (a.type === "setGoal") {
        amountWei = toWei(a.amount);
        await v.setGoal(a.amount);
      } else if (a.type === "claimYield") await v.claimYield();
      else if (a.type === "enableAutoPilot") {
        onAutoPilot?.(a.strategy, Number(a.cap) || 5);
      }

      // Notarize the agent's decision on-chain (separate, user-signed tx). No-op when
      // ForgeActionLog isn't deployed or the user turned notarizing off.
      const kind = kindForAction(a);
      if (kind !== null) {
        try {
          await record?.(kind, engineFromString(engine), amountWei, a.label);
        } catch {
          /* notarize rejected - the action itself already went through */
        }
      }
    } catch {
      /* user rejected */
    }
  }

  const busyTx = v.txPending || v.txConfirming;

  return (
    <Panel
      label="Forge Guardian"
      right={
        <span
          className="flex items-center gap-1.5 text-[11px] text-dim"
          title="The guardian is ready to chat and prepare transactions you sign."
        >
          <span className="h-1.5 w-1.5 rounded-full bg-gain animate-pulse-ember" />
          ready
        </span>
      }
      className="flex h-full flex-col"
      bodyClassName="flex flex-1 flex-col p-0 min-h-0"
    >
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {messages.map((m, i) => (
          <div key={i} className={cn("flex animate-rise-in flex-col gap-2", m.role === "user" ? "items-end" : "items-start")}>
            <div
              className={cn(
                "max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                m.role === "user" ? "bg-panel-2 text-text" : "border border-border bg-bg text-text"
              )}
            >
              {m.content}
            </div>
            {m.role === "assistant" && m.trace && m.trace.length > 0 && <ReasoningTrace steps={m.trace} />}
            {m.actions && m.actions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {m.actions.map((a, j) => (
                  <button
                    key={j}
                    onClick={() => runAction(a)}
                    disabled={busyTx}
                    className="flex items-center gap-1.5 rounded-lg border border-ember/40 bg-ember-soft px-3 py-1.5 text-xs font-medium text-ember transition-colors hover:bg-ember/15 disabled:opacity-50"
                  >
                    <Check size={12} /> {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {/* Before the first user turn, fill the panel with tappable capabilities instead of dead space. */}
        {!messages.some((m) => m.role === "user") && !busy && !reveal && <WelcomeCard onPick={send} />}
        {busy && !reveal && (
          <div className="flex items-center gap-2 text-xs text-dim">
            <Loader2 size={12} className="animate-spin" /> thinking…
          </div>
        )}
        {reveal && (
          <div className="flex animate-rise-in flex-col items-start gap-2">
            {reveal.steps.length > 0 && <LiveTrace steps={reveal.steps} typing={reveal.text.length > 0} />}
            {reveal.text && (
              <div className="max-w-[90%] rounded-2xl border border-border bg-bg px-3.5 py-2.5 text-sm leading-relaxed text-text">
                {reveal.text}
                <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse-ember bg-ember align-middle" />
              </div>
            )}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="space-y-3 border-t border-border p-4">
        <div className="flex flex-wrap gap-1.5">
          {CHIPS.map((c) => (
            <button
              key={c}
              onClick={() => send(c)}
              disabled={busy || !!reveal}
              className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-ember hover:text-ember disabled:opacity-40"
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
            placeholder="Ask your guardian…"
            className="h-10 flex-1 rounded-lg border border-border bg-bg px-3 text-sm outline-none transition-colors focus:border-ember placeholder:text-dim"
          />
          <Button size="icon" onClick={() => send(input)} disabled={busy || !!reveal || !input.trim()}>
            <Send size={15} />
          </Button>
        </div>
      </div>
    </Panel>
  );
}

const CAPS = [
  { icon: ShieldCheck, title: "Audit your stack", desc: "Check if you're on pace for the halving", prompt: "How safe is my stack, and am I on pace for the halving?" },
  { icon: TrendingUp, title: "Switch modes", desc: "Move between Stack and Grow, on-chain", prompt: "Should I switch to Grow?" },
  { icon: Target, title: "Set a halving goal", desc: "Target a zkLTC balance", prompt: "Help me set a sensible halving goal." },
  { icon: Bot, title: "Go autonomous", desc: "Delegate to a 24/7 keeper", prompt: "Set up Auto-Pilot to compound for me." },
] as const;

/** Welcome state: turns the empty chat into a guided, tappable capability list so the
 *  panel never reads as dead space and judges instantly know what to ask. */
function WelcomeCard({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="animate-rise-in space-y-2 pt-1">
      <div className="label px-1">What I can do</div>
      {CAPS.map((c) => (
        <button
          key={c.title}
          onClick={() => onPick(c.prompt)}
          className="group flex w-full items-center gap-3 rounded-xl border border-border bg-panel-2/30 px-3.5 py-2.5 text-left transition-colors hover:border-ember/40 hover:bg-panel-2/60"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border bg-bg text-ember transition-colors group-hover:border-ember/40">
            <c.icon size={15} />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-medium text-text">{c.title}</span>
            <span className="block truncate text-[11px] text-dim">{c.desc}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** The live, expanded reasoning view shown while the response streams in -
 *  steps cascade in, the latest one pulses until the next arrives or the answer types. */
function LiveTrace({ steps, typing }: { steps: TraceStep[]; typing: boolean }) {
  return (
    <div className="max-w-[90%] rounded-xl border border-border bg-panel-2/40 px-3 py-2">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-dim">
        <BrainCircuit size={11} className="text-ember" /> reasoning
      </div>
      <div className="space-y-1">
        {steps.map((st, i) => {
          const active = !typing && i === steps.length - 1;
          return (
            <div key={i} className="flex items-start gap-2 text-[11px] leading-snug">
              {active ? (
                <Cog size={11} className="mt-0.5 shrink-0 animate-spin text-ember" />
              ) : (
                <Check size={11} className="mt-0.5 shrink-0 text-gain" />
              )}
              <div className="min-w-0">
                <span className="text-muted">{st.label}</span>
                {st.detail && <span className="ml-1 text-dim">· {st.detail}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Collapsible view of the agent's tool-by-tool reasoning - makes the multi-step,
 *  read-then-act loop visible instead of hiding it behind the final answer. */
function ReasoningTrace({ steps }: { steps: TraceStep[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="max-w-[90%]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-[10px] font-medium text-dim transition-colors hover:text-muted"
      >
        <BrainCircuit size={11} className="text-ember" />
        {steps.length} reasoning step{steps.length > 1 ? "s" : ""}
        {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
      </button>
      {open && (
        <div className="mt-1.5 space-y-1.5 border-l border-border pl-3">
          {steps.map((st, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px] leading-snug">
              <span
                className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", st.kind === "read" ? "bg-dim" : "bg-ember")}
              />
              <div className="min-w-0">
                <span className="text-muted">{st.label}</span>
                {st.detail && <span className="ml-1 text-dim">· {st.detail}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
