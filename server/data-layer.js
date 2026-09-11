import { getChats, saveChats } from './store.js'

const VERSION = 1

export function readChatData() {
  const chats = getChats()
  return { version: VERSION, chats, count: chats.length }
}

export function writeChatData(chats) {
  if (!Array.isArray(chats)) throw new TypeError('chats harus berupa array')
  const normalized = chats.slice(-5000)
  saveChats(normalized)
  return { version: VERSION, chats: normalized, count: normalized.length }
}

export function createStorageInfo() {
  return Object.freeze({
    version: VERSION,
    adapter: process.env.VERCEL ? 'ephemeral-file' : 'local-file',
    durable: false,
    note: 'Ganti adapter ini dengan database durable sebelum multi-instance production.',
  })
}
