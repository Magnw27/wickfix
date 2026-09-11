/* ================= Elements ================= */
const chatEl = document.getElementById('chat')
const scrollEl = document.getElementById('chat-scroll')
const input = document.getElementById('input')
const sendBtn = document.getElementById('send-btn')
const stopBtn = document.getElementById('stop-btn')
const attachBtn = document.getElementById('attach-btn')
const fileInput = document.getElementById('file-input')
const attachmentsEl = document.getElementById('attachments')
const composer = document.getElementById('composer')
const micBtn = document.getElementById('mic-btn')
const searchBtn = document.getElementById('search-btn')
const imageBtn = document.getElementById('image-btn')
const previewModal = document.getElementById('preview-modal')
const previewFrame = document.getElementById('preview-frame')
const modelSelect = document.getElementById('model-select')
const chatList = document.getElementById('chat-list')
const newChatBtn = document.getElementById('new-chat-btn')
const sidebar = document.getElementById('sidebar')
const sidebarToggles = [document.getElementById('sidebar-toggle'), document.getElementById('sidebar-toggle-header')]
const sidebarOverlay = document.getElementById('sidebar-overlay')
const systemPromptBtn = document.getElementById('system-prompt-btn')
const systemPromptDot = document.getElementById('system-prompt-dot')
const exportBtn = document.getElementById('export-btn')
const menuBtn = document.getElementById('menu-btn')
const dropdown = document.getElementById('dropdown')
const modal = document.getElementById('modal')
const modalCard = document.getElementById('modal-card')
const toasts = document.getElementById('toasts')
const scrollBottomBtn = document.getElementById('scroll-bottom-btn')
const appName = document.getElementById('app-name')
const pageTitle = document.getElementById('page-title')

/* ================= Constants & State ================= */
const LS_KEY = 'openrouter-chats:v3'
const RECOMMENDED_PREFIXES = ['openai/', 'anthropic/', 'google/gemini-', 'meta-llama/', 'mistralai/', 'deepseek/']
const SUGGESTIONS = [
  { title: 'Explain quantum computing', desc: 'in simple terms' },
  { title: 'Write a haiku', desc: 'about the ocean' },
  { title: 'Plan my work day', desc: 'with useful productivity tips' },
  { title: 'Summarize any article', desc: 'paste a link or text below' },
]

let allModels = []
let chats = loadChats()
let currentChatId = null
let abortCtrl = null
let streaming = false
let stickToBottom = true
let lastModel = 'openrouter/free'
let attachments = []
let searchMode = false
let imageMode = false
let micRecognition = null
let micActive = false
let cloudReady = false
let cloudTimer = null

/* ================= Routing & Auth (presentation layer) ================= */
const ACCOUNTS_KEY = 'nexus-ai-accounts'
const SESSION_KEY = 'nexus-ai-session'
let currentPage = null
let cfgTitle = ''

function getAccounts() {
  try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY)) || [] } catch { return [] }
}
function saveAccounts(list) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list))
}
function authUser() {
  try {
    const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}
function loginSession(email, name, remember) {
  const data = JSON.stringify({ email, name, at: Date.now() })
  if (remember) { localStorage.setItem(SESSION_KEY, data); sessionStorage.removeItem(SESSION_KEY) }
  else { sessionStorage.setItem(SESSION_KEY, data); localStorage.removeItem(SESSION_KEY) }
}
function clearSession() {
  localStorage.removeItem(SESSION_KEY)
  sessionStorage.removeItem(SESSION_KEY)
}
function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) }
function initials(name) {
  const t = String(name || '').trim()
  return (t.split(/\s+/).map((w) => w[0]).slice(0, 2).join('') || 'AI').toUpperCase()
}

function navigate() {
  let path = location.pathname
  if (!['/', '/docs', '/chat', '/catalog'].includes(path)) path = '/'
  const map = { '/': 'landing-page', '/docs': 'docs-page', '/chat': 'chat-page', '/catalog': 'catalog-page' }
  const id = map[path]
  document.body.classList.toggle('chat-mode', id === 'chat-page')
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'))
  const el = document.getElementById(id)
  if (el) el.classList.add('active')
  currentPage = id
  document.title =
    id === 'chat-page' ? (cfgTitle || 'WickAI') :
    id === 'docs-page' ? 'Docs — WickAI' :
    id === 'catalog-page' ? 'Models — WickAI' :
    'WickAI — AI Chat'
  document.querySelectorAll('.nav-link[data-page]').forEach((a) => {
    a.classList.toggle('active', a.dataset.page === id)
  })
  if (id === 'chat-page') fillUserInfo()
  window.scrollTo(0, 0)
}

function setupRouter() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-nav]')
    if (!a) return
    e.preventDefault()
    const href = a.getAttribute('href')
    if (href && href.startsWith('/')) {
      history.pushState(null, '', href)
      navigate()
    }
  })
  window.addEventListener('popstate', navigate)
}

function setupNav() {
  const nav = document.getElementById('top-nav')
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 10)
  window.addEventListener('scroll', onScroll, { passive: true })
  onScroll()
  const mobileBtn = document.getElementById('mobile-menu-btn')
  const mobileMenu = document.getElementById('mobile-menu')
  if (mobileBtn && mobileMenu) {
    mobileBtn.addEventListener('click', () => mobileMenu.classList.toggle('hidden'))
  }
  document.querySelectorAll('[data-nav]').forEach((a) => {
    a.addEventListener('click', () => {
      if (mobileMenu) mobileMenu.classList.add('hidden')
    })
  })
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target) }
      }
    }, { threshold: 0.12 })
    document.querySelectorAll('.reveal').forEach((el) => io.observe(el))
  } else {
    document.querySelectorAll('.reveal').forEach((el) => el.classList.add('in'))
  }
}

function setFieldError(input, msg) {
  input.classList.add('has-error')
  const err = input.closest('.field').querySelector('.field-error')
  if (err) err.textContent = msg
}
function showAuthMsg(msg, type) {
  const el = document.getElementById('auth-msg')
  el.textContent = msg
  el.className = 'auth-msg ' + type
  const card = document.querySelector('.auth-card')
  if (card) {
    card.classList.remove('shake')
    void card.offsetWidth
    if (type === 'error') card.classList.add('shake')
  }
}
function hideAuthMsg() {
  const el = document.getElementById('auth-msg')
  el.className = 'auth-msg hidden'
}
function setLoading(btn, loading) {
  const label = btn.querySelector('.btn-label')
  const spin = btn.querySelector('.spinner')
  btn.disabled = loading
  if (label) label.classList.toggle('hidden', loading)
  if (spin) spin.classList.toggle('hidden', !loading)
}

function setupAuth() {
  const tabLogin = document.getElementById('auth-tab-login')
  const tabRegister = document.getElementById('auth-tab-register')
  const loginForm = document.getElementById('login-form')
  const registerForm = document.getElementById('register-form')
  const authMsg = document.getElementById('auth-msg')

  const switchTab = (which) => {
    const toLogin = which === 'login'
    tabLogin.classList.toggle('active', toLogin)
    tabRegister.classList.toggle('active', !toLogin)
    loginForm.classList.toggle('hidden', !toLogin)
    registerForm.classList.toggle('hidden', toLogin)
    authMsg.className = 'auth-msg hidden'
  }
  tabLogin.addEventListener('click', () => switchTab('login'))
  tabRegister.addEventListener('click', () => switchTab('register'))

  document.querySelectorAll('.pass-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const inp = document.getElementById(btn.dataset.target)
      if (!inp) return
      const isPass = inp.type === 'password'
      inp.type = isPass ? 'text' : 'password'
      const i = btn.querySelector('i')
      if (i) { i.setAttribute('data-lucide', isPass ? 'eye-off' : 'eye'); lucide.createIcons() }
    })
  })

  document.querySelectorAll('.input').forEach((inp) => {
    inp.addEventListener('input', () => {
      inp.classList.remove('has-error')
      const err = inp.closest('.field').querySelector('.field-error')
      if (err) err.textContent = ''
      hideAuthMsg()
    })
  })

  document.getElementById('forgot-link').addEventListener('click', () => {
    showToast('Fitur lupa password segera hadir. Untuk demo, daftar dengan akun baru.', 'info')
  })

  document.querySelectorAll('[data-social]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const provider = btn.dataset.social === 'google' ? 'Google' : 'GitHub'
      loginSession(`user.${provider.toLowerCase()}@demo.app`, `Pengguna ${provider}`, true)
      showToast(`Login berhasil via ${provider}.`, 'success')
      history.pushState(null, '', '/chat')
      navigate()
    })
  })

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault()
    hideAuthMsg()
    const emailInp = document.getElementById('login-email')
    const passInp = document.getElementById('login-password')
    const remember = document.getElementById('login-remember').checked
    const btn = loginForm.querySelector('[data-submit]')
    const email = emailInp.value.trim()
    const pass = passInp.value
    let ok = true
    if (!email) { setFieldError(emailInp, 'Email wajib diisi.'); ok = false }
    else if (!isEmail(email)) { setFieldError(emailInp, 'Format email tidak valid.'); ok = false }
    if (!pass) { setFieldError(passInp, 'Password wajib diisi.'); ok = false }
    if (!ok) return

    const acc = getAccounts().find((a) => a.email === email.toLowerCase())
    if (!acc) { showAuthMsg('Akun tidak ditemukan. Silakan daftar terlebih dahulu.', 'error'); return }
    if (acc.pass !== btoa(pass)) { setFieldError(passInp, 'Password salah.'); return }

    setLoading(btn, true)
    setTimeout(() => {
      setLoading(btn, false)
      loginSession(acc.email, acc.name, remember)
      showToast(`Selamat datang kembali, ${acc.name}!`, 'success')
      history.pushState(null, '', '/chat')
      navigate()
    }, 700)
  })

  registerForm.addEventListener('submit', (e) => {
    e.preventDefault()
    hideAuthMsg()
    const nameInp = document.getElementById('register-name')
    const emailInp = document.getElementById('register-email')
    const passInp = document.getElementById('register-password')
    const confirmInp = document.getElementById('register-confirm')
    const btn = registerForm.querySelector('[data-submit]')
    const name = nameInp.value.trim()
    const email = emailInp.value.trim()
    const pass = passInp.value
    const confirm = confirmInp.value
    let ok = true
    if (!name) { setFieldError(nameInp, 'Nama wajib diisi.'); ok = false }
    if (!email) { setFieldError(emailInp, 'Email wajib diisi.'); ok = false }
    else if (!isEmail(email)) { setFieldError(emailInp, 'Format email tidak valid.'); ok = false }
    if (!pass) { setFieldError(passInp, 'Password wajib diisi.'); ok = false }
    else if (pass.length < 6) { setFieldError(passInp, 'Minimal 6 karakter.'); ok = false }
    if (!confirm) { setFieldError(confirmInp, 'Konfirmasi wajib diisi.'); ok = false }
    else if (confirm !== pass) { setFieldError(confirmInp, 'Password tidak cocok.'); ok = false }
    if (!ok) return

    const accounts = getAccounts()
    if (accounts.some((a) => a.email === email.toLowerCase())) {
      showAuthMsg('Email sudah terdaftar. Silakan login.', 'error')
      return
    }

    setLoading(btn, true)
    setTimeout(() => {
      setLoading(btn, false)
      accounts.push({ name, email: email.toLowerCase(), pass: btoa(pass), at: Date.now() })
      saveAccounts(accounts)
      loginSession(email, name, true)
      showToast(`Akun berhasil dibuat. Selamat datang, ${name}!`, 'success')
      history.pushState(null, '', '/chat')
      navigate()
    }, 700)
  })
}

function setupChatExtras() {
  const logoutBtn = document.getElementById('logout-btn')
  if (logoutBtn) logoutBtn.addEventListener('click', () => {
    clearSession()
    showToast('Signed out.', 'success')
    history.pushState(null, '', '/')
    navigate()
  })
}
function fillUserInfo() {
  const u = authUser()
  const nameEl = document.getElementById('sidebar-user-name')
  const emailEl = document.getElementById('sidebar-user-email')
  const av = document.getElementById('user-avatar')
  if (!u) return
  nameEl.textContent = u.name
  emailEl.textContent = u.email
  av.textContent = initials(u.name)
}
function renderSidebarSkeleton() {
  const list = document.getElementById('chat-list')
  if (!list) return
  list.innerHTML = ''
  for (let i = 0; i < 4; i++) {
    const s = document.createElement('div')
    s.className = 'skeleton mb-1.5 h-9 w-full rounded-lg'
    list.appendChild(s)
  }
}
const MAX_FILE_SIZE = 6 * 1024 * 1024
const MAX_TOTAL_SIZE = 10 * 1024 * 1024
const IMAGE_MODEL = 'google/gemini-2.5-flash-image'
const FREE_VISION_MODEL = 'google/gemma-4-31b-it:free'
function isVisionCapable(id) {
  if (!id) return false
  const known = allModels.find((m) => m.id === id)
  if (known) return !!known.vision
  return /vision|gemini|4o|omni|multimodal/i.test(String(id).toLowerCase())
}
function ensureModelOption(id) {
  if (!modelSelect.querySelector(`option[value="${CSS.escape(id)}"]`)) {
    const o = document.createElement('option')
    o.value = id
    o.textContent = id
    modelSelect.appendChild(o)
  }
  modelSelect.value = id
  lastModel = id
}

/* ================= Utils ================= */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
function loadChats() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || [] } catch { return [] }
}
function saveChats() {
  localStorage.setItem(LS_KEY, JSON.stringify(chats))
  scheduleCloudSave()
}
function scheduleCloudSave() {
  if (!cloudReady) return
  clearTimeout(cloudTimer)
  cloudTimer = setTimeout(pushChats, 800)
}
async function pushChats() {
  try {
    await fetch('/api/chats', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chats }),
    })
  } catch {}
}
async function syncFromServer() {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 5000)
  try {
    const res = await fetch('/api/chats', { signal: ctrl.signal })
    if (!res.ok) return
    const { chats: remote } = await res.json()
    if (Array.isArray(remote) && remote.length > 0) chats = remote
    else if (chats.length > 0) await pushChats()
    cloudReady = true
  } catch {
  } finally {
    clearTimeout(timer)
  }
}
function getCurrentChat() {
  return chats.find((c) => c.id === currentChatId) || null
}
function ensureChat() {
  let chat = getCurrentChat()
  if (!chat) {
    chat = { id: uid(), title: '', systemPrompt: '', messages: [], createdAt: Date.now() }
    chats.unshift(chat)
    currentChatId = chat.id
  }
  return chat
}
function titleFrom(text) {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > 40 ? t.slice(0, 40) + '…' : t
}
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function renderMarkdown(src) {
  if (window.marked) return window.marked.parse(src || '', { gfm: true, breaks: true })
  return escapeHtml(src || '')
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
function svgToDataUrl(svg) {
  try {
    const m = String(svg).match(/<svg[\s\S]*?<\/svg>/i)
    if (!m) return ''
    const b64 = btoa(unescape(encodeURIComponent(m[0])))
    return `data:image/svg+xml;base64,${b64}`
  } catch {
    return ''
  }
}
function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}

function decorateCode(container) {
  container.querySelectorAll('pre code').forEach((block) => {
    try { if (window.hljs) hljs.highlightElement(block) } catch {}
  })
  container.querySelectorAll('pre').forEach((pre) => {
    const codeEl = pre.querySelector('code')
    const lang = (codeEl && codeEl.className.match(/language-([\w-]+)/)) ? codeEl.className.match(/language-([\w-]+)/)[1] : ''
    const code = codeEl ? codeEl.textContent : ''

    const isSvg = lang === 'svg' || /^\s*<svg[\s\S]*<\/svg>/i.test(code)
    if (isSvg) {
      const imgSrc = svgToDataUrl(code)
      if (imgSrc) {
        const box = document.createElement('div')
        box.className = 'svg-preview'
        const img = document.createElement('img')
        img.src = imgSrc
        img.alt = 'Gambar SVG'
        img.className = 'max-h-80 w-auto max-w-full rounded-xl border border-border bg-white'
        box.appendChild(img)
        const row = document.createElement('div')
        row.className = 'mt-1.5 flex items-center gap-1'
        const vbtn = document.createElement('button')
        vbtn.className = 'code-copy'
        vbtn.innerHTML = '<i data-lucide="code-2" class="size-3.5"></i><span>Lihat kode</span>'
        vbtn.addEventListener('click', () => openPreview(code, 'svg'))
        row.appendChild(vbtn)
        box.appendChild(row)
        pre.replaceWith(box)
        return
      }
    }

    if (pre.querySelector('.code-copy')) return
    const bar = document.createElement('div')
    bar.className = 'code-bar flex items-center gap-1'
    const btn = document.createElement('button')
    btn.className = 'code-copy'
    btn.innerHTML = '<i data-lucide="copy" class="size-3.5"></i><span>Copy</span>'
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(code).then(() => {
        btn.classList.add('copied')
        btn.innerHTML = '<i data-lucide="check" class="size-3.5"></i><span>Copied!</span>'
        lucide.createIcons()
        setTimeout(() => {
          btn.classList.remove('copied')
          btn.innerHTML = '<i data-lucide="copy" class="size-3.5"></i><span>Copy</span>'
          lucide.createIcons()
        }, 2000)
      })
    })
    bar.appendChild(btn)

    const previewable = /html|js|javascript|css|svg/.test(lang) || /<svg|<html|<!doctype/i.test(code)
    if (previewable) {
      const pbtn = document.createElement('button')
      pbtn.className = 'code-copy'
      pbtn.innerHTML = '<i data-lucide="play" class="size-3.5"></i><span>Preview</span>'
      pbtn.addEventListener('click', () => openPreview(code, lang))
      bar.appendChild(pbtn)
    }
    pre.appendChild(bar)
  })
}

/* ================= Scroll ================= */
function nearBottom() {
  return scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 120
}
function scrollToBottom(force = false) {
  if (force || stickToBottom) scrollEl.scrollTop = scrollEl.scrollHeight
}
scrollEl.addEventListener('scroll', () => {
  stickToBottom = nearBottom()
  scrollBottomBtn.classList.toggle('hidden', stickToBottom)
})
scrollBottomBtn.addEventListener('click', () => {
  stickToBottom = true
  scrollToBottom(true)
  scrollBottomBtn.classList.add('hidden')
})

/* ================= Toast ================= */
function showToast(message, type = 'info') {
  const el = document.createElement('div')
  el.className = `toast ${type}`
  const icon = document.createElement('i')
  icon.setAttribute('data-lucide', type === 'error' ? 'circle-alert' : type === 'success' ? 'badge-check' : 'info')
  el.appendChild(icon)
  const span = document.createElement('span')
  span.textContent = message
  el.appendChild(span)
  toasts.appendChild(el)
  lucide.createIcons()
  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s'
    el.style.opacity = '0'
    el.style.transform = 'translateY(8px)'
    setTimeout(() => el.remove(), 300)
  }, 4000)
}

/* ================= Modal ================= */
function openModal(html) {
  modalCard.innerHTML = html
  modal.classList.remove('hidden')
  modalCard.style.animation = 'none'
  void modalCard.offsetWidth
  modalCard.style.animation = ''
  modalCard.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', closeModal))
  lucide.createIcons()
}
function closeModal() {
  modal.classList.add('hidden')
}
modal.addEventListener('click', (e) => {
  if (e.target.hasAttribute('data-close')) closeModal()
})

/* ================= Sidebar ================= */
function renderSidebar() {
  chatList.innerHTML = ''
  if (chats.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'px-3 py-6 text-center text-xs text-text-3'
    empty.textContent = 'Belum ada riwayat'
    chatList.appendChild(empty)
    return
  }
  for (const c of chats) {
    const item = document.createElement('div')
    item.className = `group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer transition ${
      c.id === currentChatId ? 'bg-surface-2 text-text ring-1 ring-border' : 'text-text-2 hover:bg-surface hover:text-text'
    }`
    const label = document.createElement('span')
    label.className = 'flex-1 truncate'
    label.textContent = c.title || 'Percakapan baru'
    const del = document.createElement('button')
    del.className = 'hidden group-hover:flex size-6 items-center justify-center rounded-md text-text-3 hover:text-rose-400 hover:bg-surface-2 transition'
    del.innerHTML = '<i data-lucide="trash-2" class="size-3.5"></i>'
    del.title = 'Hapus'
    del.addEventListener('click', (e) => {
      e.stopPropagation()
      deleteChat(c.id)
    })
    item.appendChild(label)
    item.appendChild(del)
    item.addEventListener('click', () => switchChat(c.id))
    chatList.appendChild(item)
  }
  lucide.createIcons()
}

function toggleSidebar(open) {
  sidebar.classList.toggle('open', open)
  sidebarOverlay.classList.toggle('hidden', !open)
}
sidebarToggles.forEach((btn) => btn.addEventListener('click', () => toggleSidebar(true)))
sidebarOverlay.addEventListener('click', () => toggleSidebar(false))

function newChat() {
  if (streaming) stopGenerating()
  currentChatId = null
  input.value = ''
  autoResize()
  renderChat()
  renderSidebar()
  toggleSidebar(false)
  updateControls()
  input.focus()
}

function switchChat(id) {
  if (streaming && id !== currentChatId) stopGenerating()
  currentChatId = id
  renderChat()
  renderSidebar()
  toggleSidebar(false)
  updateControls()
}

function deleteChat(id) {
  if (streaming && id === currentChatId) stopGenerating()
  chats = chats.filter((c) => c.id !== id)
  if (currentChatId === id) currentChatId = null
  saveChats()
  renderChat()
  renderSidebar()
  updateControls()
}

function clearHistory() {
  if (streaming) stopGenerating()
  if (!confirm('Hapus semua riwayat percakapan?')) return
  chats = []
  currentChatId = null
  saveChats()
  renderChat()
  renderSidebar()
  showToast('Riwayat dihapus', 'success')
}

/* ================= Chat rendering ================= */
function renderChat() {
  chatEl.innerHTML = ''
  const chat = getCurrentChat()
  if (!chat) {
    chatEl.appendChild(buildEmptyState())
    return
  }
  chat.messages.forEach((m, i) => chatEl.appendChild(buildMessage(m, i)))
  decorateCode(chatEl)
  lucide.createIcons()
  scrollToBottom(true)
}

function buildEmptyState() {
  const box = document.createElement('div')
  box.className = 'flex flex-col items-center px-4 py-12'
  box.innerHTML = `
    <img src="/logo.png" alt="WickAI" class="logo-empty" />
    <h1 class="greet-title mt-5 text-center text-2xl md:text-3xl font-semibold tracking-tight">How can I help you today?</h1>
    <p class="greet-sub mt-2 text-center text-sm">Pick a suggestion below, or just type your message.</p>
    <div class="grid w-full max-w-lg grid-cols-1 sm:grid-cols-2 gap-3 mt-8"></div>
  `
  const grid = box.querySelector('.grid')
  SUGGESTIONS.forEach((s, i) => {
    const b = document.createElement('button')
    b.className = 'sugg-item flex flex-col gap-1 rounded-lg border p-3 text-left'
    b.style.animationDelay = `${0.45 + i * 0.05}s`
    b.innerHTML = `
      <span class="text-[13px] font-medium text-text">${escapeHtml(s.title)}</span>
      <span class="text-xs text-text-3">${escapeHtml(s.desc)}</span>
    `
    b.addEventListener('click', () => {
      input.value = s.title + ' ' + s.desc
      autoResize()
      updateControls()
      submit()
    })
    grid.appendChild(b)
  })
  return box
}

function ghostActionBtn(icon, title, fn) {
  const b = document.createElement('button')
  b.className = 'grid size-6 place-items-center rounded-md text-text-3 hover:text-text hover:bg-surface-2 transition'
  b.innerHTML = `<i data-lucide="${icon}" class="size-3.5"></i>`
  b.title = title
  b.addEventListener('click', fn)
  return b
}

function copyToClipboard(text, btn, iconEl) {
  navigator.clipboard.writeText(text).then(() => {
    if (iconEl) {
      const i = btn.querySelector('i')
      if (i) {
        i.setAttribute('data-lucide', 'check')
        lucide.createIcons()
        btn.classList.add('text-emerald-400')
        setTimeout(() => {
          i.setAttribute('data-lucide', 'copy')
          btn.classList.remove('text-emerald-400')
          lucide.createIcons()
        }, 1500)
      }
    }
  }).catch(() => showToast('Gagal menyalin ke clipboard', 'error'))
}

function appendAttachmentPreviews(wrap, atts) {
  const row = document.createElement('div')
  row.className = 'flex flex-wrap justify-end gap-1.5'
  for (const a of atts) {
    if (a.isImage) {
      const img = document.createElement('img')
      img.src = a.dataUrl
      img.alt = a.name
      img.className = 'h-16 max-w-[160px] rounded-lg border border-border object-cover'
      row.appendChild(img)
    } else {
      const chip = document.createElement('div')
      chip.className = 'flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2 py-1 text-[11px] text-text-2'
      chip.innerHTML = '<i data-lucide="file" class="size-3"></i>'
      const span = document.createElement('span')
      span.className = 'max-w-[120px] truncate'
      span.textContent = a.name
      chip.appendChild(span)
      row.appendChild(chip)
    }
  }
  wrap.insertBefore(row, wrap.querySelector('.msg-actions'))
  lucide.createIcons()
}

function buildMessage(m, index) {
  const isUser = m.role === 'user'

  if (isUser) {
    const wrap = document.createElement('div')
    wrap.className = 'group/message msg user flex flex-col items-end gap-1.5'
    const bubble = document.createElement('div')
    bubble.className = 'user-bubble'
    bubble.textContent = m.content
    if (m.content) wrap.appendChild(bubble)

    const actions = document.createElement('div')
    actions.className = 'msg-actions flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover/message:opacity-100 transition-opacity'
    actions.appendChild(ghostActionBtn('pencil', 'Edit', () => editMessage(index)))
    const copyBtn = ghostActionBtn('copy', 'Copy', (e) => copyToClipboard(m.content, e.currentTarget))
    actions.appendChild(copyBtn)
    wrap.appendChild(actions)
    return wrap
  }

  const wrap = document.createElement('div')
  wrap.className = 'group/message msg flex items-start gap-3'

  const avatar = document.createElement('div')
  avatar.className = 'msg-avatar'
  avatar.innerHTML = '<i data-lucide="sparkles" class="size-3.5"></i>'
  wrap.appendChild(avatar)

  const body = document.createElement('div')
  body.className = 'flex min-w-0 flex-1 flex-col gap-1.5'

  const content = document.createElement('div')
  content.className = 'msg-content markdown'
  content.innerHTML = renderMarkdown(m.content)
  body.appendChild(content)

  if (m.image) {
    const img = document.createElement('img')
    img.src = m.image
    img.alt = 'Gambar hasil generate'
    img.loading = 'lazy'
    img.className = 'mt-1 max-h-80 w-fit max-w-full rounded-xl border border-border shadow-lg'
    body.appendChild(img)
  }

  const actions = document.createElement('div')
  actions.className = 'msg-actions flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover/message:opacity-100 transition-opacity'
  actions.appendChild(ghostActionBtn('volume-2', 'Baca jawaban', (e) => toggleSpeak(m.content, e.currentTarget)))
  actions.appendChild(ghostActionBtn('refresh-ccw', 'Regenerate', () => regenerate(index)))
  actions.appendChild(ghostActionBtn('copy', 'Copy', (e) => copyToClipboard(m.content, e.currentTarget)))
  body.appendChild(actions)

  wrap.appendChild(body)
  return wrap
}

function buildAssistantPlaceholder() {
  const wrap = document.createElement('div')
  wrap.className = 'msg flex items-start gap-3 streaming'

  const avatar = document.createElement('div')
  avatar.className = 'msg-avatar'
  avatar.innerHTML = '<i data-lucide="sparkles" class="size-3.5"></i>'
  wrap.appendChild(avatar)

  const body = document.createElement('div')
  body.className = 'flex min-w-0 flex-1 flex-col gap-1.5'
  const content = document.createElement('div')
  content.className = 'msg-content markdown'
  content.innerHTML = '<span class="loading-wave" data-wave style="display:inline-flex"><span></span><span></span><span></span><span></span><span></span></span>'
  body.appendChild(content)
  wrap.appendChild(body)
  return wrap
}

/* ================= Message actions ================= */
function editMessage(index) {
  if (streaming) return
  const chat = getCurrentChat()
  if (!chat || !chat.messages[index]) return
  const msg = chat.messages[index]
  chat.messages = chat.messages.slice(0, index)
  saveChats()
  renderChat()
  input.value = msg.content
  autoResize()
  updateControls()
  showToast('Ubah pesan, lalu kirim ulang', 'info')
  input.focus()
}

function regenerate(index) {
  if (streaming) return
  const chat = getCurrentChat()
  if (!chat || !chat.messages[index]) return
  chat.messages = chat.messages.slice(0, index)
  saveChats()
  renderChat()
  ask(chat)
}

/* ================= Attachments ================= */
function addFile(file) {
  if (file.size > MAX_FILE_SIZE) return showToast('File terlalu besar (maks 6MB)', 'error')
  const total = attachments.reduce((s, a) => s + a.size, 0) + file.size
  if (total > MAX_TOTAL_SIZE) return showToast('Total lampiran maksimal 10MB', 'error')
  const reader = new FileReader()
  reader.onload = () => {
    const dataUrl = reader.result
    const base64 = String(dataUrl).split(',')[1] || ''
    attachments.push({
      id: uid(),
      name: file.name,
      mime: file.type || 'application/octet-stream',
      base64,
      size: file.size,
      isImage: (file.type || '').startsWith('image/'),
      dataUrl,
    })
    renderAttachments()
    updateControls()
    if (file.type && file.type.startsWith('image/') && !isVisionCapable(modelSelect.value)) {
      ensureModelOption(FREE_VISION_MODEL)
      showToast('Gambar terdeteksi — model dialihkan ke model vision gratis', 'info')
    }
  }
  reader.onerror = () => showToast('Gagal membaca file', 'error')
  reader.readAsDataURL(file)
}

function removeAttachment(id) {
  attachments = attachments.filter((a) => a.id !== id)
  renderAttachments()
  updateControls()
}

function renderAttachments() {
  attachmentsEl.innerHTML = ''
  attachmentsEl.classList.toggle('hidden', attachments.length === 0)
  attachmentsEl.classList.toggle('flex', attachments.length > 0)
  for (const a of attachments) {
    const chip = document.createElement('div')
    chip.className =
      'group/att flex items-center gap-2 rounded-lg border border-border bg-surface-2 p-1.5 pr-2'
    if (a.isImage) {
      const img = document.createElement('img')
      img.src = a.dataUrl
      img.alt = a.name
      img.className = 'h-10 w-10 rounded object-cover'
      chip.appendChild(img)
    } else {
      const icon = document.createElement('div')
      icon.className = 'grid size-10 shrink-0 place-items-center rounded bg-surface-2 text-text-2 ring-1 ring-border'
      icon.innerHTML = '<i data-lucide="file" class="size-4"></i>'
      chip.appendChild(icon)
    }
    const meta = document.createElement('div')
    meta.className = 'min-w-0'
    const name = document.createElement('p')
    name.className = 'max-w-[140px] truncate text-xs font-medium'
    name.textContent = a.name
    const size = document.createElement('p')
    size.className = 'text-[10px] text-text-3'
    size.textContent = fmtSize(a.size)
    meta.appendChild(name)
    meta.appendChild(size)
    chip.appendChild(meta)
    const rm = document.createElement('button')
    rm.className =
      'grid size-6 shrink-0 place-items-center rounded text-text-3 transition hover:bg-surface hover:text-rose-400'
    rm.innerHTML = '<i data-lucide="x" class="size-3.5"></i>'
    rm.title = 'Hapus'
    rm.addEventListener('click', () => removeAttachment(a.id))
    chip.appendChild(rm)
    attachmentsEl.appendChild(chip)
  }
  lucide.createIcons()
}

attachBtn.addEventListener('click', () => fileInput.click())
fileInput.addEventListener('change', () => {
  for (const f of fileInput.files) addFile(f)
  fileInput.value = ''
})
input.addEventListener('paste', (e) => {
  const items = e.clipboardData && e.clipboardData.items
  if (!items) return
  const imgs = []
  for (const item of items) if (item.type.startsWith('image/')) imgs.push(item.getAsFile())
  if (!imgs.length) return
  e.preventDefault()
  for (const f of imgs) if (f) addFile(f)
})
composer.addEventListener('dragover', (e) => {
  e.preventDefault()
  composer.classList.add('border-brand-500')
})
composer.addEventListener('dragleave', () => composer.classList.remove('border-brand-500'))
composer.addEventListener('drop', (e) => {
  e.preventDefault()
  composer.classList.remove('border-brand-500')
  for (const f of e.dataTransfer.files) addFile(f)
})

/* ================= Speech input (STT) ================= */
function toggleMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SR) return showToast('Browser tidak mendukung input suara. Gunakan Chrome/Edge.', 'error')

  if (micActive) {
    micRecognition.stop()
    return
  }
  if (!micRecognition) {
    micRecognition = new SR()
    micRecognition.lang = 'id-ID'
    micRecognition.continuous = true
    micRecognition.interimResults = true
    micRecognition.onresult = (e) => {
      let t = ''
      for (let i = e.resultIndex; i < e.results.length; i++) t += e.results[i][0].transcript
      input.value = t.trim()
      autoResize()
      updateControls()
    }
    micRecognition.onend = () => {
      if (micActive) {
        try { micRecognition.start() } catch {}
      }
    }
    micRecognition.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        micActive = false
        renderModeButtons()
        showToast('Izin mikrofon ditolak.', 'error')
      }
    }
  }
  try {
    micRecognition.start()
    micActive = true
  } catch {
    micActive = false
  }
  renderModeButtons()
}
micBtn.addEventListener('click', toggleMic)

/* ================= Read aloud (TTS) ================= */
let speakingMsgEl = null
function toggleSpeak(content, btn) {
  if (!('speechSynthesis' in window)) return showToast('Browser tidak mendukung pembacaan suara.', 'error')
  if (speechSynthesis.speaking && speakingMsgEl === btn) {
    speechSynthesis.cancel()
    speakingMsgEl = null
    btn.classList.remove('text-brand-400')
    const i = btn.querySelector('i')
    if (i) { i.setAttribute('data-lucide', 'volume-2'); lucide.createIcons() }
    return
  }
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(content)
  u.lang = 'id-ID'
  u.onend = () => {
    speakingMsgEl = null
    btn.classList.remove('text-brand-400')
    const i = btn.querySelector('i')
    if (i) { i.setAttribute('data-lucide', 'volume-2'); lucide.createIcons() }
  }
  speechSynthesis.speak(u)
  speakingMsgEl = btn
  btn.classList.add('text-brand-400')
  const i = btn.querySelector('i')
  if (i) { i.setAttribute('data-lucide', 'square'); lucide.createIcons() }
}

/* ================= Web search mode ================= */
function renderModeButtons() {
  searchBtn.classList.toggle('mode-on', searchMode)
  imageBtn.classList.toggle('mode-on', imageMode)
  const m = micBtn.querySelector('i')
  if (m) {
    m.setAttribute('data-lucide', micActive ? 'mic-off' : 'mic')
    micBtn.classList.toggle('text-red-400', micActive)
  }
  lucide.createIcons()
}
searchBtn.addEventListener('click', () => {
  searchMode = !searchMode
  renderModeButtons()
  showToast(searchMode ? 'Mode Search web: ON' : 'Mode Search web: OFF', 'info')
})
imageBtn.addEventListener('click', () => {
  imageMode = !imageMode
  renderModeButtons()
  showToast(imageMode ? 'Mode Generate Gambar: ON' : 'Mode Generate Gambar: OFF', 'info')
})

async function fetchWebContext(query) {
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
    if (!res.ok) return ''
    const { results } = await res.json()
    if (!results || !results.length) return ''
    const lines = results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}\n   Sumber: ${r.url}`)
    return 'Konteks hasil pencarian web terbaru (gunakan untuk menjawab, sebutkan sumber bila relevan):\n' + lines.join('\n')
  } catch {
    return ''
  }
}

/* ================= Live code preview ================= */
function openPreview(code, lang) {
  let doc = ''
  const l = (lang || '').toLowerCase()
  if (l === 'svg' || /^\s*<svg/i.test(code)) {
    doc = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;display:grid;place-items:center;background:#fff}</style></head><body>${code}</body></html>`
  } else if (l === 'html' || /<!doctype|<html|<body|<head/i.test(code)) {
    doc = code
  } else if (l === 'js' || l === 'javascript') {
    doc = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;padding:16px;max-width:680px;margin:0 auto;color:#111}</style></head><body><div id="app"></div><script>${code}<\/script></body></html>`
  } else if (l === 'css') {
    doc = `<!doctype html><html><head><meta charset="utf-8"><style>${code}</style></head><body><div style="padding:24px;font-family:system-ui">Pratinjau CSS. Lihat file HTML di sisi kanan untuk konteks.</div></body></html>`
  } else {
    doc = code
  }
  previewFrame.srcdoc = doc
  previewModal.classList.remove('hidden')
  const card = previewModal.querySelector('.relative')
  card.style.animation = 'none'
  void card.offsetWidth
  card.style.animation = ''
}
previewModal.querySelectorAll('[data-preview-close]').forEach((el) => {
  el.addEventListener('click', () => {
    previewModal.classList.add('hidden')
    previewFrame.srcdoc = ''
  })
})

/* ================= Composer ================= */
function autoResize() {
  input.style.height = 'auto'
  input.style.height = Math.min(input.scrollHeight, 208) + 'px'
}
input.addEventListener('input', () => {
  autoResize()
  updateControls()
})

function updateControls() {
  const empty = input.value.trim() === '' && attachments.length === 0
  sendBtn.disabled = streaming || empty
  sendBtn.classList.toggle('hidden', streaming || empty)
  stopBtn.classList.toggle('hidden', !streaming)
}

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    submit()
  }
})

async function submit() {
  const text = input.value.trim()
  if ((!text && attachments.length === 0) || streaming) return
  const chat = ensureChat()

  if (imageMode) {
    if (!text) return
    if (!chat.title) chat.title = titleFrom(text)
    chat.messages.push({ role: 'user', content: text })
    saveChats()
    renderChat()
    renderSidebar()
    input.value = ''
    autoResize()
    updateControls()
    toggleSidebar(false)
    generateImage(chat, text)
    return
  }

  if (!chat.title) chat.title = titleFrom(text || attachments[0].name)
  chat.messages.push({ role: 'user', content: text })
  saveChats()
  renderChat()
  renderSidebar()
  if (attachments.length) {
    const userEl = chatEl.querySelector('.msg.user')
    if (userEl) appendAttachmentPreviews(userEl, attachments)
  }
  const requestMessages = buildRequestMessages(chat, text, attachments)
  if (searchMode && text) {
    showToast('Mencari di web…', 'info')
    const webContext = await fetchWebContext(text)
    if (webContext) requestMessages.unshift({ role: 'system', content: webContext })
  }
  input.value = ''
  attachments = []
  renderAttachments()
  autoResize()
  updateControls()
  toggleSidebar(false)
  ask(chat, requestMessages)
}

async function generateImage(chat, prompt) {
  const wrap = buildAssistantPlaceholder()
  const contentDiv = wrap.querySelector('.msg-content')
  contentDiv.innerHTML = '<span class="text-sm text-text-3">Menyiapkan generator…</span>'
  chatEl.appendChild(wrap)
  scrollToBottom()

  streaming = true
  updateControls()

  try {
    const imgSrc = await tryNativeImage(prompt, 10000)
    if (imgSrc) {
      chat.messages.push({ role: 'assistant', content: `Gambar untuk: "${prompt}"`, image: imgSrc })
      saveChats()
      renderChat()
      renderSidebar()
      return
    }

    contentDiv.innerHTML = '<span class="text-sm text-text-3">Menggambar…</span>'
    const svg = await askSvg(prompt, contentDiv)
    if (svg) {
      const dataUrl = svgToDataUrl(svg)
      if (dataUrl) {
        chat.messages.push({ role: 'assistant', content: `Gambar untuk: "${prompt}"`, image: dataUrl })
        saveChats()
        renderChat()
        renderSidebar()
        return
      }
    }
    wrap.remove()
    chat.messages.pop()
    saveChats()
    renderChat()
    renderSidebar()
    showToast('Gagal menghasilkan gambar. Coba lagi.', 'error')
  } finally {
    streaming = false
    abortCtrl = null
    updateControls()
  }
}

async function tryNativeImage(prompt, ms) {
  const ctrl = new AbortController()
  abortCtrl = ctrl
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch('/api/images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: IMAGE_MODEL, prompt }),
      signal: ctrl.signal,
    })
    let data = {}
    try { data = await res.json() } catch {}
    if (!res.ok) return null
    if (data.url) return data.url
    if (data.b64) return `data:image/png;base64,${data.b64}`
    return null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function askSvg(prompt, contentDiv) {
  const ctrl = new AbortController()
  abortCtrl = ctrl
  const messages = [
    {
      role: 'system',
      content:
        'Kamu adalah generator gambar SVG. Gambarkan subjek yang diminta sebagai ilustrasi SVG yang bagus. Output HANYA tag <svg>...</svg> yang lengkap dan valid (mulai <svg dan tutup </svg>), tanpa penjelasan atau teks di luar SVG.',
    },
    { role: 'user', content: prompt },
  ]
  let accumulated = ''
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, model: modelSelect.value, max_tokens: 3000 }),
      signal: ctrl.signal,
    })
    if (!res.ok) return ''
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        for (const line of block.split('\n')) {
          if (!line.startsWith('data:')) continue
          const d = line.slice(5).trim()
          if (d === '[DONE]') continue
          try {
            const j = JSON.parse(d)
            if (j.error) return ''
            if (j.content) {
              accumulated += j.content
              if (contentDiv) {
                contentDiv.textContent = accumulated.length > 120 ? accumulated.slice(0, 120) + '…' : accumulated
                scrollToBottom()
              }
            }
          } catch {}
        }
      }
    }
  } catch {
    return ''
  }
  const m = accumulated.match(/<svg[\s\S]*?<\/svg>/i)
  return m ? m[0] : ''
}

function stopGenerating() {
  if (abortCtrl) abortCtrl.abort()
}
stopBtn.addEventListener('click', stopGenerating)

function buildContentParts(text, atts) {
  const parts = []
  if (text) parts.push({ type: 'text', text })
  for (const a of atts || []) {
    if (a.isImage) {
      parts.push({ type: 'image_url', image_url: { url: `data:${a.mime};base64,${a.base64}` } })
    } else {
      parts.push({ type: 'file', file: { data: a.base64, media_type: a.mime, filename: a.name } })
    }
  }
  return parts
}

function buildRequestMessages(chat, currentText, atts) {
  const out = []
  if (chat.systemPrompt && chat.systemPrompt.trim()) out.push({ role: 'system', content: chat.systemPrompt.trim() })
  const last = chat.messages.length - 1
  chat.messages.forEach((m, i) => {
    if (i === last && (atts || []).length) {
      out.push({ role: m.role, content: buildContentParts(currentText || m.content, atts) })
    } else {
      out.push({ role: m.role, content: m.content })
    }
  })
  return out
}

async function fetchWithRetry(url, options, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(url, options)
    } catch (err) {
      if (err.name === 'AbortError') throw err
      if (i === attempts - 1) throw err
      showToast(`Koneksi terputus. Mencoba lagi (${i + 1}/${attempts - 1})…`, 'info')
      await sleep(1000 * Math.pow(2, i))
    }
  }
}

async function ask(chat, requestMessages) {
  const wrap = buildAssistantPlaceholder()
  chatEl.appendChild(wrap)
  scrollToBottom()

  streaming = true
  updateControls()
  abortCtrl = new AbortController()

  const contentDiv = wrap.querySelector('.msg-content')
  let accumulated = ''
  let failed = false
  let errorMsg = ''

  try {
    const res = await fetchWithRetry('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: requestMessages || buildRequestMessages(chat), model: modelSelect.value, max_tokens: 4096 }),
      signal: abortCtrl.signal,
    })

    if (!res.ok) {
      let msg = `Error ${res.status}`
      try {
        const d = await res.json()
        msg = d.error || d.detail || msg
      } catch {}
      failed = true
      errorMsg = msg
    } else if (res.body) {
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
              const j = JSON.parse(data)
              if (j.error) {
                failed = true
                errorMsg = j.message || 'Terjadi kesalahan.'
                reader.cancel().catch(() => {})
                break
              }
              if (j.content) {
                accumulated += j.content
                const typingEl = wrap.querySelector('[data-wave]')
                if (typingEl) typingEl.remove()
                contentDiv.innerHTML = renderMarkdown(accumulated)
                scrollToBottom()
              }
            } catch {}
          }
          if (failed) break
        }
        if (failed) break
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      // dihentikan pengguna — simpan bagian yang sudah ada
    } else {
      failed = true
      errorMsg = 'Koneksi terputus. Periksa jaringan lalu coba lagi.'
    }
  } finally {
    streaming = false
    abortCtrl = null
    updateControls()

    if (!failed) {
      if (accumulated) chat.messages.push({ role: 'assistant', content: accumulated })
      else chat.messages.push({ role: 'assistant', content: '(tanpa respons)' })
      saveChats()
      renderChat()
    } else {
      wrap.remove()
      renderChat()
      const errPanel = document.createElement('div')
      errPanel.className = 'msg flex items-start gap-3'
      errPanel.innerHTML = `
        <div class="msg-avatar"><i data-lucide="circle-alert" class="size-3.5"></i></div>
        <div class="min-w-0 flex-1">
          <div class="resp-panel">
            <div class="resp-head">
              <span class="resp-label">Something went wrong</span>
              <span class="status-badge err">failed</span>
            </div>
            <pre class="resp-pre err">${escapeHtml(errorMsg || 'Request failed.')}</pre>
          </div>
        </div>`
      chatEl.appendChild(errPanel)
      lucide.createIcons()
      scrollToBottom(true)
      if (errorMsg) showToast(errorMsg, 'error')
    }
    renderSidebar()
    scrollToBottom()
    input.focus()
  }
}

/* ================= Model selector ================= */
async function loadModels() {
  try {
    const res = await fetch('/api/models')
    if (!res.ok) throw new Error(String(res.status))
    const data = await res.json()
    allModels = data.models || []
  } catch (e) {
    console.error('Gagal memuat model', e)
  }
  renderModelOptions()
  renderCatalog()
}

function renderModelOptions() {
  const prev = modelSelect.value && modelSelect.value !== '__custom__' ? modelSelect.value : lastModel
  const free = allModels.filter((m) => m.free)
  const recommended = allModels
    .filter((m) => RECOMMENDED_PREFIXES.some((p) => m.id.startsWith(p)))
    .slice(0, 10)

  modelSelect.innerHTML = ''

  const addOption = (value, label) => {
    const o = document.createElement('option')
    o.value = value
    o.textContent = label
    modelSelect.appendChild(o)
  }
  const addGroup = (label, list) => {
    if (!list.length) return
    const g = document.createElement('optgroup')
    g.label = label
    for (const m of list) {
      const o = document.createElement('option')
      o.value = m.id
      o.textContent = m.name
      g.appendChild(o)
    }
    modelSelect.appendChild(g)
  }

  addGroup('Recommended', recommended)
  addGroup(`Free (${free.length})`, free)
  addGroup(`All models (${allModels.length})`, allModels)
  addOption('__custom__', 'Custom model…')

  const fallback = recommended[0] ? recommended[0].id : 'openrouter/free'
  const target = prev && modelSelect.querySelector(`option[value="${CSS.escape(prev)}"]`) ? prev : fallback
  modelSelect.value = target
  lastModel = modelSelect.value
}

modelSelect.addEventListener('change', () => {
  if (modelSelect.value === '__custom__') {
    modelSelect.value = lastModel
    openCustomModel()
    return
  }
  lastModel = modelSelect.value
})

function addCustomModelOption(id) {
  if (!modelSelect.querySelector(`option[value="${CSS.escape(id)}"]`)) {
    const o = document.createElement('option')
    o.value = id
    o.textContent = id
    modelSelect.appendChild(o)
  }
  modelSelect.value = id
  lastModel = id
}

function openCustomModel() {
  openModal(`
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-base font-semibold flex items-center gap-2"><i data-lucide="puzzle" class="size-5 text-brand-400"></i>Custom Model</h3>
      <button data-close class="p-1.5 rounded-lg text-text-3 hover:text-text hover:bg-surface-2"><i data-lucide="x" class="size-4"></i></button>
    </div>
    <div class="modal-field mb-4">
      <label for="custom-model-id">OpenRouter Model ID</label>
      <input id="custom-model-id" type="text" placeholder="mis. anthropic/claude-3.5-sonnet" autocomplete="off"
        class="w-full bg-base-soft border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 placeholder:text-text-3" />
    </div>
    <div class="flex justify-end gap-2">
      <button data-close class="px-4 py-2 rounded-lg text-sm text-text-2 hover:bg-surface-2">Batal</button>
      <button id="custom-apply" class="px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-brand-500 to-indigo-500 text-white hover:brightness-110">Pakai model</button>
    </div>
  `)
  const applyBtn = document.getElementById('custom-apply')
  const field = document.getElementById('custom-model-id')
  applyBtn.addEventListener('click', () => {
    const id = field.value.trim()
    if (!id) return showToast('Model ID tidak boleh kosong', 'error')
    addCustomModelOption(id)
    closeModal()
    showToast(`Model disetel: ${id}`, 'success')
  })
  field.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') applyBtn.click()
  })
  field.focus()
}

/* ================= System prompt ================= */
function openSystemPrompt() {
  const chat = ensureChat()
  openModal(`
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-base font-semibold flex items-center gap-2"><i data-lucide="bot" class="size-5 text-brand-400"></i>System Prompt</h3>
      <button data-close class="p-1.5 rounded-lg text-text-3 hover:text-text hover:bg-surface-2"><i data-lucide="x" class="size-4"></i></button>
    </div>
    <div class="modal-field mb-4">
      <label for="sys-prompt">Instruksi sistem untuk model (opsional)</label>
      <textarea id="sys-prompt" rows="5" placeholder="Contoh: Kamu adalah asisten yang ramah dan menjawab dalam Bahasa Indonesia."
        class="w-full bg-base-soft border border-border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 resize-none placeholder:text-text-3">${escapeHtml(chat.systemPrompt || '')}</textarea>
    </div>
    <div class="flex justify-end gap-2">
      <button data-close class="px-4 py-2 rounded-lg text-sm text-text-2 hover:bg-surface-2">Batal</button>
      <button id="sys-save" class="px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-brand-500 to-indigo-500 text-white hover:brightness-110">Simpan</button>
    </div>
  `)
  const saveBtn = document.getElementById('sys-save')
  const field = document.getElementById('sys-prompt')
  saveBtn.addEventListener('click', () => {
    chat.systemPrompt = field.value.trim()
    saveChats()
    renderSidebar()
    systemPromptDot.classList.toggle('hidden', !chat.systemPrompt)
    closeModal()
    showToast('System prompt disimpan', 'success')
  })
  field.focus()
}
systemPromptBtn.addEventListener('click', openSystemPrompt)

/* ================= Export ================= */
function toMarkdown(chat) {
  const lines = [`# ${chat.title || 'Percakapan'}`, '']
  for (const m of chat.messages) {
    lines.push(`## ${m.role === 'user' ? 'Anda' : 'AI'}`, '', m.content, '')
  }
  return lines.join('\n')
}
function toPlain(chat) {
  const lines = [`Percakapan: ${chat.title || 'Tanpa judul'}`, '']
  for (const m of chat.messages) {
    lines.push(`[${m.role === 'user' ? 'Anda' : 'AI'}]`, m.content, '')
  }
  return lines.join('\n')
}
function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function exportChat(format) {
  const chat = getCurrentChat()
  if (!chat || chat.messages.length === 0) {
    return showToast('Tidak ada percakapan untuk diekspor', 'error')
  }
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  if (format === 'json') {
    download(`chat-${stamp}.json`, JSON.stringify(chat, null, 2), 'application/json')
  } else if (format === 'md') {
    download(`chat-${stamp}.md`, toMarkdown(chat), 'text/markdown')
  } else {
    download(`chat-${stamp}.txt`, toPlain(chat), 'text/plain')
  }
  showToast('Chat berhasil diekspor', 'success')
}
exportBtn.addEventListener('click', () => exportChat('md'))

/* ================= Dropdown menu ================= */
function showDropdown() {
  const r = menuBtn.getBoundingClientRect()
  dropdown.style.top = r.bottom + 8 + 'px'
  dropdown.style.right = Math.max(8, window.innerWidth - r.right) + 'px'
  dropdown.classList.remove('hidden')
}
function hideDropdown() {
  dropdown.classList.add('hidden')
}
menuBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  if (dropdown.classList.contains('hidden')) showDropdown()
  else hideDropdown()
})
dropdown.addEventListener('click', (e) => {
  const item = e.target.closest('[data-action]')
  if (!item) return
  hideDropdown()
  const a = item.dataset.action
  if (a === 'new') newChat()
  else if (a === 'export-md') exportChat('md')
  else if (a === 'export-json') exportChat('json')
  else if (a === 'export-txt') exportChat('txt')
  else if (a === 'clear') clearHistory()
})
document.addEventListener('click', () => hideDropdown())

/* ================= Landing effects ================= */
function setupEffects() {
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches
  const noMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const landing = document.getElementById('landing-page')
  if (!landing) return

  const bar = document.getElementById('scroll-progress')
  const onScroll = () => {
    if (!bar) return
    const h = document.documentElement.scrollHeight - window.innerHeight
    bar.style.width = (h > 0 ? (window.scrollY / h) * 100 : 0) + '%'
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  onScroll()

  const animateCount = (el) => {
    const txt = el.textContent
    const val = parseInt(txt, 10)
    if (isNaN(val)) return
    const suffix = txt.replace(/[\d]/g, '')
    if (noMotion) { el.textContent = val + suffix; return }
    const dur = 900
    const t0 = performance.now()
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur)
      el.textContent = Math.round(val * (1 - Math.pow(1 - p, 3))) + suffix
      if (p < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }
  const stats = landing.querySelectorAll('.hero-stat strong')
  if (stats.length && 'IntersectionObserver' in window) {
    const statObs = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return
        statObs.unobserve(en.target)
        animateCount(en.target)
      })
    }, { threshold: 0.5 })
    stats.forEach((s) => statObs.observe(s))
  }

  if (fine && !noMotion) {
    const mock = landing.querySelector('.mock-chat')
    const card = landing.querySelector('.cta-panel')
    if (mock) {
      landing.addEventListener('mousemove', (e) => {
        const x = (e.clientX / window.innerWidth - 0.5)
        const y = (e.clientY / window.innerHeight - 0.5)
        if (mock) mock.style.transform = `perspective(1000px) rotateX(${(-y * 4).toFixed(2)}deg) rotateY(${(x * 6).toFixed(2)}deg)`
        if (card) card.style.transform = `perspective(1000px) rotateX(${(y * 2).toFixed(2)}deg) rotateY(${(-x * 3).toFixed(2)}deg)`
      })
      landing.addEventListener('mouseleave', () => {
        if (mock) mock.style.transform = ''
        if (card) card.style.transform = ''
      })
    }
  }

  /* Magnetic hero CTAs */
  if (fine && !noMotion) {
    document.querySelectorAll('.hero-cta').forEach((btn) => {
    const move = (e) => {
      const r = btn.getBoundingClientRect()
      btn.style.translate = `${((e.clientX - r.left - r.width / 2) * 0.18).toFixed(1)}px ${((e.clientY - r.top - r.height / 2) * 0.18).toFixed(1)}px`
    }
    const leave = () => { btn.style.translate = '' }
    const d = (f) => window.matchMedia('(hover: hover) and (pointer: fine)').matches
    btn.addEventListener('mousemove', d() ? move : () => {})
    btn.addEventListener('mouseleave', d() ? leave : () => {})
  })
  }
}

/* ================= Catalog (search & filter) ================= */
let catalogQuery = ''
let catalogFilter = 'all'
let catalogOpenId = null

function setupCatalog() {
  const searchInput = document.getElementById('catalog-search')
  if (!searchInput) return
  searchInput.addEventListener('input', () => {
    catalogQuery = searchInput.value.trim().toLowerCase()
    renderCatalog()
  })
  document.addEventListener('keydown', (e) => {
    const onCatalog = document.getElementById('catalog-page').classList.contains('active')
    if (!onCatalog) return
    if (e.key === '/' && document.activeElement !== searchInput) {
      e.preventDefault()
      searchInput.focus()
    }
    if (e.key === 'Escape' && document.activeElement === searchInput) {
      searchInput.value = ''
      catalogQuery = ''
      searchInput.blur()
      renderCatalog()
    }
  })
  document.getElementById('catalog-filters').addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-tab')
    if (!btn) return
    catalogFilter = btn.dataset.filter
    document.querySelectorAll('#catalog-filters .filter-tab').forEach((b) => b.classList.toggle('active', b === btn))
    renderCatalog()
  })
}

function renderCatalog() {
  const grid = document.getElementById('catalog-grid')
  const count = document.getElementById('catalog-count')
  if (!grid) return
  const free = catalogFilter === 'free'
  const vision = catalogFilter === 'vision'
  let models = allModels
  if (catalogQuery) models = models.filter((m) => (m.id + ' ' + (m.name || '')).toLowerCase().includes(catalogQuery))
  if (free) models = models.filter((m) => m.free)
  if (vision) models = models.filter((m) => m.vision)

  grid.innerHTML = ''
  if (models.length === 0) {
    grid.innerHTML = `<div class="col-span-full rounded-xl border border-border bg-soft p-12 text-center">
      <p class="text-sm text-text-3">No models match <span class="text-text-2">'${escapeHtml(catalogQuery || catalogFilter)}'</span></p>
    </div>`
  }

  models.slice(0, 60).forEach((m, i) => {
    const card = document.createElement('a')
    card.className = 'model-card'
    card.style.animationDelay = `${Math.min(i * 0.028, 0.5)}s`
    card.href = '/chat'
    card.dataset.nav = ''
    card.innerHTML = `
      <div class="flex items-center justify-between gap-2">
        <span class="mid">${escapeHtml(m.id)}</span>
        ${m.free ? '<span class="model-tag free">free</span>' : ''}
        ${m.vision ? '<span class="model-tag vision">vision</span>' : ''}
      </div>
      <h3>${escapeHtml(m.name || m.id)}</h3>`
    card.addEventListener('click', () => {
      history.pushState(null, '', '/chat')
      navigate()
      ensureModelOption(m.id, true)
    })
    grid.appendChild(card)
  })
  if (count) {
    count.textContent = `${models.length}${catalogQuery ? ` matching '${catalogQuery}'` : ''} · ${allModels.length} total`
  }
  lucide.createIcons()
}

/* ================= Docs — endpoint explorer ================= */
const DOC_ENDPOINTS = [
  {
    id: 'models',
    method: 'GET', path: '/api/models', tag: 'models',
    desc: 'List available models (cached 10 min).',
    headers: {},
    body: null,
    examples: null,
    curlNow: 'curl -s https://HOST/api/models',
    run: async () => (await fetch('/api/models')).text(),
    requestLabel: 'arguments · none',
    bodyHint: 'This endpoint takes no body. Run it to list every model exposed by the server.',
  },
  {
    id: 'chat',
    method: 'POST', path: '/api/chat', tag: 'chat',
    desc: 'Stream a chat completion (SSE).',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openrouter/free',
      messages: [
        { role: 'system', content: 'You are a concise assistant.' },
        { role: 'user', content: 'Say hello in 5 words.' },
      ],
    }, null, 2),
    curl: (b, host) => `curl -N https://${host}/api/chat \\
  -X POST \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(b)}'`,
    run: (b) => runStream(b),
    requestLabel: 'request body · json',
    bodyHint: 'Streams events back over SSE until [DONE].',
  },
  {
    id: 'config',
    method: 'GET', path: '/api/config', tag: 'config',
    desc: 'App config: title, default model, key status.',
    headers: {}, body: null, examples: null,
    curlNow: 'curl -s https://HOST/api/config',
    run: async () => (await fetch('/api/config')).text(),
    requestLabel: 'arguments · none',
    bodyHint: 'Read-only configuration object.',
  },
  {
    id: 'search',
    method: 'GET', path: '/api/search?q=…', tag: 'search',
    desc: 'Web search via DuckDuckGo (min 3 chars).',
    headers: {}, body: null,
    query: 'q',
    queryValue: 'large language models 2026',
    curlNow: 'curl -s "https://HOST/api/search?q=latest+AI+news"',
    run: () => fetch(`/api/search?q=${encodeURIComponent('large language models 2026')}`).then(r => r.ok ? r.text() : r.text().then(t => `HTTP ${r.status}\n${t}`)),
    requestLabel: 'query params',
    bodyHint: 'Returns { results: [] } of fresh web results.',
  },
  {
    id: 'images',
    method: 'POST', path: '/api/images', tag: 'images',
    desc: 'Generate an image (url or b64).',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'google/gemini-2.5-flash-image', prompt: 'a minimalist logo of a rising sun over the ocean' }, null, 2),
    curl: (b, host) => `curl https://${host}/api/images \\
  -X POST \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(b)}'`,
    run: (b) => fetch('/api/images', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.ok ? r.text() : r.text().then(t => `HTTP ${r.status}\n${t}`)),
    requestLabel: 'request body · json',
    bodyHint: 'Returns { url } or { b64 } when successful.',
  },
  {
    id: 'chats',
    method: 'GET', path: '/api/chats', tag: 'chats',
    desc: 'Fetch all cloud-synced chats.',
    headers: {}, body: null, examples: null,
    curlNow: 'curl -s https://HOST/api/chats',
    run: async () => (await fetch('/api/chats')).text(),
    requestLabel: 'arguments · none',
    bodyHint: 'Also supports PUT /api/chats to persist {\"chats\": []}.',
  },
]

function reqBodyJson(s) {
  try { return JSON.parse(s) } catch (e) { throw new Error('invalid JSON: ' + e.message) }
}

async function runStream(body) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) return `HTTP ${res.status}\n${await res.text()}`
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let out = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const block = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      for (const line of block.split('\n')) {
        if (!line.startsWith('data:')) continue
        const d = line.slice(5).trim()
        if (d === '[DONE]') continue
        try {
          const j = JSON.parse(d)
          if (j.error) out += `[stream error] ${j.message}\n`
          else if (j.content) out += j.content
        } catch {}
      }
    }
  }
  return out
}

function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function syntaxHighlight(json, errFlag) {
  if (typeof json !== 'string') json = json || ''
  if (errFlag) return escapeHtml(json)
  let out = escapeHtml(json)
    .replace(/("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*")\s*:/g, '<span class="text-zinc-400">$1</span>:')
    .replace(/\b(true|false)\b/g, '<span class="text-zinc-300">$1</span>')
    .replace(/\bnull\b/g, '<span class="text-zinc-500">null</span>')
  return out
}
function prettyJson(obj, indent = 2) {
  try { return JSON.stringify(typeof obj === 'string' ? JSON.parse(obj) : obj, null, indent) }
  catch { return obj }
}

let runAbort = null
function stopRun() {
  if (runAbort) { runAbort.abort(); runAbort = null }
}

function buildReqUI(def) {
  const host = location.host
  const wrap = document.createElement('div')
  wrap.className = 'req-block'

  const topbar = document.createElement('div')
  topbar.className = 'req-topbar'
  topbar.innerHTML = `
    <span class="req-label">${escapeHtml(def.requestLabel)}</span>
    <div class="flex items-center gap-2">
      <button class="copy-btn" data-copy="curl"><i data-lucide="terminal" class="size-3"></i> curl</button>
      <button class="copy-btn" data-copy="json"><i data-lucide="copy" class="size-3"></i> copy</button>
      <button class="btn btn-primary btn-sm" data-run><i data-lucide="play" class="size-3"></i> run</button>
    </div>`
  wrap.appendChild(topbar)

  const pre = document.createElement('pre')
  pre.className = 'req-code'
  const body = document.createElement('textarea')
  body.className = 'req-body'
  body.spellcheck = false
  wrap.appendChild(pre)
  wrap.appendChild(body)

  if (def.body) {
    body.value = def.body
    pre.textContent = def.body
    pre.classList.add('show')
    wrap.classList.add('has-body')
  } else {
    const hint = document.createElement('div')
    hint.className = 'px-4 py-3 mono text-[12px] text-text-3'
    hint.textContent = def.bodyHint || 'No body required.'
    wrap.appendChild(hint)
    body.classList.add('hidden')
  }

  const respPanel = document.createElement('div')
  respPanel.className = 'resp-panel hidden'
  respPanel.innerHTML = `
    <div class="resp-head">
      <span class="mono text-[11px] text-text-3">response</span>
      <span class="status-badge load" data-status><span class="loading-wave" style="display:inline-flex;margin-right:6px"><span></span><span></span><span></span><span></span><span></span></span>loading</span>
    </div>
    <pre class="resp-pre hint" data-body>running request…</pre>`
  wrap.appendChild(respPanel)

  const setJson = (s) => { pre.textContent = s; pre.classList.add('show'); body.classList.remove('hidden'); }
  const getCurl = () => {
    if (def.curlNow) return def.curlNow.replace('HOST', host)
    try { return def.curl(reqBodyJson(body.value), host) } catch (e) { return '# ' + e.message }
  }

  topbar.querySelector('[data-copy="json"]').addEventListener('click', (e) => {
    const s = body.value || '{}'
    navigator.clipboard.writeText(s).then(() => flashCopied(e.currentTarget))
  })
  topbar.querySelector('[data-copy="curl"]').addEventListener('click', (e) => {
    navigator.clipboard.writeText(getCurl()).then(() => flashCopied(e.currentTarget))
  })
  body.addEventListener('input', () => {
    if (def.body) localStorage.setItem('req:' + def.id, body.value)
    body.classList.remove('err')
  })
  setupBodyPrefill(def, body)

  topbar.querySelector('[data-run]').addEventListener('click', async () => {
    stopRun()
    let payload
    if (!def.body) {
      payload = null
    } else {
      try { payload = reqBodyJson(body.value) } catch (e) {
        body.classList.add('err')
        showResp(respPanel, e.message, true)
        showToast(e.message, 'error')
        return
      }
      body.classList.remove('err')
    }
    respPanel.classList.remove('hidden')
    showResp(respPanel, 'running request…', false, true)
    const ac = new AbortController()
    runAbort = ac
    const timer = setTimeout(() => ac.abort(), 30000)
    try {
      const text = await def.run(payload, ac.signal)
      showResp(respPanel, text, String(text).includes('HTTP ') || String(text).includes('stream error'), false)
    } catch (err) {
      showResp(respPanel, err.name === 'AbortError' ? 'request aborted (timeout)' : String(err && err.message || err), true, false)
      showToast(err.name === 'AbortError' ? 'Request timed out' : 'Request failed', 'error')
    } finally {
      clearTimeout(timer)
      if (runAbort === ac) runAbort = null
    }
  })
  return wrap
}

function showResp(panel, text, isErr, loading) {
  const s = panel.querySelector('[data-status]')
  const b = panel.querySelector('[data-body]')
  if (loading) {
    s.className = 'status-badge load'
    s.innerHTML = '<span class="loading-wave" style="display:inline-flex;margin-right:6px"><span></span><span></span><span></span><span></span><span></span></span>loading'
    b.className = 'resp-pre hint'
    b.innerHTML = escapeHtml(text)
    return
  }
  s.className = 'status-badge ' + (isErr ? 'err' : 'ok')
  s.textContent = isErr ? 'error' : '200 ok'
  b.className = 'resp-pre' + (isErr ? ' err' : '')
  b.innerHTML = syntaxHighlight(text, isErr)
}

function flashCopied(btn) {
  btn.classList.add('copied')
  const span = document.createElement('span')
  span.textContent = 'copied!'
  btn.appendChild(span)
  setTimeout(() => {
    btn.classList.remove('copied')
    span.remove()
  }, 1400)
}

function setupBodyPrefill(def, body) {
  const saved = localStorage.getItem('req:' + def.id)
  if (saved && def.body) body.value = saved
}

async function setupDocs() {
  const root = document.getElementById('endpoints')
  if (!root || root.dataset.ready) return
  root.dataset.ready = '1'
  root.innerHTML = '<div class="mt-4"><div class="skeleton h-12 w-full rounded-lg"></div></div>'
  for (const def of DOC_ENDPOINTS) {
    const el = document.createElement('div')
    el.className = 'endpoint'
    el.id = 'ep-' + def.id
    el.innerHTML = `
      <button class="endpoint-head">
        <span class="method ${def.method.toLowerCase()}">${def.method}</span>
        <span class="path">${escapeHtml(def.path)}</span>
        <span class="endpoint-desc">${escapeHtml(def.desc)}</span>
        <i data-lucide="chevron-down" class="size-4 shrink-0 text-text-3 transition-transform duration-200"></i>
      </button>
      <div class="endpoint-body hidden"></div>`
    const bodyWrap = el.querySelector('.endpoint-body')
    const chevron = el.querySelector('i')
    const head = el.querySelector('.endpoint-head')
    el.classList.add('animated')
    head.addEventListener('click', () => {
      const open = !bodyWrap.classList.contains('hidden')
      bodyWrap.classList.toggle('hidden', open)
      chevron.style.transform = open ? '' : 'rotate(180deg)'
      if (catalogOpenId && catalogOpenId !== def.id) {
        const other = document.getElementById('ep-' + catalogOpenId)
        if (other) {
          const ob = other.querySelector('.endpoint-body')
          const oc = other.querySelector('.endpoint-head i')
          ob.classList.add('hidden')
          if (oc) oc.style.transform = ''
        }
      }
      catalogOpenId = open ? null : def.id
      if (!open && !bodyWrap.childElementCount) bodyWrap.appendChild(buildReqUI(def))
      lucide.createIcons()
    })
    root.appendChild(el)
  }
  lucide.createIcons()
}
function init() {
  setupRouter()
  setupNav()
  if (document.getElementById('auth-page')) setupAuth()
  setupChatExtras()
  setupEffects()
  setupCatalog()
  setupDocs()
  navigate()

  if (window.visualViewport) {
    const vv = window.visualViewport
    const updateKb = () => {
      const kb = Math.max(0, window.innerHeight - vv.height)
      document.documentElement.style.setProperty('--kb', kb + 'px')
      if (document.getElementById('chat-page').classList.contains('active')) {
        requestAnimationFrame(() => { scrollEl.scrollTop = scrollEl.scrollHeight })
      }
    }
    vv.addEventListener('resize', updateKb)
    vv.addEventListener('scroll', updateKb)
    updateKb()
  }

  renderSidebarSkeleton()
  ;(async () => {
    await syncFromServer()
    renderChat()
    renderSidebar()
    updateControls()
    renderModeButtons()
    loadModels()
    renderCatalog()
    input.focus()

    try {
      const res = await fetch('/api/config')
      const cfg = await res.json()
      if (cfg.title) {
        cfgTitle = cfg.title
        appName.textContent = cfg.title
      }
      if (cfg.defaultModel) lastModel = cfg.defaultModel
    } catch {}
  })()
}

init()