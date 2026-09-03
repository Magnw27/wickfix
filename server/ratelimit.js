const buckets = new Map()

export function rateLimit(key, windowMs, max) {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || now - b.start >= windowMs) {
    buckets.set(key, { start: now, count: 1 })
    return true
  }
  b.count++
  return b.count <= max
}

export function cleanupBuckets() {
  const now = Date.now()
  for (const [k, b] of buckets) {
    if (now - b.start > 120000) buckets.delete(k)
  }
}

setInterval(cleanupBuckets, 60000).unref()