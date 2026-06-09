"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { actionLogContract, isActionLogDeployed } from "@/lib/contracts";
import {
  ActionEngine,
  ActionKind,
  type DecisionEntry,
} from "@/lib/actionlog";
import { useDemoMode } from "@/components/DemoProvider";
import { demoDecisions } from "@/lib/demo";

const NOTARIZE_KEY = "forgemind.notarize";
const MAX_REASON = 160; // matches ForgeActionLog.MAX_REASON (bytes)

type RawDecision = {
  actor: `0x${string}`;
  kind: number;
  engine: number;
  attested?: boolean;
  timestamp: number;
  amount: string;
  reason: string;
  txHash?: string;
  block?: number;
  outcomeTx?: string;
  outcomeType?: string;
  outcomeAmount?: string;
};

/**
 * Reads the on-chain agent-decision ledger (via /api/decisions, which enriches each entry
 * with its on-chain tx + the vault tx it settled) and lets the agent notarize a decision.
 * "Notarize" is a separate, user-signed tx (honest, non-custodial) recording WHY an action
 * was taken; it can be toggled off for users who don't want the extra confirm.
 */
export function useActionLog() {
  const decisions = useQuery({
    queryKey: ["decisions"],
    queryFn: async (): Promise<RawDecision[]> => {
      const res = await fetch("/api/decisions");
      if (!res.ok) return [];
      const json = await res.json();
      return (json.items ?? []) as RawDecision[];
    },
    enabled: isActionLogDeployed,
    refetchInterval: 12_000,
    staleTime: 6_000,
  });

  const entries: DecisionEntry[] = useMemo(() => {
    return (decisions.data ?? []).map((e) => ({
      actor: e.actor,
      kind: Number(e.kind) as ActionKind,
      engine: Number(e.engine) as ActionEngine,
      attested: e.attested,
      timestamp: Number(e.timestamp),
      amount: Number(e.amount),
      reason: e.reason,
      txHash: e.txHash,
      block: e.block,
      outcomeTx: e.outcomeTx,
      outcomeType: e.outcomeType,
      outcomeAmount: e.outcomeAmount,
    }));
  }, [decisions.data]);

  // notarize toggle (persisted; default on so the demo shows the on-chain trail)
  const [notarize, setNotarizeState] = useState(true);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(NOTARIZE_KEY);
      // SSR-safe hydration: read persisted preference once after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw !== null) setNotarizeState(raw === "1");
    } catch {
      /* ignore */
    }
  }, []);
  const setNotarize = useCallback((on: boolean) => {
    setNotarizeState(on);
    try {
      localStorage.setItem(NOTARIZE_KEY, on ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const { writeContractAsync } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const { isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isSuccess) {
      // give the indexer a moment, then refetch so the new decision shows up
      const t = setTimeout(() => {
        decisions.refetch();
        setHash(undefined);
      }, 3000);
      return () => clearTimeout(t);
    }
  }, [isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Notarize an agent decision on-chain. No-op (returns undefined) when the contract
   * isn't deployed or notarizing is disabled — callers never need to branch.
   */
  const record = useCallback(
    async (kind: ActionKind, engine: ActionEngine, amountWei: bigint, reason: string) => {
      if (!isActionLogDeployed || !notarize) return undefined;
      const safeReason = reason.length > MAX_REASON ? reason.slice(0, MAX_REASON) : reason;
      const h = await writeContractAsync({
        ...actionLogContract,
        functionName: "log",
        args: [kind, engine, amountWei, safeReason],
      } as never);
      setHash(h);
      return h;
    },
    [notarize, writeContractAsync]
  );

  const { isDemo } = useDemoMode();
  if (isDemo) {
    const noop = async (...args: unknown[]): Promise<undefined> => {
      void args;
      return undefined;
    };
    return {
      entries: demoDecisions(),
      isLoading: false,
      deployed: true,
      notarize,
      setNotarize,
      record: noop,
      refetch: noop,
    };
  }

  return {
    entries,
    isLoading: decisions.isLoading,
    deployed: isActionLogDeployed,
    notarize,
    setNotarize,
    record,
    refetch: decisions.refetch,
  };
}

export type ActionLog = ReturnType<typeof useActionLog>;
