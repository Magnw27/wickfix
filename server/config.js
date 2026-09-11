import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.join(__dirname, '..')

function loadEnv() {
  try {
    const content = fs.readFileSync(path.join(ROOT, '.env'), 'utf8')
    for (const line of content.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq === -1) continue
      const k = t.slice(0, eq).trim()
      let v = t.slice(eq + 1).trim()
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
      if (!(k in process.env)) process.env[k] = v
    }
  } catch {}
}

loadEnv()

export const config = {
  port: Number(process.env.PORT || 8000),
  openRouterBase: (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, ''),
  apiKey: process.env.OPENROUTER_API_KEY || '',
  appTitle: process.env.APP_TITLE || 'WickAI',
  appReferer: process.env.APP_REFERER || '',
  defaultModel: process.env.DEFAULT_MODEL || 'openrouter/free',
  defaultImageModel: process.env.DEFAULT_IMAGE_MODEL || 'google/gemini-2.5-flash-image',
  heartbeatMs: Number(process.env.HEARTBEAT_MS || 15000),
  chatRateWindowMs: Number(process.env.CHAT_RATE_WINDOW_MS || 60000),
  chatRateMax: Number(process.env.CHAT_RATE_MAX || 30),
  generalRateWindowMs: Number(process.env.GENERAL_RATE_WINDOW_MS || 60000),
  generalRateMax: Number(process.env.GENERAL_RATE_MAX || 120),
  modelsCacheTtlMs: Number(process.env.MODELS_CACHE_TTL_MS || 600000),
  publicDir: path.join(ROOT, 'public'),
}