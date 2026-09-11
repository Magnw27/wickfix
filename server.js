import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { config } from './server/config.js'
import { rateLimit } from './server/ratelimit.js'
import {
  securityHeaders,
  sendJson,
  sendError,
  clientIp,
  handleChat,
  handleModels,
  handleChatsRoute,
  handleSearch,
  handleImageGen,
  handleHealth,
  handleConfig,
} from './server/handlers.js'

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

/* ------------------------------------------------------------------ */
/*  Static files                                                      */
/* ------------------------------------------------------------------ */
function serveStatic(req, res, pathname) {
  let fp = path.normalize(path.join(config.publicDir, pathname === '/' ? 'index.html' : pathname))
  if (fp !== config.publicDir && !fp.startsWith(config.publicDir + path.sep)) {
    return sendError(res, 403, 'Forbidden.')
  }

  fs.stat(fp, (err, stat) => {
    if (err || !stat.isFile()) {
      fs.readFile(path.join(config.publicDir, 'index.html'), (e2, html) => {
        if (e2) return sendError(res, 404, 'Not found.')
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
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    })
    fs.createReadStream(fp).pipe(res)
  })
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
        return sendError(res, 429, 'Terlalu banyak permintaan. Tunggu sebentar.')
      }
      return handleModels(req, res)
    }

    if (pathname === '/api/chats') {
      return handleChatsRoute(req, res)
    }

    if (req.method === 'GET' && pathname === '/api/search') {
      if (!rateLimit(clientIp(req), config.generalRateWindowMs, config.generalRateMax)) {
        return sendError(res, 429, 'Terlalu banyak permintaan. Tunggu sebentar.')
      }
      return handleSearch(req, res)
    }

    if (req.method === 'POST' && pathname === '/api/images') {
      return handleImageGen(req, res)
    }

    if (req.method === 'GET' && pathname === '/api/health') {
      return handleHealth(req, res)
    }

    if (req.method === 'GET' && pathname === '/api/config') {
      return handleConfig(req, res)
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      return serveStatic(req, res, pathname)
    }

    return sendError(res, 405, 'Method not allowed.')
  } catch (err) {
    console.error(err)
    if (!res.headersSent) return sendError(res, 500, 'Internal server error.')
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