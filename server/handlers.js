import { config } from './config.js'
import { rateLimit } from './ratelimit.js'
import { fetchChatCompletion, fetchModels, fetchImageGeneration, friendlyError } from './openai.js'
import { getChats, saveChats } from './store.js'
import { webSearch } from './search.js'

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://unpkg.com https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com https://unpkg.com",
  'font-src https://fonts.gstatic.com https://unpkg.com',
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
].join('; ')

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                     */
/* ------------------------------------------------------------------ */
export function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()')
  res.setHeader('Content-Security-Policy', CSP)
}

export function clientIp(req) {
  const cf = req.headers['cf-connecting-ip']
  if (cf && typeof cf === 'string') return cf
  const fwd = req.headers['x-forwarded-for']
  if (fwd && typeof fwd === 'string') return fwd.split(',')[0].trim()
  const real = req.headers['x-real-ip']
  if (real && typeof real === 'string') return real
  return req.socket?.remoteAddress || 'unknown'
}

export function sendJson(res, status, data) {
  securityHeaders(res)
  const body = JSON.stringify(data)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(body)
}

export function sendError(res, status, error) {
  sendJson(res, status, { error })
}

/* Provider override — clients may bring their own API key / base URL. */
export function requestProvider(req) {
  const apiKey = String(req.headers['x-api-key'] || '').trim() || config.apiKey
  const raw = String(req.headers['x-api-base-url'] || '').trim() || config.openRouterBase
  let baseUrl = raw.replace(/\/+$/, '')
  try {
    const p = new URL(raw)
    if (p.protocol !== 'http:' && p.protocol !== 'https:') baseUrl = config.openRouterBase
  } catch {
    baseUrl = config.openRouterBase
  }
  return { apiKey, baseUrl }
}

export async function readJsonBody(req) {
  let body
  if (req.body !== undefined && req.body !== null) {
    body = req.body
  } else {
    let raw = ''
    for await (const chunk of req) raw += chunk
    body = raw
  }
  if (typeof body === 'string') return JSON.parse(body)
  if (Buffer.isBuffer(body)) return JSON.parse(body.toString('utf8'))
  return body
}

/* ------------------------------------------------------------------ */
/*  Chat streaming (SSE) — anti-buffer + heartbeat + abort handling    */
/* ------------------------------------------------------------------ */
export async function handleChat(req, res) {
  const ip = clientIp(req)
  const { apiKey, baseUrl } = requestProvider(req)

  if (!apiKey) {
    return sendError(res, 500, 'OPENROUTER_API_KEY belum dikonfigurasi di server.')
  }
  if (!rateLimit(ip, config.chatRateWindowMs, config.chatRateMax)) {
    return sendError(res, 429, 'Terlalu banyak permintaan. Tunggu beberapa saat lalu coba lagi.')
  }

  let payload
  try {
    payload = await readJsonBody(req)
  } catch {
    return sendError(res, 400, 'Body harus berupa JSON valid.')
  }

  const messages = Array.isArray(payload.messages) ? payload.messages : []
  if (messages.length === 0) {
    return sendError(res, 400, 'Field "messages" wajib diisi.')
  }

  const model = typeof payload.model === 'string' && payload.model ? payload.model : config.defaultModel

  const abort = new AbortController()
  const onClose = () => {
    if (!res.writableEnded) abort.abort()
  }
  req.on('close', onClose)

  let upstream
  try {
    upstream = await fetchChatCompletion({ model, messages, stream: true }, abort.signal, { apiKey, baseUrl })
  } catch (err) {
    if (err.name === 'AbortError') return
    return sendError(res, 502, 'Gagal terhubung ke OpenRouter. Periksa koneksi jaringan dan coba lagi.')
  }

  if (!upstream.ok) {
    let detail = ''
    try {
      detail = await upstream.text()
    } catch {}
    sendJson(res, upstream.status, {
      error: friendlyError(upstream.status),
      code: upstream.status,
      detail,
    })
    return
  }

  if (!upstream.body) {
    return sendError(res, 502, 'OpenRouter tidak mengembalikan stream.')
  }

  /* SSE response: disable buffering, keep-alive, heartbeat pings */
  securityHeaders(res)
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
    Connection: 'keep-alive',
  })
  res.write(': connected\n\n')

  const heartbeat = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(heartbeat)
      return
    }
    try {
      res.write(': ping\n\n')
    } catch {}
  }, config.heartbeatMs)

  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let idx
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        for (const line of raw.split('\n')) {
          if (!line.startsWith('data:')) continue
          const data = line.slice(5).trim()
          if (data === '[DONE]') {
            res.write('data: [DONE]\n\n')
            continue
          }
          try {
            const j = JSON.parse(data)
            if (j.error) {
              res.write(`data: ${JSON.stringify({ error: true, message: friendlyError(j.error.code) })}\n\n`)
              continue
            }
            const delta = j.choices?.[0]?.delta?.content
            if (delta) res.write(`data: ${JSON.stringify({ content: delta })}\n\n`)
          } catch {}
        }
      }
    }
    if (buffer) {
      const line = buffer.split('\n').find((l) => l.startsWith('data:'))
      if (line) {
        const data = line.slice(5).trim()
        if (data !== '[DONE]') {
          try {
            const j = JSON.parse(data)
            const delta = j.choices?.[0]?.delta?.content
            if (delta) res.write(`data: ${JSON.stringify({ content: delta })}\n\n`)
          } catch {}
        }
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      try {
        res.write(`data: ${JSON.stringify({ error: true, message: 'Koneksi ke provider terputus. Coba lagi.' })}\n\n`)
      } catch {}
    }
  } finally {
    clearInterval(heartbeat)
    try {
      reader.releaseLock()
    } catch {}
  }

  if (!res.writableEnded) {
    try {
      res.write('data: [DONE]\n\n')
      res.end()
    } catch {}
  }
}

/* ------------------------------------------------------------------ */
/*  Models list — cached                                              */
/* ------------------------------------------------------------------ */
const modelsCache = new Map()

const FALLBACK_MODELS = [
  { id: 'openrouter/free', name: 'Free Models Router', free: true, vision: false },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', free: false, vision: true },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', free: false, vision: true },
  { id: 'google/gemini-3.1-flash-image', name: 'Gemini 3.1 Flash Image', free: false, vision: true },
  { id: 'google/gemma-4-31b-it:free', name: 'Gemma 4 31B (free)', free: true, vision: true },
  { id: 'nex-agi/nex-n2.5-mini:free', name: 'Nex N2.5 Mini (free)', free: true, vision: true },
].sort((a, b) => a.id.localeCompare(b.id))

export async function handleModels(req, res) {
  const { apiKey, baseUrl } = requestProvider(req)
  const cacheKey = `${baseUrl}|${apiKey || 'server'}`
  const cached = modelsCache.get(cacheKey)
  const now = Date.now()
  if (cached && now - cached.at < config.modelsCacheTtlMs) {
    return sendJson(res, 200, { models: cached.data })
  }

  let models = null
  let upstream
  try {
    upstream = await fetchModels(null, { apiKey, baseUrl })
    if (upstream.ok) {
      const json = await upstream.json()
      const list = (json.data || [])
        .map((m) => {
          const p = m.pricing || {}
          const arch = m.architecture || {}
          const inText = !arch.input_modalities || arch.input_modalities.includes('text')
          const outText = !arch.output_modalities || arch.output_modalities.includes('text')
          const free = (Number(p.prompt) === 0 && Number(p.completion) === 0) || /:free$/.test(m.id || '')
          const vision = !!(m.capabilities && m.capabilities.vision) || /vision|multimodal|vl$/i.test(m.id || '')
          return { id: m.id, name: m.name || m.id, free, vision, chat: inText && outText }
        })
        .filter((m) => m.chat)
        .map(({ chat, ...m }) => m)
        .sort((a, b) => a.id.localeCompare(b.id))
      if (list.length) models = list
    }
  } catch {}

  if (!models) {
    models = FALLBACK_MODELS
  }

  modelsCache.set(cacheKey, { data: models, at: now })
  sendJson(res, 200, { models })
}

/* ------------------------------------------------------------------ */
/*  Chat store (cloud)                                                 */
/* ------------------------------------------------------------------ */
export async function handleSaveChats(req, res) {
  let payload
  try {
    payload = await readJsonBody(req)
  } catch {
    return sendError(res, 400, 'Body harus berupa JSON valid.')
  }
  if (!Array.isArray(payload.chats)) {
    return sendError(res, 400, 'Field "chats" wajib berupa array.')
  }
  saveChats(payload.chats)
  sendJson(res, 200, { ok: true, count: payload.chats.length })
}

export function handleChatsRoute(req, res) {
  if (req.method === 'GET') {
    if (!rateLimit(clientIp(req), config.generalRateWindowMs, config.generalRateMax)) {
      return sendError(res, 429, 'Terlalu banyak permintaan. Tunggu sebentar.')
    }
    return sendJson(res, 200, { chats: getChats() })
  }
  if (req.method === 'PUT') {
    if (!rateLimit(clientIp(req), config.chatRateWindowMs, config.chatRateMax)) {
      return sendError(res, 429, 'Terlalu banyak permintaan. Tunggu sebentar.')
    }
    return handleSaveChats(req, res)
  }
  sendError(res, 405, 'Method not allowed.')
}

/* ------------------------------------------------------------------ */
/*  Web search (DuckDuckGo HTML)                                       */
/* ------------------------------------------------------------------ */
export async function handleSearch(req, res) {
  const q = new URL(req.url, 'http://localhost').searchParams.get('q') || ''
  if (q.trim().length < 3) {
    return sendError(res, 400, 'Parameter "q" wajib diisi (min 3 karakter).')
  }
  try {
    const results = await webSearch(q)
    sendJson(res, 200, { results })
  } catch {
    sendError(res, 502, 'Gagal mencari di web. Coba lagi.')
  }
}

/* ------------------------------------------------------------------ */
/*  Image generation proxy                                             */
/* ------------------------------------------------------------------ */
export async function handleImageGen(req, res) {
  const { apiKey, baseUrl } = requestProvider(req)

  if (!apiKey) {
    return sendError(res, 500, 'API key belum dikonfigurasi di server.')
  }
  if (!rateLimit(clientIp(req), config.chatRateWindowMs, config.chatRateMax)) {
    return sendError(res, 429, 'Terlalu banyak permintaan. Tunggu beberapa saat lalu coba lagi.')
  }

  let payload
  try {
    payload = await readJsonBody(req)
  } catch {
    return sendError(res, 400, 'Body harus berupa JSON valid.')
  }
  const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : ''
  if (!prompt) return sendError(res, 400, 'Field "prompt" wajib diisi.')
  const model = typeof payload.model === 'string' && payload.model ? payload.model : config.defaultImageModel

  let upstream
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 60000)
  const onClose = () => ctrl.abort()
  req.on('close', onClose)
  try {
    upstream = await fetchImageGeneration({ model, prompt, n: 1 }, ctrl.signal, { apiKey, baseUrl })
  } catch {
    clearTimeout(timer)
    return sendError(res, 504, 'Provider pembuatan gambar terlalu lama. Coba lagi.')
  }
  clearTimeout(timer)

  if (!upstream.ok) {
    let detail = ''
    try {
      detail = await upstream.text()
    } catch {}
    let message = friendlyError(upstream.status)
    try {
      const d = JSON.parse(detail)
      if (d.error && d.error.message) message = d.error.message
    } catch {}
    return sendJson(res, upstream.status, { error: message, code: upstream.status, detail })
  }

  let json
  try {
    json = await upstream.json()
  } catch {
    return sendError(res, 502, 'Respons pembuatan gambar tidak valid.')
  }
  const item = (json.data || [])[0]
  if (!item) return sendError(res, 502, 'Provider tidak mengembalikan gambar.')
  if (item.url) return sendJson(res, 200, { url: item.url })
  if (item.b64_json) return sendJson(res, 200, { b64: item.b64_json })
  return sendError(res, 502, 'Format respons gambar tidak dikenal.')
}

/* ------------------------------------------------------------------ */
/*  Health & config                                                    */
/* ------------------------------------------------------------------ */
export function handleHealth(req, res) {
  if (!rateLimit(clientIp(req), config.generalRateWindowMs, config.generalRateMax)) {
    return sendError(res, 429, 'Terlalu banyak permintaan. Tunggu sebentar.')
  }
  return sendJson(res, 200, {
    ok: true,
    service: config.appTitle,
    time: Date.now(),
    ip: clientIp(req),
  })
}

export function handleConfig(req, res) {
  return sendJson(res, 200, {
    title: config.appTitle,
    defaultModel: config.defaultModel,
    keyConfigured: Boolean(config.apiKey),
  })
}

/* Provider connection test (lightweight — models list, reports upstream status). */
export async function handleTest(req, res) {
  const { apiKey, baseUrl } = requestProvider(req)
  if (!apiKey) {
    return sendJson(res, 200, { ok: false, status: 0, error: 'Tidak ada API key (set di backend atau Settings).', v: 1 })
  }
  let upstream
  try {
    upstream = await fetchModels(null, { apiKey, baseUrl })
  } catch {
    return sendJson(res, 200, { ok: false, status: 0, error: 'Gagal menghubungi provider (jaringan).' })
  }
  let count = 0
  let detail = ''
  if (upstream.ok) {
    try {
      const j = await upstream.json()
      count = Array.isArray(j.data) ? j.data.length : 0
    } catch {}
  } else {
    try {
      detail = String(await upstream.text()).slice(0, 200)
    } catch {}
  }
  return sendJson(res, 200, {
    ok: upstream.ok,
    status: upstream.status,
    count,
    error: upstream.ok ? undefined : `${friendlyError(upstream.status)}${detail ? ` — ${detail}` : ''}`,
  })
}