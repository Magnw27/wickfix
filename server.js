import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { config, ROOT } from './server/config.js'
import { rateLimit } from './server/ratelimit.js'
import { fetchChatCompletion, fetchModels, fetchImageGeneration, friendlyError } from './server/openai.js'
import { getChats, saveChats } from './server/store.js'
import { webSearch } from './server/search.js'

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://unpkg.com https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com https://unpkg.com",
  'font-src https://fonts.gstatic.com https://unpkg.com',
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
].join('; ')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()')
  res.setHeader('Content-Security-Policy', CSP)
}

function clientIp(req) {
  const cf = req.headers['cf-connecting-ip']
  if (cf && typeof cf === 'string') return cf
  const fwd = req.headers['x-forwarded-for']
  if (fwd && typeof fwd === 'string') return fwd.split(',')[0].trim()
  return req.socket.remoteAddress || 'unknown'
}

function sendJson(req, res, status, data) {
  const body = JSON.stringify(data)
  securityHeaders(res)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(body)
}

function sendError(req, res, status, error) {
  sendJson(req, res, status, { error })
}

/* ------------------------------------------------------------------ */
/*  Chat streaming (SSE) — anti-buffer + heartbeat + abort handling    */
/* ------------------------------------------------------------------ */
async function handleChat(req, res) {
  const ip = clientIp(req)

  if (!config.apiKey) {
    return sendError(req, res, 500, 'OPENROUTER_API_KEY belum dikonfigurasi di server.')
  }
  if (!rateLimit(ip, config.chatRateWindowMs, config.chatRateMax)) {
    return sendError(req, res, 429, 'Terlalu banyak permintaan. Tunggu beberapa saat lalu coba lagi.')
  }

  let body = ''
  for await (const chunk of req) body += chunk

  let payload
  try {
    payload = JSON.parse(body)
  } catch {
    return sendError(req, res, 400, 'Body harus berupa JSON valid.')
  }

  const messages = Array.isArray(payload.messages) ? payload.messages : []
  if (messages.length === 0) {
    return sendError(req, res, 400, 'Field "messages" wajib diisi.')
  }

  const model = typeof payload.model === 'string' && payload.model ? payload.model : config.defaultModel

  const abort = new AbortController()
  const onClose = () => {
    if (!res.writableEnded) abort.abort()
  }
  req.on('close', onClose)

  let upstream
  try {
    upstream = await fetchChatCompletion({ model, messages, stream: true }, abort.signal)
  } catch (err) {
    if (err.name === 'AbortError') return
    return sendError(req, res, 502, 'Gagal terhubung ke OpenRouter. Periksa koneksi jaringan dan coba lagi.')
  }

  if (!upstream.ok) {
    let detail = ''
    try {
      detail = await upstream.text()
    } catch {}
    sendJson(req, res, upstream.status, {
      error: friendlyError(upstream.status),
      code: upstream.status,
      detail,
    })
    return
  }

  if (!upstream.body) {
    return sendError(req, res, 502, 'OpenRouter tidak mengembalikan stream.')
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
const modelsCache = { data: null, at: 0 }

const FALLBACK_MODELS = [
  { id: 'openrouter/free', name: 'Free Models Router', free: true, vision: false },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', free: false, vision: true },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', free: false, vision: true },
  { id: 'google/gemini-3.1-flash-image', name: 'Gemini 3.1 Flash Image', free: false, vision: true },
  { id: 'google/gemma-4-31b-it:free', name: 'Gemma 4 31B (free)', free: true, vision: true },
  { id: 'nex-agi/nex-n2.5-mini:free', name: 'Nex N2.5 Mini (free)', free: true, vision: true },
].sort((a, b) => a.id.localeCompare(b.id))

async function handleModels(req, res) {
  const now = Date.now()
  if (modelsCache.data && now - modelsCache.at < config.modelsCacheTtlMs) {
    return sendJson(req, res, 200, { models: modelsCache.data })
  }

  let models = null
  let upstream
  try {
    upstream = await fetchModels()
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

  modelsCache.data = models
  modelsCache.at = now
  sendJson(req, res, 200, { models })
}

/* ------------------------------------------------------------------ */
/*  Static files                                                      */
/* ------------------------------------------------------------------ */
function serveStatic(req, res, pathname) {
  let fp = path.normalize(path.join(config.publicDir, pathname === '/' ? 'index.html' : pathname))
  if (fp !== config.publicDir && !fp.startsWith(config.publicDir + path.sep)) {
    return sendError(req, res, 403, 'Forbidden.')
  }

  fs.stat(fp, (err, stat) => {
    if (err || !stat.isFile()) {
      fs.readFile(path.join(config.publicDir, 'index.html'), (e2, html) => {
        if (e2) return sendError(req, res, 404, 'Not found.')
        securityHeaders(res)
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
        })
        res.end(html)
      })
      return
    }
    securityHeaders(res)
    const isHtml = path.extname(fp) === '.html'
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    })
    fs.createReadStream(fp).pipe(res)
  })
}

/* ------------------------------------------------------------------ */
/*  Chat store (cloud)                                                 */
/* ------------------------------------------------------------------ */
async function handleSaveChats(req, res) {
  let body = ''
  for await (const chunk of req) body += chunk
  let payload
  try {
    payload = JSON.parse(body)
  } catch {
    return sendError(req, res, 400, 'Body harus berupa JSON valid.')
  }
  if (!Array.isArray(payload.chats)) {
    return sendError(req, res, 400, 'Field "chats" wajib berupa array.')
  }
  saveChats(payload.chats)
  sendJson(req, res, 200, { ok: true, count: payload.chats.length })
}

/* ------------------------------------------------------------------ */
/*  Web search (DuckDuckGo HTML)                                       */
/* ------------------------------------------------------------------ */
async function handleSearch(req, res) {
  const q = new URL(req.url, 'http://localhost').searchParams.get('q') || ''
  if (q.trim().length < 3) {
    return sendError(req, res, 400, 'Parameter "q" wajib diisi (min 3 karakter).')
  }
  try {
    const results = await webSearch(q)
    sendJson(req, res, 200, { results })
  } catch {
    sendError(req, res, 502, 'Gagal mencari di web. Coba lagi.')
  }
}

/* ------------------------------------------------------------------ */
/*  Image generation proxy                                             */
/* ------------------------------------------------------------------ */
async function handleImageGen(req, res) {
  if (!config.apiKey) {
    return sendError(req, res, 500, 'API key belum dikonfigurasi di server.')
  }
  if (!rateLimit(clientIp(req), config.chatRateWindowMs, config.chatRateMax)) {
    return sendError(req, res, 429, 'Terlalu banyak permintaan. Tunggu beberapa saat lalu coba lagi.')
  }

  let body = ''
  for await (const chunk of req) body += chunk
  let payload
  try {
    payload = JSON.parse(body)
  } catch {
    return sendError(req, res, 400, 'Body harus berupa JSON valid.')
  }
  const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : ''
  if (!prompt) return sendError(req, res, 400, 'Field "prompt" wajib diisi.')
  const model = typeof payload.model === 'string' && payload.model ? payload.model : config.defaultImageModel

  let upstream
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 60000)
  const onClose = () => ctrl.abort()
  req.on('close', onClose)
  try {
    upstream = await fetchImageGeneration({ model, prompt, n: 1 }, ctrl.signal)
  } catch {
    clearTimeout(timer)
    return sendError(req, res, 504, 'Provider pembuatan gambar terlalu lama. Coba lagi.')
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
    return sendJson(req, res, upstream.status, { error: message, code: upstream.status, detail })
  }

  let json
  try {
    json = await upstream.json()
  } catch {
    return sendError(req, res, 502, 'Respons pembuatan gambar tidak valid.')
  }
  const item = (json.data || [])[0]
  if (!item) return sendError(req, res, 502, 'Provider tidak mengembalikan gambar.')
  if (item.url) return sendJson(req, res, 200, { url: item.url })
  if (item.b64_json) return sendJson(req, res, 200, { b64: item.b64_json })
  return sendError(req, res, 502, 'Format respons gambar tidak dikenal.')
}

/* ------------------------------------------------------------------ */
/*  Server                                                            */
/* ------------------------------------------------------------------ */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const pathname = url.pathname

  try {
    if (req.method === 'OPTIONS') {
      securityHeaders(res)
      res.writeHead(204)
      res.end()
      return
    }

    if (req.method === 'POST' && pathname === '/api/chat') {
      return handleChat(req, res)
    }

    if (req.method === 'GET' && pathname === '/api/models') {
      if (!rateLimit(clientIp(req), config.generalRateWindowMs, config.generalRateMax)) {
        return sendError(req, res, 429, 'Terlalu banyak permintaan. Tunggu sebentar.')
      }
      return handleModels(req, res)
    }

    if (pathname === '/api/chats') {
      if (req.method === 'GET') {
        if (!rateLimit(clientIp(req), config.generalRateWindowMs, config.generalRateMax)) {
          return sendError(req, res, 429, 'Terlalu banyak permintaan. Tunggu sebentar.')
        }
        return sendJson(req, res, 200, { chats: getChats() })
      }
      if (req.method === 'PUT') {
        if (!rateLimit(clientIp(req), config.chatRateWindowMs, config.chatRateMax)) {
          return sendError(req, res, 429, 'Terlalu banyak permintaan. Tunggu sebentar.')
        }
        return handleSaveChats(req, res)
      }
    }

    if (req.method === 'GET' && pathname === '/api/search') {
      if (!rateLimit(clientIp(req), config.generalRateWindowMs, config.generalRateMax)) {
        return sendError(req, res, 429, 'Terlalu banyak permintaan. Tunggu sebentar.')
      }
      return handleSearch(req, res)
    }

    if (req.method === 'POST' && pathname === '/api/images') {
      return handleImageGen(req, res)
    }

    if (req.method === 'GET' && pathname === '/api/health') {
      if (!rateLimit(clientIp(req), config.generalRateWindowMs, config.generalRateMax)) {
        return sendError(req, res, 429, 'Terlalu banyak permintaan. Tunggu sebentar.')
      }
      return sendJson(req, res, 200, {
        ok: true,
        service: config.appTitle,
        time: Date.now(),
        ip: clientIp(req),
      })
    }

    if (req.method === 'GET' && pathname === '/api/config') {
      return sendJson(req, res, 200, {
        title: config.appTitle,
        defaultModel: config.defaultModel,
        keyConfigured: Boolean(config.apiKey),
      })
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      return serveStatic(req, res, pathname)
    }

    return sendError(req, res, 405, 'Method not allowed.')
  } catch (err) {
    console.error(err)
    if (!res.headersSent) return sendError(req, res, 500, 'Internal server error.')
    try {
      res.end()
    } catch {}
  }
})

server.requestTimeout = 0
server.keepAliveTimeout = 65000
server.headersTimeout = 65000

server.listen(config.port, () => {
  console.log(`✔ ${config.appTitle} berjalan di http://localhost:${config.port}`)
  console.log(`  OpenRouter base: ${config.openRouterBase}`)
  console.log(`  Default model: ${config.defaultModel}`)
  console.log(`  Heartbeat SSE: ${config.heartbeatMs}ms`)
  if (!config.apiKey) {
    console.warn('  ⚠ OPENROUTER_API_KEY belum diisi di file .env')
  }
})