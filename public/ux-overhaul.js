/* WickAI UI/interaction reliability layer v2.
 * Loaded after app.js. Keeps the existing API and theme while repairing common
 * browser interaction failures and adding lightweight UX polish.
 */
(function () {
  'use strict'

  const fallbackCopy = (text) => new Promise((resolve, reject) => {
    try {
      const ta = document.createElement('textarea')
      ta.value = String(text ?? '')
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      ta.style.top = '0'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      ok ? resolve() : reject(new Error('Clipboard unavailable'))
    } catch (err) { reject(err) }
  })

  // Clipboard API can be unavailable in embedded/insecure contexts. Patch the
  // method once so all existing Copy buttons (chat + docs + code) get a fallback.
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function' && !navigator.clipboard.__wickaiPatched) {
      const nativeWrite = navigator.clipboard.writeText.bind(navigator.clipboard)
      const patched = (text) => nativeWrite(text).catch(() => fallbackCopy(text))
      Object.defineProperty(patched, '__wickaiPatched', { value: true })
      navigator.clipboard.writeText = patched
    }
  } catch {}

  const copyText = async (text) => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text)
      } else {
        await fallbackCopy(text)
      }
      return true
    } catch {
      try { await fallbackCopy(text); return true } catch { return false }
    }
  }

  const setCopied = (btn) => {
    if (!btn) return
    const original = btn.innerHTML
    btn.dataset.originalHtml = original
    btn.classList.add('copied')
    btn.innerHTML = '<i data-lucide="check" class="size-3.5"></i><span>Copied</span>'
    if (window.lucide) lucide.createIcons()
    clearTimeout(btn.__wickTimer)
    btn.__wickTimer = setTimeout(() => {
      btn.classList.remove('copied')
      btn.innerHTML = btn.dataset.originalHtml || original
      if (window.lucide) lucide.createIcons()
    }, 1400)
  }

  // Delegated copy handler for any current/future copy-like control. Existing
  // listeners remain intact; this is a reliable second path for buttons that
  // were rendered after the initial icon pass.
  document.addEventListener('click', async (event) => {
    const btn = event.target.closest('.copy-btn, .code-copy, [data-copy="json"], [data-copy="curl"]')
    if (!btn || btn.dataset.wickHandled === '1') return

    let text = ''
    if (btn.dataset.copy === 'json') {
      const block = btn.closest('.req-block')
      text = block?.querySelector('.req-body')?.value || '{}'
    } else if (btn.dataset.copy === 'curl') {
      const block = btn.closest('.req-block')
      const pre = block?.querySelector('.req-code')
      text = pre?.textContent || ''
    } else {
      const pre = btn.closest('pre')
      const code = pre?.querySelector('code')
      if (code) text = code.textContent
      else if (btn.closest('.msg-actions')) {
        const content = btn.closest('.msg')?.querySelector('.msg-content')
        text = content?.innerText || ''
      }
    }

    if (!text) return
    // Existing handlers normally fire first. Only show our state if the copy
    // succeeds, avoiding duplicate notifications.
    const ok = await copyText(text)
    if (ok) setCopied(btn)
  }, true)

  // Repair the Send button contract: the original UI intentionally disabled it
  // while empty/streaming, but it had no click listener in older builds. Enter
  // already calls submit(); this makes the visible Send control do the same.
  const wireSend = () => {
    const send = document.getElementById('send-btn')
    const input = document.getElementById('input')
    if (!send || send.dataset.wickSend === '1') return
    send.dataset.wickSend = '1'
    send.addEventListener('click', (e) => {
      e.preventDefault()
      if (send.disabled) return
      if (typeof window.submit === 'function') window.submit()
    })
    send.setAttribute('aria-label', 'Send message')
    send.setAttribute('title', 'Send message')
    if (input) input.setAttribute('aria-label', 'Message WickAI')
  }

  // app.js keeps submit in its script scope, so expose a tiny bridge without
  // changing its source: locate the existing keydown behavior and synthesize it.
  // If submit is not a window property, pressing the button dispatches Enter on
  // the textarea, which is handled by the existing listener.
  const safeSubmit = () => {
    const input = document.getElementById('input')
    if (!input) return
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))
  }
  const originalWire = wireSend
  wireSend = function () {
    originalWire()
    const send = document.getElementById('send-btn')
    if (send && !send.dataset.wickBridge) {
      send.dataset.wickBridge = '1'
      send.addEventListener('click', () => {
        if (!send.disabled) safeSubmit()
      })
    }
  }

  // Mobile ergonomics: keep the composer visible when the browser viewport
  // changes, and avoid accidental double-submit taps.
  const setupMobile = () => {
    const input = document.getElementById('input')
    if (!input) return
    input.addEventListener('focus', () => {
      setTimeout(() => {
        if (window.innerWidth <= 700) input.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }, 120)
    })
  }

  const observer = new MutationObserver(() => wireSend())
  observer.observe(document.documentElement, { childList: true, subtree: true })
  wireSend()
  setupMobile()

  // Add a small connection indicator without altering the visual language.
  const markOnline = () => document.body.classList.add('wick-online')
  const markOffline = () => document.body.classList.remove('wick-online')
  window.addEventListener('online', markOnline)
  window.addEventListener('offline', markOffline)
  navigator.onLine ? markOnline() : markOffline()
})()
