import type { Address } from "viem";
import { forgeVaultAbi, forgeProfileAbi, forgeActionLogAbi } from "./abi";

const ZERO = "0x0000000000000000000000000000000000000000" as const;

/** Deployed ForgeVault address — set NEXT_PUBLIC_VAULT_ADDRESS after deploy. */
export const VAULT_ADDRESS = (process.env.NEXT_PUBLIC_VAULT_ADDRESS ?? ZERO) as Address;
export const STRATEGY_ADDRESS = (process.env.NEXT_PUBLIC_STRATEGY_ADDRESS ?? ZERO) as Address;
export const PROFILE_ADDRESS = (process.env.NEXT_PUBLIC_PROFILE_ADDRESS ?? ZERO) as Address;
/** ForgeActionLog — the on-chain agent-decision ledger (deployable via Dappit). */
export const ACTIONLOG_ADDRESS = (process.env.NEXT_PUBLIC_ACTIONLOG_ADDRESS ?? ZERO) as Address;

/** Block the vault was deployed at — pins the activity-feed log scan lower bound. */
export const VAULT_DEPLOY_BLOCK = BigInt(process.env.NEXT_PUBLIC_VAULT_DEPLOY_BLOCK ?? "0");

export const isVaultDeployed = VAULT_ADDRESS !== ZERO;
export const isProfileDeployed = PROFILE_ADDRESS !== ZERO;
export const isActionLogDeployed = ACTIONLOG_ADDRESS !== ZERO;

export const vaultContract = { address: VAULT_ADDRESS, abi: forgeVaultAbi } as const;
export const profileContract = { address: PROFILE_ADDRESS, abi: forgeProfileAbi } as const;
export const actionLogContract = { address: ACTIONLOG_ADDRESS, abi: forgeActionLogAbi } as const;

export enum Mode {
  Stack = 0,
  Grow = 1,
}
