import "server-only";

const buckets = new Map<string, number[]>();

function limitPerMinute(): number {
  return Number(process.env.YUTE_RATE_LIMIT_PER_MIN ?? 60);
}

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

/** Simple in-memory sliding-window limiter (single-process; swap for Redis when scaled out). */
export function rateLimit(key: string, limitOverride?: number): RateLimitResult {
  const limit = limitOverride ?? limitPerMinute();
  const now = Date.now();
  const windowStart = now - 60_000;
  const hits = (buckets.get(key) ?? []).filter((t) => t > windowStart);

  if (hits.length >= limit) {
    buckets.set(key, hits);
    const retryAfterSeconds = Math.max(1, Math.ceil((hits[0] + 60_000 - now) / 1000));
    return { ok: false, limit, remaining: 0, retryAfterSeconds };
  }

  hits.push(now);
  buckets.set(key, hits);
  return { ok: true, limit, remaining: Math.max(0, limit - hits.length), retryAfterSeconds: 0 };
}

/** Test helper. */
export function resetRateLimit(): void {
  buckets.clear();
}
