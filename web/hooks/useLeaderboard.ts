"use client";

import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import type { Address } from "viem";
import { vaultContract, profileContract, isVaultDeployed, isProfileDeployed } from "@/lib/contracts";
import { forgeVaultAbi, forgeProfileAbi } from "@/lib/abi";
import { weiToNum } from "@/lib/format";
import { useDemoMode } from "@/components/DemoProvider";
import { demoLeaderboard } from "@/lib/demo";

export type LeaderRow = {
  address: Address;
  username: string;
  balance: number;
  goal: number;
  progressPct: number;
  pendingYield: number;
  xp: number;
  level: number;
};

export type SortKey = "balance" | "progress" | "yield" | "xp";

type CallResult = { result?: unknown; status: "success" | "failure" };

/** Reads the participant registry, then multicalls per-user state + XP, and ranks. */
export function useLeaderboard(sortBy: SortKey = "xp") {
  // Profile registry is canonical once deployed; otherwise fall back to the vault registry.
  const registry = isProfileDeployed
    ? { address: profileContract.address, abi: forgeProfileAbi }
    : { address: vaultContract.address, abi: forgeVaultAbi };

  const usersRead = useReadContract({
    address: registry.address,
    abi: registry.abi,
    functionName: "getUsers",
    args: [BigInt(0), BigInt(100)],
    query: { enabled: isVaultDeployed, refetchInterval: 20_000 },
  } as never);

  const addrs = (usersRead.data as readonly Address[] | undefined) ?? [];

  const calls = useMemo(() => {
    const c: { address: Address; abi: unknown; functionName: string; args: unknown[] }[] = [];
    for (const a of addrs) {
      c.push({ address: vaultContract.address, abi: forgeVaultAbi, functionName: "getVaultState", args: [a] });
      if (isProfileDeployed) {
        c.push({ address: profileContract.address, abi: forgeProfileAbi, functionName: "xp", args: [a] });
        c.push({ address: profileContract.address, abi: forgeProfileAbi, functionName: "username", args: [a] });
      }
    }
    return c;
  }, [addrs]);

  const batch = useReadContracts({
    contracts: calls as never,
    query: { enabled: addrs.length > 0, refetchInterval: 20_000 },
  });

  const rows: LeaderRow[] = useMemo(() => {
    const data = batch.data as CallResult[] | undefined;
    if (!data) return [];
    const stride = isProfileDeployed ? 3 : 1;
    const out: LeaderRow[] = [];
    for (let i = 0; i < addrs.length; i++) {
      const vs = data[i * stride]?.result as
        | readonly [number, bigint, bigint, bigint, bigint, bigint, bigint, bigint]
        | undefined;
      if (!vs) continue;
      const balance = weiToNum(vs[4]);
      const goal = weiToNum(vs[5]);
      const pendingYield = weiToNum(vs[3]);
      const xp = isProfileDeployed ? Number((data[i * stride + 1]?.result as bigint) ?? BigInt(0)) : 0;
      const username = isProfileDeployed ? ((data[i * stride + 2]?.result as string) ?? "") : "";
      out.push({
        address: addrs[i],
        username,
        balance,
        goal,
        progressPct: goal > 0 ? Math.min(100, (balance / goal) * 100) : 0,
        pendingYield,
        xp,
        level: 1 + Math.floor(xp / 250),
      });
    }
    const key: Record<SortKey, (r: LeaderRow) => number> = {
      balance: (r) => r.balance,
      progress: (r) => r.progressPct,
      yield: (r) => r.pendingYield,
      xp: (r) => r.xp,
    };
    return out.sort((a, b) => key[sortBy](b) - key[sortBy](a));
  }, [batch.data, addrs, sortBy]);

  const { isDemo } = useDemoMode();
  if (isDemo) {
    const key: Record<SortKey, (r: LeaderRow) => number> = {
      balance: (r) => r.balance,
      progress: (r) => r.progressPct,
      yield: (r) => r.pendingYield,
      xp: (r) => r.xp,
    };
    const demoRows = demoLeaderboard().sort((a, b) => key[sortBy](b) - key[sortBy](a));
    return { rows: demoRows, isLoading: false, deployed: true, count: demoRows.length };
  }

  return {
    rows,
    isLoading: usersRead.isLoading || batch.isLoading,
    deployed: isVaultDeployed,
    count: addrs.length,
  };
}
