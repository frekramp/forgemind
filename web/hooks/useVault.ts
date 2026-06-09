"use client";

import {
  useAccount,
  useBalance,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { zeroAddress } from "viem";
import { useCallback, useEffect, useMemo, useState } from "react";
import { vaultContract, isVaultDeployed, Mode } from "@/lib/contracts";
import { toWei, weiToNum } from "@/lib/format";
import { liteforge } from "@/lib/chains";
import { useDemoMode } from "@/components/DemoProvider";
import { DEMO_ADDRESS, DEMO_WALLET_BALANCE, demoVaultState } from "@/lib/demo";

export type VaultState = {
  mode: Mode;
  stack: number;
  growPrincipal: number;
  pendingYield: number;
  total: number;
  goal: number;
  daysToHalving: number;
  projected: number;
  raw: { total: bigint; goal: bigint; pendingYield: bigint };
};

export function useVault() {
  const { address, isConnected, chainId } = useAccount();
  const { isDemo } = useDemoMode();
  const enabled = !!address && isVaultDeployed;

  const { data: walletBal } = useBalance({
    address,
    query: { enabled: !!address, refetchInterval: 12_000 },
  });

  const read = useReadContract({
    ...vaultContract,
    functionName: "getVaultState",
    args: [address ?? zeroAddress],
    query: { enabled, refetchInterval: 10_000 },
  });

  const state: VaultState | undefined = useMemo(() => {
    const d = read.data as
      | readonly [number, bigint, bigint, bigint, bigint, bigint, bigint, bigint]
      | undefined;
    if (!d) return undefined;
    return {
      mode: Number(d[0]) as Mode,
      stack: weiToNum(d[1]),
      growPrincipal: weiToNum(d[2]),
      pendingYield: weiToNum(d[3]),
      total: weiToNum(d[4]),
      goal: weiToNum(d[5]),
      daysToHalving: Number(d[6]),
      projected: weiToNum(d[7]),
      raw: { total: d[4], goal: d[5], pendingYield: d[3] },
    };
  }, [read.data]);

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

  const run = useCallback(
    async (functionName: string, args: unknown[] = [], value?: bigint) => {
      const h = await writeContractAsync({
        ...vaultContract,
        functionName,
        args,
        value,
      } as never);
      setHash(h);
      return h;
    },
    [writeContractAsync]
  );

  const noop = useCallback(async (...args: unknown[]): Promise<undefined> => {
    void args;
    return undefined;
  }, []);

  if (isDemo) {
    return {
      address: DEMO_ADDRESS,
      isConnected: true,
      chainId: liteforge.id,
      walletBalance: DEMO_WALLET_BALANCE,
      state: demoVaultState(),
      isReading: false,
      refetch: noop,
      txPending: false,
      txConfirming: false,
      txHash: undefined as `0x${string}` | undefined,
      deposit: noop,
      withdraw: noop,
      withdrawAll: noop,
      setMode: noop,
      setGoal: noop,
      claimYield: noop,
    };
  }

  return {
    address,
    isConnected,
    chainId,
    walletBalance: walletBal ? weiToNum(walletBal.value) : 0,
    state,
    isReading: read.isLoading,
    refetch: read.refetch,
    txPending: isPending,
    txConfirming: isConfirming,
    txHash: hash,
    deposit: (amt: string) => run("deposit", [], toWei(amt)),
    withdraw: (amt: string) => run("withdraw", [toWei(amt)]),
    withdrawAll: () => run("withdrawAll", []),
    setMode: (m: Mode) => run("setMode", [m]),
    setGoal: (amt: string) => run("setHalvingGoal", [toWei(amt)]),
    claimYield: () => run("claimYield", []),
  };
}
