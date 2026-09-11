const buckets = new Map()
const MAX_BUCKETS = 10_000
const CLEANUP_AFTER_MS = 120_000

export function rateLimit(key, windowMs, max) {
  const now = Date.now()
  const safeKey = String(key || 'unknown')
  const safeWindow = Math.max(1_000, Number(windowMs) || 60_000)
  const safeMax = Math.max(1, Number(max) || 1)
  const b = buckets.get(safeKey)

  if (!b || now - b.start >= safeWindow) {
    // Prevent an attacker from growing the in-memory key map without bound.
    if (buckets.size >= MAX_BUCKETS && !buckets.has(safeKey)) cleanupBuckets(now)
    if (buckets.size >= MAX_BUCKETS && !buckets.has(safeKey)) return false
    buckets.set(safeKey, { start: now, count: 1 })
    return true
  }

  b.count++
  return b.count <= safeMax
}

export function cleanupBuckets(now = Date.now()) {
  for (const [key, bucket] of buckets) {
    if (now - bucket.start > CLEANUP_AFTER_MS) buckets.delete(key)
  }
}

export function getRateLimitBucketCount() {
  return buckets.size
}

setInterval(() => cleanupBuckets(), 60_000).unref()
