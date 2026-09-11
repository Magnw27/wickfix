export class TTLCache {
  constructor(ttlMs = 600000, maxEntries = 1000) {
    this.ttlMs = Math.max(1000, Number(ttlMs) || 600000)
    this.maxEntries = Math.max(10, Number(maxEntries) || 1000)
    this.map = new Map()
  }

  get(key) {
    const item = this.map.get(key)
    if (!item) return undefined
    if (item.expiresAt <= Date.now()) {
      this.map.delete(key)
      return undefined
    }
    return item.value
  }

  set(key, value, ttlMs = this.ttlMs) {
    if (this.map.size >= this.maxEntries && !this.map.has(key)) {
      const oldest = this.map.keys().next().value
      if (oldest !== undefined) this.map.delete(oldest)
    }
    this.map.delete(key)
    this.map.set(key, { value, expiresAt: Date.now() + Math.max(1000, Number(ttlMs) || this.ttlMs) })
    return value
  }

  delete(key) { return this.map.delete(key) }
  clear() { this.map.clear() }
  size() { return this.map.size }
}
