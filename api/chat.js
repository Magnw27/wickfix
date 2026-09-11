import { handleChat } from '../server/handlers.js'

export default async function chat(req, res) {
  await handleChat(req, res)
}