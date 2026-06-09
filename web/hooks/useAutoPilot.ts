"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { useVault } from "./useVault";
import type { ActionLog } from "./useActionLog";
import { Mode } from "@/lib/contracts";
import { ActionEngine, ActionKind } from "@/lib/actionlog";
import { toWei } from "@/lib/format";
import type { AutoPilotStrategy } from "@/lib/agent";

export type PilotConfig = {
  strategy: AutoPilotStrategy; // "compound" | "dca" | "off"
  cap: number; // session spend cap (zkLTC) — advisory
  claimThreshold: number; // auto-claim when pendingYield >= this
  dcaAmount: number; // zkLTC per DCA tick
  dcaIntervalMin: number; // minutes between DCA deposits
};

export type PilotLogEntry = { ts: number; text: string; tx?: string };

const DEFAULT: PilotConfig = {
  strategy: "off",
  cap: 5,
  claimThreshold: 0.01,
  dcaAmount: 1,
  dcaIntervalMin: 1,
};

const LS_KEY = "forgemind.autopilot";
const TICK_MS = 15_000;
const COOLDOWN_MS = 30_000;

/**
 * Client-side autonomous loop. The agent DECIDES (rules fire on a timer) and acts via the
 * existing vault writers; the user still confirms each tx in their wallet (honest on-chain).
 * Guardrails: single in-flight tx, per-action cooldown, advisory spend cap, pause off-chain.
 */
export function useAutoPilot(v: ReturnType<typeof useVault>, record?: ActionLog["record"]) {
  const [config, setConfigState] = useState<PilotConfig>(DEFAULT);
  const [log, setLog] = useState<PilotLogEntry[]>([]);
  const [spent, setSpent] = useState(0);

  const inFlight = useRef(false);
  const lastActionAt = useRef(0);
  const lastDcaAt = useRef(0);

  // hydrate from localStorage (client only)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        // SSR-safe hydration: restore persisted pilot config once after mount.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setConfigState({ ...DEFAULT, ...p.config });
        setSpent(p.spent ?? 0);
        lastDcaAt.current = p.lastDcaAt ?? 0;
      }
    } catch {
      /* ignore */
    }
  }, []);

  const persist = useCallback((cfg: PilotConfig, sp: number) => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ config: cfg, spent: sp, lastDcaAt: lastDcaAt.current }));
    } catch {
      /* ignore */
    }
  }, []);

  const setConfig = useCallback(
    (patch: Partial<PilotConfig>) => {
      setConfigState((c) => {
        const next = { ...c, ...patch };
        persist(next, spent);
        return next;
      });
    },
    [persist, spent]
  );

  const pushLog = useCallback((text: string, tx?: string) => {
    setLog((l) => [{ ts: Date.now(), text, tx }, ...l].slice(0, 40));
  }, []);

  // Notarize an autonomous decision on-chain (Rules engine). Swallows its own errors so a
  // rejected notarize confirm doesn't mark the (already-executed) action as failed.
  const notarize = useCallback(
    async (kind: ActionKind, amountWei: bigint, reason: string) => {
      try {
        await record?.(kind, ActionEngine.Rules, amountWei, reason);
      } catch {
        /* notarize rejected — the autonomous action itself already went through */
      }
    },
    [record]
  );

  const enabled = config.strategy !== "off";

  // the autonomous loop
  useEffect(() => {
    if (!enabled) return;
    const tick = async () => {
      if (inFlight.current) return;
      if (!v.isConnected) return;
      if (Date.now() - lastActionAt.current < COOLDOWN_MS) return;
      const s = v.state;
      if (!s) return;

      try {
        // Rule 1: compound — claim accrued yield once it crosses the threshold (Grow only)
        if (config.strategy === "compound" && s.mode === Mode.Grow && s.pendingYield >= config.claimThreshold) {
          inFlight.current = true;
          pushLog(`Auto-claiming ${s.pendingYield.toFixed(4)} zkLTC yield…`);
          const tx = await v.claimYield();
          lastActionAt.current = Date.now();
          pushLog(`Claimed yield`, tx);
          await notarize(
            ActionKind.AutoCompound,
            0n,
            `Auto-Compound: yield ${s.pendingYield.toFixed(4)} >= ${config.claimThreshold} threshold`
          );
          return;
        }
        // Rule 2: DCA — recurring deposit on a schedule, under the spend cap
        if (config.strategy === "dca") {
          const due = Date.now() - lastDcaAt.current >= config.dcaIntervalMin * 60_000;
          const underCap = spent + config.dcaAmount <= config.cap;
          if (due && underCap && v.walletBalance >= config.dcaAmount) {
            inFlight.current = true;
            pushLog(`DCA: depositing ${config.dcaAmount} zkLTC…`);
            const tx = await v.deposit(String(config.dcaAmount));
            lastDcaAt.current = Date.now();
            lastActionAt.current = Date.now();
            setSpent((p) => {
              const np = p + config.dcaAmount;
              persist(config, np);
              return np;
            });
            pushLog(`Deposited ${config.dcaAmount} zkLTC`, tx);
            await notarize(
              ActionKind.AutoDCA,
              toWei(String(config.dcaAmount)),
              `Auto-DCA: ${config.dcaAmount} zkLTC deposit (session cap ${config.cap})`
            );
          } else if (due && !underCap) {
            pushLog(`DCA paused — session cap (${config.cap} zkLTC) reached.`);
            setConfig({ strategy: "off" });
          }
        }
      } catch {
        pushLog("Action cancelled or failed.");
      } finally {
        inFlight.current = false;
      }
    };
    const id = setInterval(tick, TICK_MS);
    tick();
    return () => clearInterval(id);
  }, [enabled, config, spent, v, pushLog, persist, setConfig, notarize]);

  const resetSpent = useCallback(() => {
    setSpent(0);
    persist(config, 0);
  }, [config, persist]);

  return {
    config,
    setConfig,
    enabled,
    log,
    spent,
    remaining: Math.max(0, config.cap - spent),
    resetSpent,
    pushLog,
  };
}
