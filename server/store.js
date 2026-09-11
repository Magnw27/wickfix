import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { ROOT } from './config.js'

/* On serverless platforms (Vercel) the repo dir is read-only except /tmp. */
function resolveFile() {
  if (process.env.CHATS_PATH) return process.env.CHATS_PATH
  const root = path.join(ROOT, 'data', 'chats.json')
  if (process.env.VERCEL) return path.join(os.tmpdir(), 'wickfix-chats.json')
  return root
}

const FILE = resolveFile()
let cache = null

export function getChats() {
  if (cache) return cache
  try {
    const raw = fs.readFileSync(FILE, 'utf8')
    const d = JSON.parse(raw)
    cache = Array.isArray(d.chats) ? d.chats : []
  } catch {
    cache = []
  }
  return cache
}

export function saveChats(chats) {
  cache = Array.isArray(chats) ? chats : []
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true })
    fs.writeFileSync(FILE, JSON.stringify({ chats: cache, savedAt: Date.now() }))
  } catch (e) {
    console.error('Gagal menyimpan chats:', e.message)
  }
  return cache
}