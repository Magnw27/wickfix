# WickAI Architecture Baseline

This document records the existing architecture before larger upgrades. The goal is to make future changes incremental and reversible.

## Request flow

Browser UI (`public/index.html` + `public/app.js` + `public/style.css`)
→ same-origin `/api/*`
→ `server.js` route dispatcher
→ `server/handlers.js`
→ provider/search/storage adapters
→ response back to UI.

On Vercel, the API entrypoints in `api/` reuse the same handlers, while `vercel.json` configures SPA rewrites and function durations.

## Current API surface

- `POST /api/chat` — streaming chat via provider chat completions.
- `GET /api/models` — provider model discovery with server-side cache.
- `GET|PUT /api/chats` — chat persistence through `server/store.js`.
- `GET /api/search` — DuckDuckGo HTML search adapter.
- `POST /api/images` — image generation proxy.
- `GET /api/health` — health/configuration status.
- `GET /api/config` — public runtime configuration.
- `POST /api/test` — provider connectivity test.

## Provider model

`server/openai.js` is a small OpenAI-compatible transport layer. `server/handlers.js` accepts an optional client provider override (`x-api-key` and `x-api-base-url`) and otherwise uses server configuration.

## UI model

The UI is currently a single HTML shell with page sections for landing, chat, catalog, and docs. Client-side navigation uses `history.pushState`. Chat state, provider preferences, and the demo account/session state are handled in browser storage by `public/app.js`.

## Persistence limitation

`server/store.js` uses a JSON file. On Vercel it redirects this file to `/tmp`, which is ephemeral and instance-local. This is suitable as a temporary compatibility layer, not as production-grade multi-user persistence.

## Upgrade strategy

1. Preserve existing routes and UI behavior while establishing tests and observability.
2. Harden request validation, provider boundaries, streaming reliability, and storage semantics.
3. Introduce durable user/chat data and real authentication before making the product multi-user at scale.
4. Refactor the UI only after API contracts are covered by tests.
5. Add advanced AI capabilities as isolated services/adapters rather than coupling them directly to the HTTP router.

No large UI/API rewrite should be considered complete without regression tests for the existing flow.
