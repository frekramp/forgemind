"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { demoVaultState } from "@/lib/demo";
import { projectStack } from "@/lib/halving";
import { Mode } from "@/lib/contracts";
import { toWei } from "@/lib/format";
import type { VaultState } from "@/hooks/useVault";

const KEY = "forgemind.demo";
const clamp = (n: number) => Math.max(0, Math.round(n * 1e6) / 1e6);

// Mutable core the demo simulates over, so deposit/withdraw/mode/goal/claim feel real (no wallet).
type Core = {
  mode: Mode;
  stack: number;
  growPrincipal: number;
  pendingYield: number;
  goal: number;
  daysToHalving: number;
  wallet: number;
};

function initCore(): Core {
  const s = demoVaultState();
  return {
    mode: s.mode,
    stack: s.stack,
    growPrincipal: s.growPrincipal,
    pendingYield: s.pendingYield,
    goal: s.goal,
    daysToHalving: s.daysToHalving,
    wallet: 42.5,
  };
}

function toState(c: Core): VaultState {
  const total = clamp(c.stack + c.growPrincipal + c.pendingYield);
  return {
    mode: c.mode,
    stack: clamp(c.stack),
    growPrincipal: clamp(c.growPrincipal),
    pendingYield: clamp(c.pendingYield),
    total,
    goal: c.goal,
    daysToHalving: c.daysToHalving,
    projected: projectStack(total, c.mode === Mode.Grow),
    raw: { total: toWei(total.toFixed(6)), goal: toWei(c.goal.toFixed(6)), pendingYield: toWei(c.pendingYield.toFixed(6)) },
  };
}

export type DemoVault = {
  state: VaultState;
  walletBalance: number;
  deposit: (amt: string) => Promise<undefined>;
  withdraw: (amt: string) => Promise<undefined>;
  withdrawAll: () => Promise<undefined>;
  setMode: (m: Mode) => Promise<undefined>;
  setGoal: (amt: string) => Promise<undefined>;
  claimYield: () => Promise<undefined>;
};

type DemoCtx = { isDemo: boolean; setDemo: (on: boolean) => void; demoVault: DemoVault };

const Ctx = createContext<DemoCtx>({} as DemoCtx);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [isDemo, setIsDemo] = useState(false);
  const [core, setCore] = useState<Core>(initCore);

  useEffect(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("demo") === "1";
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (fromUrl || localStorage.getItem(KEY) === "1") setIsDemo(true);
    } catch {
      /* ignore */
    }
  }, []);

  const setDemo = useCallback((on: boolean) => {
    setIsDemo(on);
    if (!on) setCore(initCore()); // reset the sandbox when leaving demo
    try {
      localStorage.setItem(KEY, on ? "1" : "0");
    } catch {
      /* ignore */
    }
    // Land at the top of the new view, not wherever the previous page was scrolled (e.g. clicking
    // "See it live in the demo" from the How-it-works section near the bottom of the landing).
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  }, []);

  const deposit = useCallback(async (amt: string) => {
    const a = Math.max(0, Number(amt) || 0);
    setCore((c) => {
      if (a <= 0 || a > c.wallet) return c;
      const bucket = c.mode === Mode.Grow ? { growPrincipal: c.growPrincipal + a } : { stack: c.stack + a };
      return { ...c, wallet: clamp(c.wallet - a), ...bucket };
    });
    return undefined;
  }, []);

  const withdraw = useCallback(async (amt: string) => {
    const a = Math.max(0, Number(amt) || 0);
    setCore((c) => {
      const principal = c.mode === Mode.Grow ? c.growPrincipal : c.stack;
      if (a <= 0 || a > principal) return c;
      const bucket = c.mode === Mode.Grow ? { growPrincipal: c.growPrincipal - a } : { stack: c.stack - a };
      return { ...c, wallet: clamp(c.wallet + a), ...bucket };
    });
    return undefined;
  }, []);

  const withdrawAll = useCallback(async () => {
    setCore((c) => ({ ...c, wallet: clamp(c.wallet + c.stack + c.growPrincipal + c.pendingYield), stack: 0, growPrincipal: 0, pendingYield: 0 }));
    return undefined;
  }, []);

  const setMode = useCallback(async (m: Mode) => {
    setCore((c) =>
      m === c.mode
        ? c
        : m === Mode.Grow
          ? { ...c, mode: m, growPrincipal: c.growPrincipal + c.stack, stack: 0 }
          : { ...c, mode: m, stack: c.stack + c.growPrincipal, growPrincipal: 0 }
    );
    return undefined;
  }, []);

  const setGoal = useCallback(async (amt: string) => {
    const g = Math.max(0, Number(amt) || 0);
    setCore((c) => (g > 0 ? { ...c, goal: g } : c));
    return undefined;
  }, []);

  const claimYield = useCallback(async () => {
    // Compound yield into principal so the total keeps growing (claiming reads as a gain, not a
    // drop). On mainnet the contract pays yield out to your wallet instead.
    setCore((c) => {
      const bucket = c.mode === Mode.Grow ? { growPrincipal: c.growPrincipal + c.pendingYield } : { stack: c.stack + c.pendingYield };
      return { ...c, ...bucket, pendingYield: 0 };
    });
    return undefined;
  }, []);

  const demoVault = useMemo<DemoVault>(
    () => ({ state: toState(core), walletBalance: clamp(core.wallet), deposit, withdraw, withdrawAll, setMode, setGoal, claimYield }),
    [core, deposit, withdraw, withdrawAll, setMode, setGoal, claimYield]
  );

  const value = useMemo(() => ({ isDemo, setDemo, demoVault }), [isDemo, setDemo, demoVault]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDemoMode() {
  return useContext(Ctx);
}
