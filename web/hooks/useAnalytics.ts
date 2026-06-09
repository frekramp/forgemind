"use client";

import { useReadContract } from "wagmi";
import { vaultContract, isVaultDeployed } from "@/lib/contracts";
import { weiToNum } from "@/lib/format";
import { useDemoMode } from "@/components/DemoProvider";
import { demoAnalytics } from "@/lib/demo";

export type Analytics = {
  tvl: number;
  users: number;
  aprPct: number;
  daysToHalving: number;
};

export function useAnalytics() {
  const { isDemo } = useDemoMode();
  const read = useReadContract({
    ...vaultContract,
    functionName: "globalStats",
    query: { enabled: isVaultDeployed && !isDemo, refetchInterval: 15_000 },
  });

  const d = read.data as readonly [bigint, bigint, bigint, bigint] | undefined;
  const data: Analytics | undefined = d
    ? {
        tvl: weiToNum(d[0]),
        users: Number(d[1]),
        aprPct: Number(d[2]) / 100,
        daysToHalving: Number(d[3]),
      }
    : undefined;

  if (isDemo) return { data: demoAnalytics(), isLoading: false, deployed: true };

  return { data, isLoading: read.isLoading, deployed: isVaultDeployed };
}
