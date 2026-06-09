// Lightweight, dependency-free fixed-window rate limiter keyed by an arbitrary id (usually
// the client IP). A cheap first line of defense against casual cost-abuse of the public AI
// endpoint.
//
// NOTE: state lives in module memory, so on serverless it is PER-INSTANCE — it throttles a
// single warm instance, not the whole fleet. For a hard global cap, put a WAF rule or a
// shared store (Vercel KV / Upstash) in front. This still meaningfully blunts a single
// abuser hammering one instance, and pairs with the same-origin check on /api/agent.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = { ok: boolean; remaining: number; retryAfter: number };

export function rateLimit(id: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  // Opportunistic GC so the map can't grow unbounded across many distinct ids.
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
  }

  const b = buckets.get(id);
  if (!b || now >= b.resetAt) {
    buckets.set(id, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfter: 0 };
  }
  b.count++;
  if (b.count > limit) {
    return { ok: false, remaining: 0, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }
  return { ok: true, remaining: limit - b.count, retryAfter: 0 };
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for / x-real-ip). */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/**
 * CSRF-style guard for browser-only endpoints. When an Origin header is present (every
 * cross-site and same-origin browser POST sends one), it must match the request host or an
 * explicit allowlist (AGENT_ALLOWED_ORIGINS, comma-separated). A missing Origin is allowed
 * through to rate-limiting only — so legitimate server-side/tooling calls aren't hard-blocked
 * while drive-by abuse embedded on another site is.
 */
export function originAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // no Origin (curl/server) → defer to rate limiting
  try {
    const o = new URL(origin);
    const host = request.headers.get("host");
    if (host && o.host === host) return true;
  } catch {
    /* malformed Origin → fall through to allowlist */
  }
  const allow = (process.env.AGENT_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return allow.includes(origin);
}
