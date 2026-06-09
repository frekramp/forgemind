"use client";

import { useQuery } from "@tanstack/react-query";
import { useDemoMode } from "@/components/DemoProvider";
import { demoActivity } from "@/lib/demo";

export type ActivityItem = {
  type: "deposit" | "withdraw" | "mode" | "goal" | "yield";
  user: string;
  amount?: string;
  mode?: number;
  block: number;
  txHash: string;
};

async function fetchActivity(user?: string): Promise<ActivityItem[]> {
  const url = user ? `/api/activity?user=${user}` : "/api/activity";
  const res = await fetch(url);
  if (!res.ok) throw new Error("activity fetch failed");
  const json = await res.json();
  return json.items ?? [];
}

export function useActivity(user?: string) {
  const { isDemo } = useDemoMode();
  const q = useQuery({
    queryKey: ["activity", user ?? "all"],
    queryFn: () => fetchActivity(user),
    refetchInterval: 20_000,
    staleTime: 15_000,
    enabled: !isDemo,
  });
  if (isDemo) {
    const items = user ? demoActivity().filter((i) => i.user.toLowerCase() === user.toLowerCase()) : demoActivity();
    return { items, isLoading: false, error: null };
  }
  return { items: q.data ?? [], isLoading: q.isLoading, error: q.error };
}
