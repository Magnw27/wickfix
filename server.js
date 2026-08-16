import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function loadEnv() {
  try {
    const content = fs.readFileSync(path.join(__dirname, '.env'), 'utf8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
      if (!(key in process.env)) process.env[key] = value
    }
  } catch {}
}

loadEnv()

const BASE_URL = (process.env['9ROUTER_BASE_URL'] || 'http://localhost:20128/v1').replace(/\/+$/, '')
const API_KEY = process.env['9ROUTER_API_KEY'] || ''
const MODEL = process.env['9ROUTER_MODEL'] || 'auto'
const PORT = Number(process.env.PORT || 3000)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(body)
}

async function forwardChat(req, res) {
  let body = ''
  for await (const chunk of req) body += chunk

  let payload
  try {
    payload = JSON.parse(body)
  } catch {
    return sendJson(res, 400, { error: 'Body harus berupa JSON valid' })
  }

  const messages = payload.messages
  if (!Array.isArray(messages) || messages.length === 0) {
    return sendJson(res, 400, { error: 'Field "messages" wajib diisi' })
  }

  const upstream = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, messages, stream: true }),
  })

  if (!upstream.ok) {
    let detail = ''
    try {
      detail = await upstream.text()
    } catch {}
    return sendJson(res, upstream.status, {
      error: `9Router gagal (${upstream.status})`,
      detail,
    })
  }

  if (!upstream.body) {
    return sendJson(res, 502, { error: '9Router tidak mengembalikan stream' })
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  })
  res.write(': connected\n\n')

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
            const json = JSON.parse(data)
            const delta = json.choices?.[0]?.delta?.content
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
            const json = JSON.parse(data)
            const delta = json.choices?.[0]?.delta?.content
            if (delta) res.write(`data: ${JSON.stringify({ content: delta })}\n\n`)
          } catch {}
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  res.write('data: [DONE]\n\n')
  res.end()
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)

  if (req.method === 'POST' && url.pathname === '/api/chat') {
    return forwardChat(req, res)
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return sendJson(res, 200, {
      ok: true,
      baseUrl: BASE_URL,
      model: MODEL,
      keyConfigured: API_KEY !== '' && !API_KEY.includes('PASANG_API_KEY'),
    })
  }

  let filePath = path.join(__dirname, 'public', url.pathname === '/' ? 'index.html' : url.pathname)
  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    return sendJson(res, 403, { error: 'Forbidden' })
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      fs.readFile(path.join(__dirname, 'public', 'index.html'), (e2, html) => {
        if (e2) return sendJson(res, 404, { error: 'Not found' })
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(html)
      })
      return
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' })
    fs.createReadStream(filePath).pipe(res)
  })
})

server.listen(PORT, () => {
  console.log(`Web Chat App berjalan di http://localhost:${PORT}`)
  console.log(`9Router base: ${BASE_URL} | model: ${MODEL}`)
  if (!API_KEY || API_KEY.includes('PASANG_API_KEY')) {
    console.warn('PERINGATAN: 9ROUTER_API_KEY belum diisi. Isi di file .env')
  }
})