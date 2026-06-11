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
import { demoDecisions, makeDemoDecision } from "@/lib/demo";

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
 * with its on-chain tx + the vault tx it settled) and notarizes each agent decision: a separate,
 * user-signed tx (honest, non-custodial) recording WHY an action was taken.
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
   * isn't deployed or notarizing is disabled - callers never need to branch.
   */
  const record = useCallback(
    async (kind: ActionKind, engine: ActionEngine, amountWei: bigint, reason: string) => {
      if (!isActionLogDeployed) return undefined;
      const safeReason = reason.length > MAX_REASON ? reason.slice(0, MAX_REASON) : reason;
      const h = await writeContractAsync({
        ...actionLogContract,
        functionName: "log",
        args: [kind, engine, amountWei, safeReason],
      } as never);
      setHash(h);
      return h;
    },
    [writeContractAsync]
  );

  // In demo mode the Decisions ledger is a live, in-memory store: notarizing a demo action
  // appends a real entry so the tab updates as the user acts through the agent (chain untouched).
  const [demoLog, setDemoLog] = useState<DecisionEntry[]>(demoDecisions);
  const demoRecord = useCallback(
    async (kind: ActionKind, engine: ActionEngine, amountWei: bigint, reason: string): Promise<undefined> => {
      setDemoLog((l) => [makeDemoDecision(kind, engine, amountWei, reason), ...l].slice(0, 60));
      return undefined;
    },
    []
  );

  const { isDemo } = useDemoMode();
  if (isDemo) {
    const noop = async (...args: unknown[]): Promise<undefined> => {
      void args;
      return undefined;
    };
    return {
      entries: demoLog,
      isLoading: false,
      deployed: true,
      record: demoRecord,
      refetch: noop,
    };
  }

  return {
    entries,
    isLoading: decisions.isLoading,
    deployed: isActionLogDeployed,
    record,
    refetch: decisions.refetch,
  };
}

export type ActionLog = ReturnType<typeof useActionLog>;
