const startedAt = Date.now()
const counters = new Map()

export function increment(name, value = 1) {
  counters.set(name, (counters.get(name) || 0) + value)
  return counters.get(name)
}

export function snapshot() {
  return {
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    counters: Object.fromEntries(counters),
    timestamp: new Date().toISOString(),
  }
}

export function logEvent(event, fields = {}) {
  console.info(JSON.stringify({
    event,
    ...fields,
    timestamp: new Date().toISOString(),
  }))
}
