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
import { forgeVaultAbi } from "@/lib/abi";
import { VAULT_ADDRESS, VAULT_DEPLOY_BLOCK, isVaultDeployed } from "@/lib/contracts";

export const revalidate = 0; // dynamic; we cache in-process below

const client = createPublicClient({ chain: liteforge, transport: http() });

type Item = {
  type: "deposit" | "withdraw" | "mode" | "goal" | "yield";
  user: string;
  amount?: string;
  mode?: number;
  block: number;
  txHash: string;
  logIndex: number;
};

// in-process TTL cache so repeated loads during a demo don't hammer the RPC
let cache: { at: number; items: Item[] } | null = null;
const TTL_MS = 20_000;

/** getLogs with adaptive bisection - halves the range on "range too large"/"too many results". */
async function getLogsChunked(fromBlock: bigint, toBlock: bigint, depth = 0): Promise<Item[]> {
  try {
    const logs = await client.getLogs({
      address: VAULT_ADDRESS,
      fromBlock,
      toBlock,
    });
    const items: Item[] = [];
    for (const log of logs) {
      const decoded = tryDecode(log.data, log.topics);
      if (!decoded) continue;
      items.push({
        ...decoded,
        block: Number(log.blockNumber ?? 0n),
        txHash: log.transactionHash ?? "",
        logIndex: log.logIndex ?? 0,
      });
    }
    return items;
  } catch (err) {
    // bisect on range/result-size errors; bail out if the window is already tiny
    if (depth > 12 || toBlock - fromBlock <= 1n) throw err;
    const mid = fromBlock + (toBlock - fromBlock) / 2n;
    const [a, b] = await Promise.all([
      getLogsChunked(fromBlock, mid, depth + 1),
      getLogsChunked(mid + 1n, toBlock, depth + 1),
    ]);
    return [...a, ...b];
  }
}

function tryDecode(data: `0x${string}`, topics: [signature: `0x${string}`, ...args: `0x${string}`[]] | []) {
  try {
    const ev = decodeEventLog({ abi: forgeVaultAbi, data, topics });
    const args = ev.args as Record<string, unknown>;
    const user = (args.user as Address) ?? "";
    switch (ev.eventName) {
      case "Deposited":
        return { type: "deposit" as const, user, amount: formatEther(args.amount as bigint), mode: Number(args.mode) };
      case "Withdrawn":
        return { type: "withdraw" as const, user, amount: formatEther(args.amount as bigint) };
      case "ModeChanged":
        return { type: "mode" as const, user, mode: Number(args.mode) };
      case "GoalSet":
        return { type: "goal" as const, user, amount: formatEther(args.goal as bigint) };
      case "YieldClaimed":
        return { type: "yield" as const, user, amount: formatEther(args.amount as bigint) };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  if (!isVaultDeployed) return Response.json({ items: [] });

  const url = new URL(request.url);
  const userParam = url.searchParams.get("user");
  const userFilter = userParam && isAddress(userParam) ? getAddress(userParam) : null;

  try {
    let items: Item[];
    if (cache && Date.now() - cache.at < TTL_MS) {
      items = cache.items;
    } else {
      const head = await client.getBlockNumber();
      // Bound the scan to a recent window when the deploy block isn't configured (~2.3 days
      // @2s blocks). TODO: persist a lastScannedBlock watermark or use the Blockscout indexed
      // API for production-scale feeds instead of re-scanning a large window per cache miss.
      const SCAN_WINDOW = 100_000n;
      const fromBlock = VAULT_DEPLOY_BLOCK > 0n ? VAULT_DEPLOY_BLOCK : head > SCAN_WINDOW ? head - SCAN_WINDOW : 0n;
      items = await getLogsChunked(fromBlock, head);
      items.sort((a, b) => b.block - a.block || b.logIndex - a.logIndex);
      items = items.slice(0, 100); // most recent 100
      cache = { at: Date.now(), items };
    }
    const filtered = userFilter
      ? items.filter((i) => getAddress(i.user) === userFilter)
      : items;
    return Response.json({ items: filtered.slice(0, 60) });
  } catch (err) {
    console.error("activity route error:", err);
    return Response.json({ items: [], error: "indexing_failed" }, { status: 200 });
  }
}
