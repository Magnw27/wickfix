import fs from 'node:fs'
import path from 'node:path'
import { ROOT } from './config.js'

const FILE = path.join(ROOT, 'data', 'chats.json')
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