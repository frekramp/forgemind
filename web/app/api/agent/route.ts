import { createPublicClient, http, formatEther, isAddress, zeroAddress, type Address } from "viem";
import { generateText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { liteforge } from "@/lib/chains";
import { forgeVaultAbi } from "@/lib/abi";
import { VAULT_ADDRESS, isVaultDeployed } from "@/lib/contracts";
import type { AgentAction, TraceStep } from "@/lib/agent";
import { HALVING_LABEL } from "@/lib/halving";
import { rateLimit, clientIp, originAllowed } from "@/lib/ratelimit";

export const maxDuration = 30;

// Public, unauthenticated endpoint that drives a paid LLM - guard it against cost-abuse.
const AGENT_RATE_LIMIT = 20; // requests
const AGENT_RATE_WINDOW_MS = 60_000; // per minute, per IP

const publicClient = createPublicClient({ chain: liteforge, transport: http() });

type State = {
  mode: "stack" | "grow";
  stack: number;
  growPrincipal: number;
  pendingYield: number;
  total: number;
  goal: number;
  daysToHalving: number;
  projected: number;
};

async function readState(user: Address): Promise<State | null> {
  if (!isVaultDeployed || user === zeroAddress) return null;
  try {
    const d = (await publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: forgeVaultAbi,
      functionName: "getVaultState",
      args: [user],
    })) as readonly [number, bigint, bigint, bigint, bigint, bigint, bigint, bigint];
    if (!Array.isArray(d) || d.length < 8) return null; // guard against ABI drift / bad RPC data
    return {
      mode: Number(d[0]) === 1 ? "grow" : "stack",
      stack: +formatEther(d[1]),
      growPrincipal: +formatEther(d[2]),
      pendingYield: +formatEther(d[3]),
      total: +formatEther(d[4]),
      goal: +formatEther(d[5]),
      daysToHalving: Number(d[6]),
      projected: +formatEther(d[7]),
    };
  } catch {
    return null;
  }
}

const SYSTEM = `You are Forge Guardian, an on-chain AI agent that manages a user's zkLTC smart vault on LiteForge (Litecoin's EVM testnet).

The vault has two modes:
- Stack: zkLTC held safely in the vault.
- Grow: zkLTC deployed to a yield strategy earning a SIMULATED ~5% APY (paid from a testnet reward pool; principal is always custodied 1:1). Always be honest that testnet yield is simulated.

The user is stacking toward the next Litecoin halving (around ${HALVING_LABEL}). You help them set a goal, stay on pace, deposit, switch modes, and optionally run Auto-Pilot.

Auto-Pilot runs autonomously on a timer and acts on-chain (the user still confirms each tx): "compound" auto-claims yield past a threshold; "dca" deposits a fixed amount on a schedule with a session spend cap.

Rules:
- ALWAYS call getVaultState before answering anything about balances, safety, pace, or projections. Never guess numbers.
- To take an action, call the matching propose* tool. This PREPARES something the user confirms in their own wallet; you never move funds yourself. After proposing, tell the user to confirm.
- A goal must exceed the user's current balance.

Voice (important, the user is picky about this):
- Talk like a sharp, friendly human analyst, not a product tour or a salesperson. Plain sentences, real numbers, zkLTC to ~2 decimals.
- Keep replies to 2-4 sentences, even for open questions like "how do I get started": give a quick orientation and suggest ONE concrete first step, never a 5-step checklist.
- Never use an em-dash, en-dash, or a spaced hyphen to join clauses or as a bullet. Write separate sentences, or use commas or parentheses.
- Do not use numbered lists, bullet points, or bold section headers unless the user explicitly asks for a list. No emoji.`;

function buildTools(getState: () => Promise<State | null>, actions: AgentAction[]) {
  return {
    getVaultState: tool({
      description:
        "Read the user's live on-chain vault state: mode, stack/grow balances, pending simulated yield, halving goal, days to halving, and projected stack.",
      inputSchema: z.object({}),
      execute: async () => (await getState()) ?? { note: "Vault not deployed or wallet not connected." },
    }),
    proposeDeposit: tool({
      description: "Prepare a deposit of zkLTC into the vault.",
      inputSchema: z.object({ amount: z.string().describe("zkLTC amount, e.g. '10'") }),
      execute: async ({ amount }) => {
        actions.push({ type: "deposit", amount, label: `Deposit ${amount} zkLTC` });
        return { prepared: true };
      },
    }),
    proposeWithdraw: tool({
      description: "Prepare a withdrawal of zkLTC from the vault.",
      inputSchema: z.object({ amount: z.string() }),
      execute: async ({ amount }) => {
        actions.push({ type: "withdraw", amount, label: `Withdraw ${amount} zkLTC` });
        return { prepared: true };
      },
    }),
    proposeSetMode: tool({
      description: "Prepare switching vault mode. 'grow' deploys funds for simulated yield; 'stack' holds safely.",
      inputSchema: z.object({ mode: z.enum(["stack", "grow"]) }),
      execute: async ({ mode }) => {
        actions.push({ type: "setMode", mode: mode === "grow" ? 1 : 0, label: `Switch to ${mode} mode` });
        return { prepared: true };
      },
    }),
    proposeSetGoal: tool({
      description: "Prepare setting the user's halving goal in zkLTC (must exceed current balance).",
      inputSchema: z.object({ amount: z.string() }),
      execute: async ({ amount }) => {
        actions.push({ type: "setGoal", amount, label: `Set halving goal to ${amount} zkLTC` });
        return { prepared: true };
      },
    }),
    proposeClaimYield: tool({
      description: "Prepare claiming the user's accrued simulated yield.",
      inputSchema: z.object({}),
      execute: async () => {
        actions.push({ type: "claimYield", label: "Claim simulated yield" });
        return { prepared: true };
      },
    }),
    proposeAutoPilot: tool({
      description:
        "Configure the autonomous Auto-Pilot. strategy 'compound' auto-claims yield; 'dca' auto-deposits on a schedule; 'off' disables. cap = session spend cap in zkLTC.",
      inputSchema: z.object({
        strategy: z.enum(["compound", "dca", "off"]),
        cap: z.string().describe("session spend cap in zkLTC, e.g. '5'"),
      }),
      execute: async ({ strategy, cap }) => {
        actions.push({ type: "enableAutoPilot", strategy, cap, label: `Auto-Pilot: ${strategy}` });
        return { prepared: true };
      },
    }),
  };
}

// ---- reasoning-trace helpers (surface the agent's multi-step tool use to the UI) ----

function summarizeState(s: State): string {
  const mode = s.mode === "grow" ? "Grow" : "Stack";
  const goal = s.goal > 0 ? `goal ${s.goal.toFixed(0)}` : "no goal";
  return `${mode} · ${s.total.toFixed(2)} zkLTC · ${goal} · ${s.daysToHalving}d to halving`;
}

function traceStepForTool(name: string, input: Record<string, unknown>, output: unknown): TraceStep {
  const out = (output ?? {}) as Record<string, unknown>;
  switch (name) {
    case "getVaultState":
      return {
        kind: "read",
        label: "Read live vault state",
        detail: typeof out.total === "number" ? summarizeState(out as unknown as State) : (out.note as string),
      };
    case "proposeDeposit":
      return { kind: "prepare", label: `Prepared: deposit ${input.amount} zkLTC` };
    case "proposeWithdraw":
      return { kind: "prepare", label: `Prepared: withdraw ${input.amount} zkLTC` };
    case "proposeSetMode":
      return { kind: "prepare", label: `Prepared: switch to ${input.mode} mode` };
    case "proposeSetGoal":
      return { kind: "prepare", label: `Prepared: set goal ${input.amount} zkLTC` };
    case "proposeClaimYield":
      return { kind: "prepare", label: "Prepared: claim yield" };
    case "proposeAutoPilot":
      return { kind: "prepare", label: `Prepared: Auto-Pilot ${input.strategy}` };
    default:
      return { kind: "read", label: name };
  }
}

type RawToolCall = { toolName?: string; toolCallId?: string; input?: unknown; args?: unknown };
type RawToolResult = { toolCallId?: string; output?: unknown; result?: unknown };
type RawStep = { toolCalls?: RawToolCall[]; toolResults?: RawToolResult[] };

function traceFromSteps(steps: unknown): TraceStep[] {
  const trace: TraceStep[] = [];
  for (const step of (steps as RawStep[] | undefined) ?? []) {
    const results = step.toolResults ?? [];
    for (const tc of step.toolCalls ?? []) {
      const tr = results.find((r) => r.toolCallId === tc.toolCallId);
      trace.push(
        traceStepForTool(tc.toolName ?? "", (tc.input ?? tc.args ?? {}) as Record<string, unknown>, tr?.output ?? tr?.result)
      );
    }
  }
  return trace;
}

// Coerce a client-supplied value into a safe non-negative finite number.
function clampNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// Validate/clamp a client-supplied stateOverride (demo mode) - never trust it raw.
function sanitizeState(x: unknown): State | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  return {
    mode: o.mode === "grow" ? "grow" : "stack",
    stack: clampNum(o.stack),
    growPrincipal: clampNum(o.growPrincipal),
    pendingYield: clampNum(o.pendingYield),
    total: clampNum(o.total),
    goal: clampNum(o.goal),
    daysToHalving: Math.floor(clampNum(o.daysToHalving)),
    projected: clampNum(o.projected),
  };
}

// Convert "AI tells" in model prose (em/en-dashes and spaced-hyphen separators) into commas, so
// replies don't read machine-written. Cleans up any doubled or leading commas the swap creates.
function deAiText(s: string): string {
  return s
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/ +- +/g, ", ")
    .replace(/\s*,\s*,/g, ", ")
    .replace(/^\s*,\s*/, "")
    .trim();
}

export async function POST(request: Request) {
  // Block cross-site drive-by calls, then cap request volume per IP so a public URL can't
  // burn the LLM budget. (Per-request input is already bounded below.)
  if (!originAllowed(request)) return Response.json({ error: "forbidden" }, { status: 403 });
  const rl = rateLimit(`agent:${clientIp(request)}`, AGENT_RATE_LIMIT, AGENT_RATE_WINDOW_MS);
  if (!rl.ok) {
    return Response.json(
      { error: "rate_limited" },
      { status: 429, headers: { "retry-after": String(rl.retryAfter) } }
    );
  }

  // Reject non-JSON bodies (form posts etc.) before parsing.
  const ct = request.headers.get("content-type") ?? "";
  if (ct && !/^application\/json/i.test(ct)) {
    return Response.json({ error: "unsupported_media_type" }, { status: 415 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    messages?: { role: "user" | "assistant"; content: string }[];
    address?: string;
    stateOverride?: unknown; // demo mode supplies vault state so chat matches the demo dashboard
  };
  // Bound untrusted input: cap history length + per-message size (anti cost-DoS / injection blast).
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-24)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  const address = body.address;
  const stateOverride = sanitizeState(body.stateOverride);
  const user = (address && isAddress(address) ? address : zeroAddress) as Address;
  const actions: AgentAction[] = [];
  // In demo mode the client passes the demo vault state so the agent reasons over the same
  // numbers shown on screen instead of reading the (empty) chain for the demo address.
  // Memoized: repeated getVaultState tool calls within one request reuse the first read
  // instead of re-hitting the RPC (caps RPC amplification across the multi-step tool loop).
  let cachedState: State | null | undefined; // undefined = not yet fetched
  const getState = async (): Promise<State | null> => {
    if (cachedState === undefined) cachedState = stateOverride ?? (await readState(user));
    return cachedState;
  };

  const hasKey = !!process.env.ANTHROPIC_API_KEY || !!process.env.AI_GATEWAY_API_KEY;
  if (hasKey) {
    try {
      const model = process.env.ANTHROPIC_API_KEY
        ? (await import("@ai-sdk/anthropic")).anthropic("claude-haiku-4-5")
        : "anthropic/claude-haiku-4.5";
      const result = await generateText({
        model,
        system: stateOverride
          ? SYSTEM +
            "\n\nDEMO MODE: the vault state you can read is sample/demo data, not real on-chain balances. Help the user explore, but never imply these are their actual funds or that real value is at stake."
          : SYSTEM,
        messages,
        tools: buildTools(getState, actions),
        stopWhen: stepCountIs(6),
      });
      // De-AI the model output before returning: em/en-dashes AND spaced-hyphen separators both
      // read as machine-written (the user dislikes them). Convert them to commas, not hyphens.
      const text = deAiText(result.text?.trim() || "Done. Check the dashboard.");
      return Response.json({ text, actions, trace: traceFromSteps(result.steps), engine: "claude" });
    } catch (err) {
      console.error("LLM agent error, falling back to rules:", err);
    }
  }

  const trace: TraceStep[] = [];
  const fallback = await rulesEngine(messages, getState, actions, trace);
  for (const a of actions) trace.push({ kind: "prepare", label: a.label });
  return Response.json({ ...fallback, actions, trace, engine: "rules" });
}

// --- Deterministic fallback: same tools, keyword-driven, real on-chain numbers ---
async function rulesEngine(
  messages: { role: string; content: string }[],
  getState: () => Promise<State | null>,
  actions: AgentAction[],
  trace: TraceStep[]
): Promise<{ text: string }> {
  const last = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const t = last.toLowerCase();
  const s = await getState();
  trace.push({
    kind: "read",
    label: s ? "Read live vault state" : "Checked vault state",
    detail: s ? summarizeState(s) : "wallet not connected or vault not deployed",
  });
  const num = () => {
    const m = t.match(/(\d+(?:\.\d+)?)/);
    return m ? m[1] : null;
  };
  const money = (n?: number) => (n ?? 0).toFixed(2);

  // Auto-Pilot first - "auto-compound"/"auto-dca" contain "compound"/"deposit"/"claim"
  // keywords that later branches would otherwise capture.
  if (/auto.?pilot|automate|auto.?compound|auto.?dca|\bdca\b|recurring|every day|each day/.test(t)) {
    const dca = /dca|recurring|every|each|schedule/.test(t);
    const strategy = dca ? "dca" : "compound";
    const capMatch = t.match(/cap\s*(\d+(?:\.\d+)?)/) || t.match(/(\d+(?:\.\d+)?)\s*zkltc/);
    const cap = capMatch ? capMatch[1] : "5";
    actions.push({ type: "enableAutoPilot", strategy, cap, label: `Auto-Pilot: ${strategy}` });
    return {
      text:
        strategy === "dca"
          ? `Enabling Auto-DCA with a ${cap} zkLTC session cap. I'll deposit on a schedule (you confirm each tx).`
          : `Enabling Auto-Compound. I'll auto-claim your yield once it builds up (you confirm each tx).`,
    };
  }
  // Claim (yield) must be checked before the Grow branch - "claim my yield" contains "yield".
  if (/\bclaim\b/.test(t)) {
    actions.push({ type: "claimYield", label: "Claim simulated yield" });
    return {
      text: `Prepared a claim of your accrued simulated yield${s ? ` (~${money(s.pendingYield)} zkLTC)` : ""}. Confirm in your wallet.`,
    };
  }
  // Explicit mode switches come first so they always produce an action,
  // even before a wallet is connected (the "connect wallet" fallback is below).
  if (/\bstack\b/.test(t) && /(switch|move|go|put|set|into?)\b/.test(t)) {
    actions.push({ type: "setMode", mode: 0, label: "Switch to Stack mode" });
    return { text: "Moving you to Stack mode. Funds held safely in the vault. Confirm in your wallet." };
  }
  if (/\b(grow|yield|earn|deploy|compound)\b/.test(t) && !/stack/.test(t)) {
    actions.push({ type: "setMode", mode: 1, label: "Switch to Grow mode" });
    return { text: `Switching you to Grow mode. Your zkLTC will earn a simulated ~5% APY toward the halving. Confirm in your wallet.` };
  }
  if (/\b(stack|safe|hold|secure)\b/.test(t) && !s) {
    return { text: "Connect your wallet and deposit zkLTC, then I can audit your stack." };
  }
  if (/deposit/.test(t)) {
    const a = num();
    if (a) actions.push({ type: "deposit", amount: a, label: `Deposit ${a} zkLTC` });
    return { text: a ? `Prepared a deposit of ${a} zkLTC. Confirm in your wallet.` : "How much zkLTC would you like to deposit?" };
  }
  if (/withdraw/.test(t)) {
    const a = num();
    if (a) actions.push({ type: "withdraw", amount: a, label: `Withdraw ${a} zkLTC` });
    return { text: a ? `Prepared a withdrawal of ${a} zkLTC. Confirm in your wallet.` : "How much would you like to withdraw?" };
  }
  if (/goal|target/.test(t)) {
    const a = num();
    if (a) {
      actions.push({ type: "setGoal", amount: a, label: `Set halving goal to ${a} zkLTC` });
      return { text: `Setting your halving goal to ${a} zkLTC. Confirm in your wallet and I'll track your pace.` };
    }
    return { text: "What halving goal should I set (in zkLTC)? It needs to be above your current balance." };
  }
  if (/safe|risk|status|health|how.*stack|audit/.test(t)) {
    if (!s) return { text: "Connect your wallet so I can read your vault." };
    return {
      text: `You're in ${s.mode === "grow" ? "Grow" : "Stack"} mode with ${money(s.total)} zkLTC. ${
        s.mode === "grow"
          ? `Risk: low-moderate (principal custodied 1:1, ~${money(s.pendingYield)} zkLTC simulated yield accrued).`
          : "Risk: minimal. Funds are held safely, earning nothing. Switch to Grow to start compounding."
      }`,
    };
  }
  if (/pace|track|progress|projection|reach/.test(t)) {
    if (!s) return { text: "Connect your wallet and set a goal, then I'll check your pace." };
    if (s.goal <= 0) return { text: `You hold ${money(s.total)} zkLTC with no goal set. Tell me a target and I'll track it.` };
    const reached = s.projected >= s.goal;
    return {
      text: `At your current ${s.mode} pace you'd reach ~${money(s.projected)} zkLTC by the halving vs your ${money(
        s.goal
      )} goal. ${reached ? "On pace ✅." : `Short by ~${money(s.goal - s.projected)}. Switching to Grow would help.`}`,
    };
  }
  if (/halving|countdown|when/.test(t)) {
    return { text: `The next Litecoin halving is ~${s ? s.daysToHalving : "-"} days out (est. ${HALVING_LABEL}). Stack hard until then.` };
  }
  return {
    text: "I'm your vault guardian. Ask me to check your stack, switch modes, set a goal, deposit, withdraw, or run Auto-Pilot.",
  };
}
