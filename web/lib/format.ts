import { formatEther, parseEther } from "viem";

/** Format a wei bigint as a zkLTC string with `dp` decimals. */
export function fmtZk(wei: bigint | undefined, dp = 4): string {
  if (wei === undefined) return "0";
  const n = Number(formatEther(wei));
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: dp });
}

/** Float zkLTC -> formatted string. */
export function fmtNum(n: number, dp = 4): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: dp });
}

export function toWei(amount: string): bigint {
  return parseEther(amount as `${number}`);
}

export function weiToNum(wei: bigint | undefined): number {
  return wei === undefined ? 0 : Number(formatEther(wei));
}

export function shortAddr(addr?: string): string {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function pct(value: number, max = 100): number {
  if (max <= 0) return 0;
  return Math.min(100, Math.max(0, (value / max) * 100));
}

/** Current unix time in seconds. Wrapped so callers can read "now" during render
 *  without tripping the react-compiler purity rule on a bare Date.now(). */
export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}
