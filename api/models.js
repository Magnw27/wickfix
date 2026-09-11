import { handleModels, sendError, clientIp } from '../server/handlers.js'
import { config } from '../server/config.js'
import { rateLimit } from '../server/ratelimit.js'

export default async function models(req, res) {
  if (req.method === 'GET') {
    if (!rateLimit(clientIp(req), config.generalRateWindowMs, config.generalRateMax)) {
      return sendError(res, 429, 'Terlalu banyak permintaan. Tunggu sebentar.')
    }
    return handleModels(req, res)
  }
  return sendError(res, 405, 'Method not allowed.')
}