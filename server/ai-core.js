import { validateChatMessages, validateModel } from './input.js'

export const MODEL_PROFILES = Object.freeze({
  fast: { label: 'Fast', preferred: ['google/gemini-2.5-flash', 'openai/gpt-4o-mini', 'openrouter/free'] },
  balanced: { label: 'Balanced', preferred: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'openrouter/free'] },
  reasoning: { label: 'Reasoning', preferred: ['openai/o3-mini', 'deepseek/deepseek-r1', 'openrouter/free'] },
  vision: { label: 'Vision', preferred: ['google/gemini-2.5-flash', 'openai/gpt-4o-mini', 'openrouter/free'] },
})

export function estimateTokens(messages) {
  const chars = messages.reduce((n, m) => n + (typeof m.content === 'string' ? m.content.length : 0), 0)
  return Math.ceil(chars / 4)
}

export function buildContext(messages, maxTokens = 24000) {
  const checked = validateChatMessages(messages)
  if (!checked.ok) return checked
  const result = []
  let tokens = 0
  for (let i = checked.messages.length - 1; i >= 0; i--) {
    const message = checked.messages[i]
    const cost = estimateTokens([message])
    if (result.length && tokens + cost > maxTokens) break
    result.unshift(message)
    tokens += cost
  }
  return { ok: true, messages: result, estimatedTokens: tokens, truncated: result.length < checked.messages.length }
}

export function chooseModel({ requested, task = 'balanced', available = [] } = {}) {
  const explicit = validateModel(requested, '')
  if (explicit && (!available.length || available.some((m) => m.id === explicit))) return explicit
  const profile = MODEL_PROFILES[task] || MODEL_PROFILES.balanced
  for (const candidate of profile.preferred) {
    if (!available.length || available.some((m) => m.id === candidate)) return candidate
  }
  return available[0]?.id || 'openrouter/free'
}

export function classifyTask(messages = []) {
  const text = messages.map((m) => typeof m.content === 'string' ? m.content : '').join(' ').toLowerCase()
  if (/image|gambar|foto|vision|lihat|screenshot/.test(text)) return 'vision'
  if (/debug|code|kode|program|matematika|buktikan|analisis/.test(text)) return 'reasoning'
  if (text.length < 300) return 'fast'
  return 'balanced'
}
