import {
  createPublicClient,
  http,
  formatEther,
  isAddress,
  getAddress,
  decodeEventLog,
  type Address,
} from "viem";
import { liteforge } from "@/lib/chains";
import { forgeVaultAbi, forgeActionLogAbi } from "@/lib/abi";
import { VAULT_ADDRESS, ACTIONLOG_ADDRESS, VAULT_DEPLOY_BLOCK, isActionLogDeployed, isVaultDeployed } from "@/lib/contracts";

export const revalidate = 0;

const client = createPublicClient({ chain: liteforge, transport: http() });

// Block the ForgeActionLog was deployed at (it may be deployed later, e.g. via Dappit).
const ACTIONLOG_DEPLOY_BLOCK = BigInt(process.env.NEXT_PUBLIC_ACTIONLOG_DEPLOY_BLOCK ?? "0");

type Decision = {
  id: number;
  actor: string;
  kind: number;
  engine: number;
  attested: boolean;
  amount: string;
  reason: string;
  txHash: string;
  block: number;
  timestamp: number;
  // best-effort pairing with the vault tx the decision describes ("what" for this "why")
  outcomeTx?: string;
  outcomeType?: string;
  outcomeAmount?: string;
};

// kind (ForgeActionLog) -> the vault activity type that should settle it
const KIND_TO_VAULT: Record<number, string> = {
  0: "deposit", // Deposit
  1: "withdraw", // Withdraw
  2: "mode", // SetMode
  3: "yield", // ClaimYield
  4: "goal", // SetGoal
  6: "yield", // AutoCompound
  7: "deposit", // AutoDCA
};

let cache: { at: number; items: Decision[] } | null = null;
const TTL_MS = 8_000;

async function getLogsChunked(
  address: Address,
  fromBlock: bigint,
  toBlock: bigint,
  depth = 0
): Promise<Awaited<ReturnType<typeof client.getLogs>>> {
  try {
    return await client.getLogs({ address, fromBlock, toBlock });
  } catch (err) {
    if (depth > 12 || toBlock - fromBlock <= 1n) throw err;
    const mid = fromBlock + (toBlock - fromBlock) / 2n;
    const [a, b] = await Promise.all([
      getLogsChunked(address, fromBlock, mid, depth + 1),
      getLogsChunked(address, mid + 1n, toBlock, depth + 1),
    ]);
    return [...a, ...b];
  }
}

type VaultEvent = { type: string; user: string; amount?: string; block: number; txHash: string };

function decodeVault(log: { data: `0x${string}`; topics: [`0x${string}`, ...`0x${string}`[]] | [] }): Omit<VaultEvent, "block" | "txHash"> | null {
  try {
    const ev = decodeEventLog({ abi: forgeVaultAbi, data: log.data, topics: log.topics });
    const args = ev.args as Record<string, unknown>;
    const user = (args.user as Address) ?? "";
    switch (ev.eventName) {
      case "Deposited":
        return { type: "deposit", user, amount: formatEther(args.amount as bigint) };
      case "Withdrawn":
        return { type: "withdraw", user, amount: formatEther(args.amount as bigint) };
      case "ModeChanged":
        return { type: "mode", user };
      case "GoalSet":
        return { type: "goal", user, amount: formatEther(args.goal as bigint) };
      case "YieldClaimed":
        return { type: "yield", user, amount: formatEther(args.amount as bigint) };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  if (!isActionLogDeployed) return Response.json({ items: [] });

  const url = new URL(request.url);
  const userParam = url.searchParams.get("user");
  const userFilter = userParam && isAddress(userParam) ? getAddress(userParam) : null;

  try {
    let items: Decision[];
    if (cache && Date.now() - cache.at < TTL_MS) {
      items = cache.items;
    } else {
      const head = await client.getBlockNumber();
      // Bound the scan: use the deploy block if set, else clamp to a recent window so an
      // unset env can't trigger a genesis-to-head scan on every cache miss.
      // ~2.3 days @2s blocks when a deploy block isn't set. TODO: persist a lastScannedBlock
      // watermark or use the Blockscout indexed API for production-scale feeds.
      const SCAN_WINDOW = 100_000n;
      const floor = (deployBlock: bigint) => (deployBlock > 0n ? deployBlock : head > SCAN_WINDOW ? head - SCAN_WINDOW : 0n);

      // 1) decision log entries (the "why", on-chain)
      const rawDecisions = await getLogsChunked(ACTIONLOG_ADDRESS, floor(ACTIONLOG_DEPLOY_BLOCK), head);
      const decisions: Decision[] = [];
      for (const log of rawDecisions) {
        try {
          const ev = decodeEventLog({ abi: forgeActionLogAbi, data: log.data, topics: log.topics });
          if (ev.eventName !== "ActionLogged") continue;
          const a = ev.args as Record<string, unknown>;
          decisions.push({
            id: Number(a.id),
            actor: getAddress(a.actor as Address),
            kind: Number(a.kind),
            engine: Number(a.engine),
            attested: Boolean(a.attested),
            amount: formatEther(a.amount as bigint),
            reason: a.reason as string,
            txHash: log.transactionHash ?? "",
            block: Number(log.blockNumber ?? 0n),
            timestamp: 0,
          });
        } catch {
          /* skip undecodable */
        }
      }
      decisions.sort((x, y) => y.block - x.block || y.id - x.id);
      const recent = decisions.slice(0, 40);

      // 2) block timestamps (deduped) for "x ago" display
      const blocks = [...new Set(recent.map((d) => d.block))];
      const tsEntries = await Promise.all(
        blocks.map(async (b) => {
          try {
            const blk = await client.getBlock({ blockNumber: BigInt(b) });
            return [b, Number(blk.timestamp)] as const;
          } catch {
            return [b, 0] as const;
          }
        })
      );
      const tsMap = new Map(tsEntries);

      // 3) vault events (the "what") indexed by actor, for best-effort pairing
      const byActor = new Map<string, VaultEvent[]>();
      if (isVaultDeployed) {
        const rawVault = await getLogsChunked(VAULT_ADDRESS, floor(VAULT_DEPLOY_BLOCK), head);
        for (const log of rawVault) {
          const d = decodeVault({ data: log.data, topics: log.topics as [`0x${string}`, ...`0x${string}`[]] | [] });
          if (!d || !d.user) continue;
          const key = getAddress(d.user as Address);
          const arr = byActor.get(key) ?? [];
          arr.push({ ...d, block: Number(log.blockNumber ?? 0n), txHash: log.transactionHash ?? "" });
          byActor.set(key, arr);
        }
      }

      // 4) attach timestamp + nearest matching vault tx (same actor, compatible type,
      //    settled at or just before the notarize - which is signed right after the action)
      for (const d of recent) {
        d.timestamp = tsMap.get(d.block) ?? 0;
        const wantType = KIND_TO_VAULT[d.kind];
        if (!wantType) continue;
        const candidates = (byActor.get(d.actor) ?? [])
          .filter((e) => e.type === wantType && e.block <= d.block && d.block - e.block <= 10)
          .sort((a, b) => b.block - a.block);
        if (candidates[0]) {
          d.outcomeTx = candidates[0].txHash;
          d.outcomeType = candidates[0].type;
          d.outcomeAmount = candidates[0].amount;
        }
      }

      items = recent;
      cache = { at: Date.now(), items };
    }

    const filtered = userFilter ? items.filter((i) => i.actor === userFilter) : items;
    return Response.json({ items: filtered });
  } catch (err) {
    console.error("decisions route error:", err);
    return Response.json({ items: [], error: "indexing_failed" }, { status: 200 });
  }
}
