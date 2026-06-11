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
  running: boolean; // user explicitly pressed Start — picking a strategy alone never arms the loop
  cap: number; // session spend cap (zkLTC) - advisory
  claimThreshold: number; // auto-claim when pendingYield >= this
  dcaAmount: number; // zkLTC per DCA tick
  dcaIntervalMin: number; // minutes between DCA deposits
};

export type PilotLogEntry = { ts: number; text: string; tx?: string };

const DEFAULT: PilotConfig = {
  strategy: "off",
  running: false,
  cap: 5,
  claimThreshold: 0.01,
  dcaAmount: 1,
  dcaIntervalMin: 5,
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
        /* notarize rejected - the autonomous action itself already went through */
      }
    },
    [record]
  );

  // The loop only runs when the user has explicitly Started it — selecting a strategy just configures.
  const enabled = config.running && config.strategy !== "off";

  // Latest-value refs so the loop reads current config/state WITHOUT listing them as effect deps.
  // Listing v/config/spent re-created the interval on every render (and fired tick() each time) —
  // that, plus guards only set on success, was the tx-spam bug.
  const cfgRef = useRef(config);
  const vRef = useRef(v);
  const spentRef = useRef(spent);
  const setConfigRef = useRef(setConfig);
  cfgRef.current = config;
  vRef.current = v;
  spentRef.current = spent;
  setConfigRef.current = setConfig;

  // The autonomous loop — created once per enable/disable. Guardrails against wallet-spam:
  // single in-flight tx, a 30s cooldown that starts BEFORE the prompt (so a rejected/failed tx
  // can't immediately re-prompt), and a per-DCA interval that's also armed before the prompt.
  useEffect(() => {
    if (!enabled) return;
    // The user explicitly pressed Start: fire the first action right away so they see it work (one
    // wallet prompt on a real wallet; instant on the demo), then continue on schedule. The in-flight
    // guard, 30s cooldown, and DCA interval below still block any rapid re-fire.
    lastActionAt.current = 0;
    if (cfgRef.current.strategy === "dca") lastDcaAt.current = 0;
    pushLog(cfgRef.current.strategy === "dca" ? "Auto-DCA started." : "Auto-Compound started.");

    const tick = async () => {
      if (inFlight.current) return;
      const vv = vRef.current;
      const cfg = cfgRef.current;
      const sp = spentRef.current;
      if (!vv.isConnected || !vv.state) return;
      if (Date.now() - lastActionAt.current < COOLDOWN_MS) return;
      const s = vv.state;

      // Rule 1: compound — claim accrued yield once it crosses the threshold (Grow only).
      if (cfg.strategy === "compound" && s.mode === Mode.Grow && s.pendingYield >= cfg.claimThreshold) {
        inFlight.current = true;
        lastActionAt.current = Date.now(); // cooldown starts now — even if the user rejects
        try {
          pushLog(`Auto-claiming ${s.pendingYield.toFixed(4)} zkLTC yield…`);
          const tx = await vv.claimYield();
          pushLog("Claimed yield", tx);
          await notarize(ActionKind.AutoCompound, 0n, `Auto-Compound: yield ${s.pendingYield.toFixed(4)} >= ${cfg.claimThreshold} threshold`);
        } catch {
          pushLog("Auto-Compound cancelled or failed.");
        } finally {
          inFlight.current = false;
        }
        return;
      }

      // Rule 2: DCA — recurring deposit on a schedule, under the spend cap.
      if (cfg.strategy === "dca") {
        if (Date.now() - lastDcaAt.current < cfg.dcaIntervalMin * 60_000) return; // not due yet
        if (sp + cfg.dcaAmount > cfg.cap) {
          pushLog(`DCA paused: session cap (${cfg.cap} zkLTC) reached.`);
          setConfigRef.current({ strategy: "off" });
          return;
        }
        if (vv.walletBalance < cfg.dcaAmount) return;
        inFlight.current = true;
        lastActionAt.current = Date.now();
        lastDcaAt.current = Date.now(); // arm the next interval BEFORE the prompt, so a reject can't re-fire
        try {
          pushLog(`DCA: depositing ${cfg.dcaAmount} zkLTC…`);
          const tx = await vv.deposit(String(cfg.dcaAmount));
          setSpent((p) => {
            const np = p + cfg.dcaAmount;
            persist(cfg, np);
            return np;
          });
          pushLog(`Deposited ${cfg.dcaAmount} zkLTC`, tx);
          await notarize(ActionKind.AutoDCA, toWei(String(cfg.dcaAmount)), `Auto-DCA: ${cfg.dcaAmount} zkLTC deposit (session cap ${cfg.cap})`);
        } catch {
          pushLog("DCA deposit cancelled or failed.");
        } finally {
          inFlight.current = false;
        }
      }
    };

    const id = setInterval(tick, TICK_MS);
    void tick(); // fire the first check immediately on Start so the user sees it act
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- arms only on enable change; handlers/config read via stable refs
  }, [enabled]);

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
