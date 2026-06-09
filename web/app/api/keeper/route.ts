import { createPublicClient, createWalletClient, http, formatEther, getAddress, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { liteforge } from "@/lib/chains";
import { forgeVaultAbi, forgeActionLogAbi } from "@/lib/abi";
import { VAULT_ADDRESS, ACTIONLOG_ADDRESS, isVaultDeployed, isActionLogDeployed } from "@/lib/contracts";
import { ActionEngine, ActionKind } from "@/lib/actionlog";
import { signDecision } from "@/lib/attest";

export const maxDuration = 60;

const publicClient = createPublicClient({ chain: liteforge, transport: http() });

const COMPOUND_THRESHOLD = 0.01; // zkLTC of pending yield before auto-claiming
const MAX_REASON = 160; // matches ForgeActionLog.MAX_REASON (bytes; reasons below are ASCII)

type Wallet = ReturnType<typeof createWalletClient>;
type KeeperAccount = ReturnType<typeof privateKeyToAccount>;

/**
 * Notarize a keeper decision on the ForgeActionLog as a *verified* entry: the keeper key
 * (registered on-chain as trustedSigner) signs the decision, and logAttested records it with
 * attested=true. This turns "the agent says it compounded" into on-chain proof it did.
 * Best-effort: a notarize failure never blocks the actual vault action.
 */
async function notarizeDecision(
  wallet: Wallet,
  account: KeeperAccount,
  p: { user: Address; kind: ActionKind; engine: ActionEngine; amount: bigint; reason: string }
): Promise<string | undefined> {
  if (!isActionLogDeployed) return undefined;
  try {
    const nonce = (await publicClient.readContract({
      address: ACTIONLOG_ADDRESS,
      abi: forgeActionLogAbi,
      functionName: "attestNonce",
      args: [p.user],
    })) as bigint;
    const reason = p.reason.length > MAX_REASON ? p.reason.slice(0, MAX_REASON) : p.reason;
    const sig = await signDecision(account, {
      actionLog: ACTIONLOG_ADDRESS,
      chainId: liteforge.id,
      actor: p.user,
      kind: p.kind,
      engine: p.engine,
      amount: p.amount,
      reason,
      nonce,
    });
    return await wallet.writeContract({
      address: ACTIONLOG_ADDRESS,
      abi: forgeActionLogAbi,
      functionName: "logAttested",
      args: [p.user, p.kind, p.engine, p.amount, reason, nonce, sig],
      chain: liteforge,
      account,
    });
  } catch (err) {
    console.error("notarize failed:", err instanceof Error ? err.message : err);
    return undefined;
  }
}

function keeperAccount() {
  const pk = process.env.KEEPER_PRIVATE_KEY;
  if (!pk) return null;
  try {
    return privateKeyToAccount((pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`);
  } catch {
    return null;
  }
}

// Auth gate so a public URL can't drive the keeper's wallet.
function authorized(request: Request): boolean {
  const secret = process.env.KEEPER_CRON_SECRET;
  if (secret) {
    const url = new URL(request.url);
    return url.searchParams.get("secret") === secret || request.headers.get("x-keeper-secret") === secret;
  }
  // No secret configured: allowed in development (so the "Run keeper now" demo button works),
  // but FAIL CLOSED in production — there you must set KEEPER_CRON_SECRET and call via cron.
  return process.env.NODE_ENV !== "production";
}

// Single-flight guard: prevents overlapping ticks (cron + manual) from racing nonces.
let ticking = false;

export async function GET() {
  const account = keeperAccount();
  return Response.json({
    configured: isVaultDeployed && !!account,
    keeper: account?.address ?? null,
    vault: isVaultDeployed ? VAULT_ADDRESS : null,
  });
}

type State = readonly [number, bigint, bigint, bigint, bigint, bigint, bigint, bigint];
type Auth = readonly [boolean, boolean, bigint];

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const account = keeperAccount();
  if (!isVaultDeployed || !account) {
    return Response.json({ ran: 0, actions: [], note: "keeper not configured (set KEEPER_PRIVATE_KEY)" });
  }
  if (ticking) return Response.json({ ran: 0, actions: [], note: "keeper tick already in progress" });
  ticking = true;

  const wallet = createWalletClient({ account, chain: liteforge, transport: http() });
  const now = BigInt(Math.floor(Date.now() / 1000));
  const actions: { user: string; action: string; txHash: string; decisionTx?: string }[] = [];

  try {
    const users = (await publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: forgeVaultAbi,
      functionName: "getUsers",
      args: [0n, 100n],
    })) as readonly Address[];

    for (const user of users) {
      const [auth, state] = (await Promise.all([
        publicClient.readContract({ address: VAULT_ADDRESS, abi: forgeVaultAbi, functionName: "agentAuth", args: [user] }),
        publicClient.readContract({ address: VAULT_ADDRESS, abi: forgeVaultAbi, functionName: "getVaultState", args: [user] }),
      ])) as [Auth, State];

      const [compound, rebalance, expiry] = auth;
      if (expiry <= now) continue; // grant inactive/expired

      const mode = Number(state[0]); // 0 Stack, 1 Grow
      const pendingYield = +formatEther(state[3]);
      const goal = +formatEther(state[5]);
      const projected = +formatEther(state[7]);

      // Rule 1 — auto-compound: claim yield once it crosses the threshold.
      if (compound && pendingYield >= COMPOUND_THRESHOLD) {
        const txHash = await wallet.writeContract({
          address: VAULT_ADDRESS,
          abi: forgeVaultAbi,
          functionName: "agentClaimYield",
          args: [user],
        });
        const decisionTx = await notarizeDecision(wallet, account, {
          user: getAddress(user),
          kind: ActionKind.AutoCompound,
          engine: ActionEngine.Rules,
          amount: state[3], // pending yield wei, compounded
          reason: `Auto-compound: pending ${pendingYield.toFixed(4)} zkLTC >= ${COMPOUND_THRESHOLD} threshold`,
        });
        actions.push({ user: getAddress(user), action: `compounded ${pendingYield.toFixed(4)} zkLTC`, txHash, decisionTx });
        continue; // one action per user per tick
      }

      // Rule 2 — auto-rebalance: if behind goal in Stack mode, move to Grow.
      if (rebalance && mode === 0 && goal > 0 && projected < goal) {
        const txHash = await wallet.writeContract({
          address: VAULT_ADDRESS,
          abi: forgeVaultAbi,
          functionName: "agentSetMode",
          args: [user, 1],
        });
        const decisionTx = await notarizeDecision(wallet, account, {
          user: getAddress(user),
          kind: ActionKind.SetMode,
          engine: ActionEngine.Rules,
          amount: 0n,
          reason: `Rebalance Stack to Grow: projected ${projected.toFixed(4)} < goal ${goal.toFixed(4)} zkLTC`,
        });
        actions.push({ user: getAddress(user), action: "rebalanced Stack → Grow toward goal", txHash, decisionTx });
      }
    }

    return Response.json({ ran: actions.length, actions, keeper: account.address });
  } catch (err) {
    // Log only the short message — never the full object (avoids leaking tx/RPC context).
    console.error("keeper tick error:", err instanceof Error ? err.message : err);
    return Response.json({ ran: actions.length, actions, error: "keeper_tick_failed" }, { status: 200 });
  } finally {
    ticking = false;
  }
}
