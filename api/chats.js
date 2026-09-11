import { handleChatsRoute } from '../server/handlers.js'

export default async function chats(req, res) {
  await handleChatsRoute(req, res)
}