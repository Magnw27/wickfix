# wickfix

**WickAI** — AI chat powered by OpenRouter. Monochrome product-style UI with 400+ models, live streaming (SSE), web search, and image generation.

## Run locally

```bash
npm install
cp .env.example .env   # isi OPENROUTER_API_KEY
npm start              # → http://localhost:8000
```

## Deploy to Vercel

Repo ini sudah siap untuk Vercel:

- `public/` → static assets (SPA: `/`, `/chat`, `/catalog`, `/docs`)
- `api/*.js` → serverless functions (`/api/chat`, `/api/models`, `/api/config`, `/api/chats`, `/api/search`, `/api/images`, `/api/health`)
- `vercel.json` → SPA rewrites + `maxDuration` untuk chat/images
- Handler bersama di `server/handlers.js` dipakai baik server lokal maupun fungsi serverless

### Langkah

1. Push repo ke GitHub, lalu import di [vercel.com/new](https://vercel.com/new).
2. Framework preset: **Other** (auto-detect). Jangan ubah Build/Root Directory.
3. Tambahkan environment variables di **Settings → Environment Variables**:

| Variable | Wajib | Contoh |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | ya | `sk-or-...` |
| `APP_TITLE` | tidak | `WickAI` |
| `OPENROUTER_BASE_URL` | tidak | `https://openrouter.ai/api/v1` |
| `DEFAULT_MODEL` | tidak | `openrouter/free` |
| `DEFAULT_IMAGE_MODEL` | tidak | `google/gemini-2.5-flash-image` |
| `APP_REFERER` | tidak | URL situs |

4. Deploy. Setelah selesai, verifikasi `https://<your-app>.vercel.app/api/health`.

> `.env` tidak ikut ter-bundle (git-ignored); di Vercel semua konfigurasi lewat env vars dashboard.

## Catatan platform

- **Chat store**: di serverless, filesystem repo read-only — sinkronisasi chat disimpan di `/tmp` dan hanya bertahan selama instance fungsi hidup. Chat tetap muncul sepanjang sesi browser (localStorage).
- **Streaming**: `/api/chat` memakai SSE. Di plan Hobby, fungsi dibatasi ~10 detik — model gratis yang responsif biasanya aman; plan Pro/Enterprise mendukung `maxDuration` hingga 300 detik.
- **Rate limit**: per-instance memory (berlaku per function instance, bukan global).