const chat = document.getElementById('chat')
const form = document.getElementById('chat-form')
const input = document.getElementById('input')
const sendBtn = document.getElementById('send-btn')
const modelBadge = document.getElementById('model-badge')

const messages = []

function scrollToBottom() {
  chat.scrollTop = chat.scrollHeight
}

function addBubble(role, text, { error = false } = {}) {
  const div = document.createElement('div')
  div.className = `message ${error ? 'error' : role}`
  div.textContent = text
  chat.appendChild(div)
  scrollToBottom()
  return div
}

function renderPlaceholder() {
  const p = document.createElement('div')
  p.className = 'placeholder'
  p.textContent = 'Mulai percakapan dengan AI melalui 9Router.'
  chat.appendChild(p)
}

function removePlaceholder() {
  const p = chat.querySelector('.placeholder')
  if (p) p.remove()
}

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  const text = input.value.trim()
  if (!text || sendBtn.disabled) return

  removePlaceholder()
  messages.push({ role: 'user', content: text })
  addBubble('user', text)
  input.value = ''
  input.style.height = 'auto'

  const aiBubble = addBubble('ai', '')
  let accumulated = ''
  let failed = false

  sendBtn.disabled = true
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    })

    if (!res.ok || !res.body) {
      let detail = `Error ${res.status}`
      try {
        const data = await res.json()
        detail = data.error || data.detail || detail
      } catch {}
      throw new Error(detail)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let idx
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        for (const line of raw.split('\n')) {
          if (!line.startsWith('data:')) continue
          const data = line.slice(5).trim()
          if (data === '[DONE]') continue
          try {
            const json = JSON.parse(data)
            if (json.content) {
              accumulated += json.content
              aiBubble.textContent = accumulated
              scrollToBottom()
            }
          } catch {}
        }
      }
    }
  } catch (err) {
    failed = true
    aiBubble.remove()
    addBubble('ai', `Terjadi kesalahan: ${err.message}`, { error: true })
  } finally {
    sendBtn.disabled = false
    input.focus()
  }

  if (!failed) {
    messages.push({ role: 'assistant', content: accumulated || '(kosong)' })
  }
})

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    form.dispatchEvent(new Event('submit'))
  }
})

input.addEventListener('input', () => {
  input.style.height = 'auto'
  input.style.height = Math.min(input.scrollHeight, 120) + 'px'
})

async function init() {
  renderPlaceholder()
  try {
    const res = await fetch('/api/health')
    const data = await res.json()
    modelBadge.textContent = `model: ${data.model}`
  } catch {}
}

init()