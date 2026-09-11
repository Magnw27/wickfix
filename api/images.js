import { handleImageGen } from '../server/handlers.js'

export default async function images(req, res) {
  await handleImageGen(req, res)
}