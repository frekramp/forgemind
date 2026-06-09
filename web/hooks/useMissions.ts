"use client";

import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { zeroAddress } from "viem";
import { useEffect, useState } from "react";
import { profileContract, isProfileDeployed } from "@/lib/contracts";
import { levelProgress } from "@/lib/missions";
import { useDemoMode } from "@/components/DemoProvider";
import { DEMO_MISSION_STATE, DEMO_USERNAME } from "@/lib/demo";

export type MissionState = {
  totalXp: number;
  level: number;
  claimedCount: number;
  met: boolean[];
  done: boolean[];
  progress: ReturnType<typeof levelProgress>;
};

export function useMissions() {
  const { address } = useAccount();
  const { isDemo } = useDemoMode();
  const enabled = !!address && isProfileDeployed;

  const read = useReadContract({
    ...profileContract,
    functionName: "profileOf",
    args: [address ?? zeroAddress],
    query: { enabled, refetchInterval: 12_000 },
  });

  const nameRead = useReadContract({
    ...profileContract,
    functionName: "username",
    args: [address ?? zeroAddress],
    query: { enabled },
  });

  const d = read.data as readonly [bigint, bigint, bigint, readonly boolean[], readonly boolean[]] | undefined;
  const state: MissionState | undefined = d
    ? {
        totalXp: Number(d[0]),
        level: Number(d[1]),
        claimedCount: Number(d[2]),
        met: [...d[3]],
        done: [...d[4]],
        progress: levelProgress(Number(d[0])),
      }
    : undefined;

  const { writeContractAsync, isPending } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isSuccess) {
      read.refetch();
      const t = setTimeout(() => setHash(undefined), 1500);
      return () => clearTimeout(t);
    }
  }, [isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  async function claimMission(id: number) {
    const h = await writeContractAsync({
      ...profileContract,
      functionName: "claimMission",
      args: [id],
    } as never);
    setHash(h);
    return h;
  }

  async function setUsername(name: string) {
    const h = await writeContractAsync({
      ...profileContract,
      functionName: "setUsername",
      args: [name],
    } as never);
    setHash(h);
    return h;
  }

  if (isDemo) {
    const noop = async (...args: unknown[]): Promise<undefined> => {
      void args;
      return undefined;
    };
    return {
      state: DEMO_MISSION_STATE,
      username: DEMO_USERNAME,
      deployed: true,
      busy: false,
      claimMission: noop,
      setUsername: noop,
      refetch: noop,
    };
  }

  return {
    state,
    username: (nameRead.data as string | undefined) ?? "",
    deployed: isProfileDeployed,
    busy: isPending || isConfirming,
    claimMission,
    setUsername,
    refetch: read.refetch,
  };
}
