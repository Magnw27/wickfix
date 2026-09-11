import { handleConfig } from '../server/handlers.js'

export default async function config(req, res) {
  await handleConfig(req, res)
}