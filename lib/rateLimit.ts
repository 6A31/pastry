// Simple in-memory rate limiter (per-process). Suitable for single instance or dev.
// For production horizontal scale, replace with Redis or another shared store.

interface Bucket {
  count: number;
  reset: number; // epoch ms when window resets
}

const buckets: Map<string, Bucket> = new Map();

function now() { return Date.now(); }

export interface RateResult {
  allowed: boolean;
  remaining: number;
  reset: number; // epoch ms
  limit: number;
}

export function consume(key: string, limit: number, windowMs: number): RateResult {
  const ts = now();
  // Lazy cleanup of expired bucket
  let b = buckets.get(key);
  if (!b || ts >= b.reset) {
    b = { count: 0, reset: ts + windowMs };
    buckets.set(key, b);
  }
  if (b.count >= limit) {
    return { allowed: false, remaining: 0, reset: b.reset, limit };
  }
  b.count++;
  return { allowed: true, remaining: Math.max(0, limit - b.count), reset: b.reset, limit };
}

// Optional helper to format headers
export function rateHeaders(r: RateResult) {
  return {
    'X-RateLimit-Limit': String(r.limit),
    'X-RateLimit-Remaining': String(r.remaining),
    'X-RateLimit-Reset': String(Math.floor(r.reset / 1000))
  };
}

// Periodic cleanup to avoid unbounded map growth
let scheduled = false;
function scheduleCleanup() {
  if (scheduled) return;
  scheduled = true;
  setInterval(() => {
    const ts = now();
    for (const [k, v] of buckets) {
      if (ts >= v.reset) buckets.delete(k);
    }
  }, 60_000).unref?.();
}
scheduleCleanup();
