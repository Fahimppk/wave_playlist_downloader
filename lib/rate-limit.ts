type Bucket = { count: number; resetAt: number };

// Process-local guard for the single-instance personal-use deployment. Use a shared
// store-backed limiter when deploying multiple server instances.
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || now >= current.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 2000) {
      for (const [bucketKey, bucket] of buckets) if (now >= bucket.resetAt) buckets.delete(bucketKey);
    }
    return { allowed: true, retryAfter: 0 };
  }
  current.count += 1;
  return { allowed: current.count <= limit, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
}

export function requestIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
