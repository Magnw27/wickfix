import { handleHealth } from '../server/handlers.js'

export default async function health(req, res) {
  await handleHealth(req, res)
}