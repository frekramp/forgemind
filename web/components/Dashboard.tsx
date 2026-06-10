"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useVault } from "@/hooks/useVault";
import { useMissions } from "@/hooks/useMissions";
import { useAutoPilot } from "@/hooks/useAutoPilot";
import { useActionLog } from "@/hooks/useActionLog";
import { Header } from "./Header";
import { ConnectButton, NoWalletHint } from "./ConnectButton";
import { VaultPanel } from "./VaultPanel";
import { HalvingTracker } from "./HalvingTracker";
import { AgentChat } from "./AgentChat";
import { ErrorBoundary } from "./ErrorBoundary";
import { StatStrip } from "./StatStrip";
import { Tabs, type TabKey } from "./Tabs";
import { Leaderboard } from "./Leaderboard";
import { ActivityFeed } from "./ActivityFeed";
import { Missions } from "./Missions";
import { Analytics } from "./Analytics";
import { AutoPilot } from "./AutoPilot";
import { KeeperPanel } from "./KeeperPanel";
import { AgentDecisions } from "./AgentDecisions";
import { useDemoMode } from "./DemoProvider";
import { isVaultDeployed } from "@/lib/contracts";
import { countdownTo, type Countdown } from "@/lib/halving";
import { ShieldCheck, TrendingUp, Bot, TriangleAlert, Wallet, Play, X, Sparkles, Link2, Zap } from "lucide-react";
import { cn } from "@/lib/cn";
import { useEffect } from "react";

const NEEDS_WALLET: TabKey[] = ["overview", "missions", "autopilot"];

export function Dashboard() {
  const v = useVault();
  const missions = useMissions();
  const al = useActionLog(); // on-chain agent-decision ledger
  const ap = useAutoPilot(v, al.record); // mounted here so the autonomous loop survives tab switches
  const { isConnected } = useAccount();
  const { isDemo, setDemo } = useDemoMode();
  const [tab, setTab] = useState<TabKey>("overview");

  // A real wallet connection takes over from demo mode.
  useEffect(() => {
    if (isConnected && isDemo) setDemo(false);
  }, [isConnected, isDemo, setDemo]);

  const connected = isConnected || isDemo;
  const gated = NEEDS_WALLET.includes(tab) && !connected;

  function renderTab() {
    if (tab === "leaderboard") return <Leaderboard />;
    if (tab === "activity") return <ActivityFeed />;
    if (tab === "analytics") return <Analytics />;
    if (tab === "decisions") return <AgentDecisions al={al} />;
    if (gated) return <ConnectPrompt />;
    if (tab === "missions") return <Missions m={missions} />;
    if (tab === "autopilot") return <AutomationTab v={v} ap={ap} />;
    // overview
    return (
      <div className="space-y-5">
        <Orientation />
        <StatStrip v={v} />
        <VaultPanel v={v} />
        <HalvingTracker v={v} />
      </div>
    );
  }

  return (
    <div className="bg-forge flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-5 py-6">
        {!connected && tab === "overview" ? (
          // Clean full-viewport landing - no tab bar / dev banners cluttering the first impression.
          <ConnectGate onDemo={() => setDemo(true)} />
        ) : (
          <div className="space-y-5">
            {isDemo && <DemoBanner onExit={() => setDemo(false)} />}
            {!isVaultDeployed && !isDemo && <DeployBanner />}
            <Tabs active={tab} onChange={setTab} />
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
              <div key={tab} className="animate-rise-in lg:col-span-7 xl:col-span-8">
                <ErrorBoundary label="this view">{renderTab()}</ErrorBoundary>
              </div>
              <div className="lg:col-span-5 xl:col-span-4">
                <div className="h-[660px] lg:sticky lg:top-20">
                  <ErrorBoundary label="the agent">
                    <AgentChat
                      v={v}
                      record={al.record}
                      onClaimMission={(id) => missions.claimMission(id).catch(() => {})}
                      onAutoPilot={(strategy, cap) => {
                        ap.setConfig({ strategy, cap, running: false });
                        setTab("autopilot");
                      }}
                      onNavigate={setTab}
                    />
                  </ErrorBoundary>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

/** Top-of-overview orientation: what ForgeMind is + the three differentiators, so a first-time
 *  viewer (or judge) gets it instantly. */
function Orientation() {
  const chips = [
    { Icon: Sparkles, label: "Live Forge Guardian" },
    { Icon: Link2, label: "On-chain decisions" },
    { Icon: ShieldCheck, label: "Cryptographically verified" },
  ];
  return (
    <div className="card-elev flex flex-col gap-4 rounded-2xl border border-border bg-panel p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h2 className="font-display text-[1.4rem] leading-tight tracking-tight">
          A Forge Guardian that <span className="text-gradient-ember italic">acts on-chain</span>.
        </h2>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted">
          It reads your vault, reasons, and executes real transactions you sign: switch Stack/Grow, set a halving
          goal, and every decision is written on-chain.
        </p>
      </div>
      <div className="flex flex-shrink-0 flex-wrap gap-2">
        {chips.map(({ Icon, label }) => (
          <span
            key={label}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg px-3 py-1.5 text-[11px] font-medium text-muted"
          >
            <Icon size={12} className="text-ember" /> {label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Automation as a real selector: pick a tier and only that panel renders. (Stacking both panels
 *  under non-clickable explainer cards was confusing.) */
function AutomationTab({ v, ap }: { v: ReturnType<typeof useVault>; ap: ReturnType<typeof useAutoPilot> }) {
  const [tier, setTier] = useState<"autopilot" | "keeper">("autopilot");
  return (
    <div className="space-y-5">
      <div className="card-elev rounded-2xl border border-border bg-panel p-5">
        <h2 className="font-display text-[1.3rem] leading-tight tracking-tight">Two ways to automate.</h2>
        <p className="mt-1 text-sm text-muted">
          Compound yield and rebalance toward your halving goal. Choose how much you hand over:
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TierCard
            active={tier === "autopilot"}
            onClick={() => setTier("autopilot")}
            icon={Bot}
            title="Auto-Pilot"
            tag="you stay in control"
            desc="Runs on a timer in your browser; you confirm every transaction. Nothing is delegated or auto-signed."
          />
          <TierCard
            active={tier === "keeper"}
            onClick={() => setTier("keeper")}
            icon={Zap}
            title="Keeper"
            tag="fully hands-off"
            desc="Delegate once on-chain and a server keeper acts 24/7 — no browser, no per-tx clicks. Capped + revocable."
          />
        </div>
      </div>
      {tier === "autopilot" ? <AutoPilot ap={ap} /> : <KeeperPanel v={v} />}
    </div>
  );
}

function TierCard({
  active,
  onClick,
  icon: Icon,
  title,
  tag,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Bot;
  title: string;
  tag: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-xl border p-4 text-left transition-all",
        active ? "border-ember bg-ember-soft ring-1 ring-ember/20" : "border-border bg-bg hover:border-border-strong"
      )}
    >
      <div className={cn("flex items-center gap-2 text-sm font-semibold", active ? "text-ember" : "text-text")}>
        <Icon size={15} className={active ? "text-ember" : "text-dim"} /> {title}
        <span className="ml-auto text-[10px] font-normal text-dim">{tag}</span>
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{desc}</p>
    </button>
  );
}

function ConnectPrompt() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-panel py-16 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-xl bg-ember-soft text-ember">
        <Wallet size={22} />
      </div>
      <div>
        <p className="text-sm font-medium text-text">Connect your wallet to continue</p>
        <p className="mt-1 text-xs text-muted">This view needs your address to read on-chain state.</p>
      </div>
      <ConnectButton />
      <NoWalletHint />
    </div>
  );
}

function HalvingCountdown() {
  const [c, setC] = useState<Countdown>({ days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setC(countdownTo());
    const id = setInterval(() => setC(countdownTo()), 1000);
    return () => clearInterval(id);
  }, []);
  const units = [
    { v: c.days, l: "days" },
    { v: c.hours, l: "hrs" },
    { v: c.minutes, l: "min" },
    { v: c.seconds, l: "sec" },
  ];
  return (
    <div className="flex items-end gap-2 sm:gap-2.5">
      {units.map((u, i) => (
        <div key={u.l} className="flex items-end gap-2 sm:gap-2.5">
          <div className="flex min-w-[3.6rem] flex-col items-center rounded-xl border border-border bg-panel/80 px-3 py-2.5 backdrop-blur sm:min-w-[4.25rem]">
            <span className="tnum font-mono text-2xl font-semibold text-text sm:text-3xl">
              {String(u.v).padStart(2, "0")}
            </span>
            <span className="label mt-1.5">{u.l}</span>
          </div>
          {i < units.length - 1 && <span className="pb-3 text-lg text-dim">:</span>}
        </div>
      ))}
    </div>
  );
}

// Ambient rising embers for the hero (fixed values so SSR/client match — no Math.random).
const HERO_EMBERS = [
  { left: "5%", size: 3, delay: 0, dur: 9, drift: 10 },
  { left: "11%", size: 4, delay: 1.2, dur: 11, drift: -8 },
  { left: "17%", size: 2, delay: 3.4, dur: 10, drift: 12 },
  { left: "23%", size: 5, delay: 0.6, dur: 12, drift: -6 },
  { left: "29%", size: 3, delay: 2.3, dur: 9.5, drift: 9 },
  { left: "35%", size: 2, delay: 4.1, dur: 11.5, drift: -10 },
  { left: "41%", size: 4, delay: 1.8, dur: 10.5, drift: 7 },
  { left: "47%", size: 3, delay: 3.0, dur: 9, drift: -12 },
  { left: "53%", size: 5, delay: 0.3, dur: 12.5, drift: 6 },
  { left: "59%", size: 2, delay: 2.7, dur: 10, drift: -8 },
  { left: "65%", size: 4, delay: 4.6, dur: 11, drift: 11 },
  { left: "71%", size: 3, delay: 1.0, dur: 9.5, drift: -7 },
  { left: "77%", size: 2, delay: 3.7, dur: 12, drift: 9 },
  { left: "83%", size: 5, delay: 0.9, dur: 10.5, drift: -10 },
  { left: "89%", size: 3, delay: 2.1, dur: 11, drift: 8 },
  { left: "94%", size: 2, delay: 4.3, dur: 9, drift: -6 },
  { left: "38%", size: 6, delay: 5.4, dur: 13, drift: -9 },
  { left: "62%", size: 6, delay: 0.1, dur: 13, drift: 10 },
  { left: "26%", size: 2, delay: 5.9, dur: 10, drift: -5 },
  { left: "74%", size: 4, delay: 2.5, dur: 11.5, drift: 6 },
  { left: "50%", size: 3, delay: 4.9, dur: 9.5, drift: -8 },
  { left: "8%", size: 2, delay: 3.1, dur: 10, drift: 7 },
];

function ConnectGate({ onDemo }: { onDemo: () => void }) {
  const features = [
    { n: "01", icon: ShieldCheck, title: "Stack & Grow", desc: "Hold zkLTC 1:1, or deploy it for a simulated 5% APY." },
    { n: "02", icon: Bot, title: "On-chain agent", desc: "It reads live state, reasons, and executes real txns you sign." },
    { n: "03", icon: TrendingUp, title: "Auto-Pilot", desc: "A keeper that compounds & rebalances autonomously, 24/7." },
  ];
  return (
    <section className="relative -mx-5 -my-6 flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center overflow-hidden px-5 py-16 text-center">
      {/* atmosphere */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="hero-grid absolute inset-0" />
        <div className="animate-float-glow absolute left-1/2 top-[6%] h-[30rem] w-[30rem] rounded-full bg-ember/[0.09] blur-[130px]" />
        <div
          className="animate-float-glow absolute bottom-[-12%] left-1/2 h-[22rem] w-[42rem] rounded-full bg-ember-deep/[0.1] blur-[120px]"
          style={{ animationDelay: "-4.5s", animationDuration: "11s" }}
        />
        {HERO_EMBERS.map((e, i) => (
          <span
            key={i}
            className="ember-particle"
            style={
              {
                left: e.left,
                width: e.size,
                height: e.size,
                animationDelay: `${e.delay}s`,
                animationDuration: `${e.dur}s`,
                "--drift": `${e.drift}px`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <div className="relative flex flex-col items-center">
        <h1
          className="font-display animate-rise-in max-w-4xl text-balance text-[2.6rem] font-normal leading-[1.04] tracking-[-0.02em] sm:text-[4.75rem]"
        >
          A Forge Guardian for your <span className="text-gradient-ember italic">zkLTC</span> stack.
        </h1>

        <p
          className="animate-rise-in mx-auto mt-5 max-w-xl text-balance text-[15px] leading-relaxed text-muted"
          style={{ animationDelay: "130ms" }}
        >
          Chat with an on-chain agent that executes real transactions. Switch modes, set a halving goal, and let it
          run your stack <span className="text-text">autonomously</span> toward the next Litecoin halving.
        </p>

        <div className="animate-rise-in mt-9 flex flex-col items-center gap-2.5" style={{ animationDelay: "190ms" }}>
          <span className="label">Next Litecoin halving in</span>
          <HalvingCountdown />
        </div>

        <div
          className="animate-rise-in mt-9 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row"
          style={{ animationDelay: "250ms" }}
        >
          <ConnectButton size="lg" label="Connect Wallet" />
          <button
            onClick={onDemo}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-panel px-5 py-3 text-sm font-medium text-text transition-colors hover:border-ember hover:text-ember sm:w-auto"
          >
            <Play size={14} /> Explore live demo
          </button>
        </div>
        <NoWalletHint />
        <div className="label mt-4 text-dim">no wallet needed for the demo · chain 4441 · gas in zkLTC</div>

        {/* feature strip - a single unified band, not three floating cards */}
        <div
          className="animate-rise-in mt-16 grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3"
          style={{ animationDelay: "320ms" }}
        >
          {features.map((f) => (
            <div key={f.title} className="lift card-elev group rounded-2xl border border-border bg-panel p-6 text-left hover:border-ember/40">
              <div className="flex items-center justify-between">
                <span className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-bg text-ember transition-colors group-hover:border-ember/40">
                  <f.icon size={15} />
                </span>
                <span className="tnum font-mono text-[11px] text-dim">{f.n}</span>
              </div>
              <div className="mt-3.5 text-sm font-medium">{f.title}</div>
              <div className="mt-1 text-xs leading-relaxed text-muted">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DeployBanner() {
  return (
    <div className="mb-5 flex items-start gap-3 rounded-xl border border-ember/30 bg-ember-soft px-4 py-3 text-sm">
      <TriangleAlert size={18} className="mt-0.5 shrink-0 text-ember" />
      <div>
        <span className="font-medium text-ember">Contract not configured.</span>{" "}
        <span className="text-muted">
          Set <code className="font-mono text-text">NEXT_PUBLIC_VAULT_ADDRESS</code> in{" "}
          <code className="font-mono text-text">.env.local</code> after deploying to LiteForge.
        </span>
      </div>
    </div>
  );
}

function DemoBanner({ onExit }: { onExit: () => void }) {
  return (
    <div className="mb-5 flex items-center gap-3 rounded-xl border border-ember/30 bg-ember-soft px-4 py-2.5 text-sm">
      <span className="flex h-5 items-center rounded-full bg-ember px-2 text-[10px] font-bold uppercase tracking-wide text-black">
        Demo
      </span>
      <span className="text-muted">
        <span className="text-text">Sample data you can play with</span>: deposit, switch modes, set a goal, claim,
        and chat with the agent. Nothing touches the chain.
      </span>
      <button
        onClick={onExit}
        className="ml-auto flex shrink-0 items-center gap-1 text-[11px] text-dim transition-colors hover:text-ember"
      >
        <X size={12} /> Exit demo
      </button>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-[1400px] flex-col items-center justify-between gap-1 px-5 py-4 text-[11px] text-dim sm:flex-row">
        <span>ForgeMind · AI smart vault for zkLTC</span>
        <span>Built on LiteForge (LitVM) · chain 4441 · gas in zkLTC</span>
      </div>
    </footer>
  );
}
