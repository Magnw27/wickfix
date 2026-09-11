import { config } from '../server/config.js'
import { sendJson, sendError, clientIp, requestProvider, readJsonBody } from '../server/handlers.js'
import { rateLimit } from '../server/ratelimit.js'
import { runOrchestration } from '../server/orchestrator.js'

export default async function ai(req, res) {
  if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed.')
  if (!rateLimit(clientIp(req), config.chatRateWindowMs, config.chatRateMax)) {
    return sendError(res, 429, 'Terlalu banyak permintaan. Tunggu beberapa saat lalu coba lagi.')
  }

  let payload
  try {
    payload = await readJsonBody(req)
  } catch {
    return sendError(res, 400, 'Body harus berupa JSON valid.')
  }

  const { apiKey, baseUrl } = requestProvider(req)
  if (!apiKey) return sendError(res, 500, 'API key belum dikonfigurasi di server.')

  const result = await runOrchestration({
    messages: payload.messages,
    model: payload.model,
    task: payload.task,
    apiKey,
    baseUrl,
  })

  if (!result.ok && !result.response) return sendError(res, result.status || 502, result.error)
  if (!result.response?.ok) {
    let detail = ''
    try { detail = await result.response.text() } catch {}
    return sendJson(res, result.status || 502, { error: 'Provider AI mengembalikan error.', code: result.status, detail })
  }

  let data
  try { data = await result.response.json() } catch { return sendError(res, 502, 'Respons provider tidak valid.') }
  return sendJson(res, 200, { model: result.model, data })
}
