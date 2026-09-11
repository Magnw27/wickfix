const MAX_MESSAGES = 80
const MAX_MESSAGE_CHARS = 12000
const MAX_TOTAL_CHARS = 120000

export function cleanText(value, max = MAX_MESSAGE_CHARS) {
  if (typeof value !== 'string') return ''
  return value.replace(/\u0000/g, '').trim().slice(0, max)
}

export function validateChatMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, error: 'messages wajib berupa array yang tidak kosong.' }
  }
  if (messages.length > MAX_MESSAGES) {
    return { ok: false, error: `Maksimal ${MAX_MESSAGES} pesan per permintaan.` }
  }

  let total = 0
  const normalized = []
  for (const message of messages) {
    if (!message || typeof message !== 'object') {
      return { ok: false, error: 'Format message tidak valid.' }
    }
    const role = cleanText(message.role, 32)
    if (!['system', 'user', 'assistant', 'tool'].includes(role)) {
      return { ok: false, error: 'Role message tidak valid.' }
    }
    const content = typeof message.content === 'string'
      ? cleanText(message.content)
      : message.content
    if (typeof content === 'string') total += content.length
    if (total > MAX_TOTAL_CHARS) {
      return { ok: false, error: `Total konteks melebihi ${MAX_TOTAL_CHARS} karakter.` }
    }
    normalized.push({ ...message, role, content })
  }
  return { ok: true, messages: normalized }
}

export function validateModel(model, fallback = 'openrouter/free') {
  const value = cleanText(model, 160)
  return value && /^[a-zA-Z0-9._:/-]+$/.test(value) ? value : fallback
}

export const limits = Object.freeze({ MAX_MESSAGES, MAX_MESSAGE_CHARS, MAX_TOTAL_CHARS })
