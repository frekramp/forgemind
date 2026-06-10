"use client";

import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { zeroAddress } from "viem";
import { useEffect, useState } from "react";
import { vaultContract, isVaultDeployed } from "@/lib/contracts";
import { nowSec } from "@/lib/format";
import { useDemoMode } from "@/components/DemoProvider";

export type KeeperAuth = { compound: boolean; rebalance: boolean; expiry: number };

/**
 * On-chain autonomous keeper grant. The user authorizes a server-side keeper to
 * auto-compound and/or auto-rebalance their OWN funds, capped by an expiry and revocable.
 */
export function useKeeper() {
  const { address } = useAccount();
  const { isDemo } = useDemoMode();
  const enabled = !!address && isVaultDeployed;

  const authRead = useReadContract({
    ...vaultContract,
    functionName: "agentAuth",
    args: [address ?? zeroAddress],
    query: { enabled, refetchInterval: 12_000 },
  });

  const agentRead = useReadContract({
    ...vaultContract,
    functionName: "agent",
    query: { enabled: isVaultDeployed },
  });

  const rawData = authRead.data as readonly [boolean, boolean, bigint] | undefined;
  // #10: validate tuple shape before trusting it (guards ABI drift / malformed RPC data).
  const raw = Array.isArray(rawData) && rawData.length >= 3 ? rawData : undefined;
  const now = nowSec();
  const auth: KeeperAuth = raw
    ? { compound: raw[0], rebalance: raw[1], expiry: Number(raw[2]) }
    : { compound: false, rebalance: false, expiry: 0 };

  const { writeContractAsync, isPending } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isSuccess) {
      authRead.refetch();
      const t = setTimeout(() => setHash(undefined), 1500);
      return () => clearTimeout(t);
    }
  }, [isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps -- runs only on confirmation; authRead.refetch identity is stable

  async function authorize(compound: boolean, rebalance: boolean, durationSec: number) {
    const expiry = BigInt(Math.floor(Date.now() / 1000) + durationSec);
    const h = await writeContractAsync({
      ...vaultContract,
      functionName: "authorizeAgent",
      args: [compound, rebalance, expiry],
    } as never);
    setHash(h);
    return h;
  }

  async function revoke() {
    const h = await writeContractAsync({
      ...vaultContract,
      functionName: "revokeAgent",
      args: [],
    } as never);
    setHash(h);
    return h;
  }

  // ⚠️ #5: all hooks above run unconditionally (rules-of-hooks compliant). The returns below
  // are render-time branches — do NOT add hooks past this point.
  if (isDemo) {
    const noop = async (): Promise<undefined> => undefined;
    return {
      auth: { compound: true, rebalance: true, expiry: now + 6 * 86400 },
      agentConfigured: true,
      active: true,
      busy: false,
      authorize: noop,
      revoke: noop,
      refetch: noop,
    };
  }

  const active = auth.expiry > now && (auth.compound || auth.rebalance);

  return {
    auth,
    agentConfigured: (agentRead.data as `0x${string}` | undefined ?? zeroAddress) !== zeroAddress,
    active,
    busy: isPending || isConfirming,
    authorize,
    revoke,
    refetch: authRead.refetch,
  };
}

export type Keeper = ReturnType<typeof useKeeper>;
