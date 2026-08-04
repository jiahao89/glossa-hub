# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project: GlossaHub

A collaborative translation term-management platform for cross-language hardware firmware apps. Vite + React frontend, Express + SQLite/PostgreSQL backend, deployable as Vercel (frontend) + Render (backend) + Supabase (database).

Repository status: **v1.1** (current dev branch), v1.0 is the last release. Cloud-deployed as `glossa-hub.vercel.app` (frontend) and `glossa-hub.onrender.com` (backend).

---

## Common Commands

### Local development
```bash
npm install              # install all deps (CommonJS server + ESM frontend)

# Run frontend + backend together (concurrent, recommended)
npm run dev:all          # Vite at :5173, Express at :3001

# Or run them separately
npm run dev              # Vite dev server only (5173)
npm run server           # Node/Express only (3001)

# Build (production output to ./dist)
npm run build
npm run preview          # preview built dist
npm run start            # production server (no Vite)
```

### Testing
```bash
npm test                 # vitest run -- frontend component + util tests (jsdom env)
npm run test:watch       # vitest watch mode
```

Backend tests live in `server/__tests__/` as `*.test.cjs` files using `supertest`. They require the SQLite database (`glossahub.db`) and login credentials (default admin e.g. `wangzhaoyun`/`magene123`). They are NOT registered in `package.json` scripts — run them directly:
```bash
node --test server/__tests__/auth.test.cjs          # node test runner style — but these files use jest-style describe/it via supertest
# OR with mocha if installed, otherwise convert paths. Most consistent invocation:
npx vitest run server/__tests__                    # vitest handles .cjs too
```
Test files: `auth`, `rbac`, `terms`, `difyGlossary`. They expect admin credentials `wangzhaoyun`/`magene123`.

### Linting
```bash
npm run lint             # oxlint
```

### Database utilities
```bash
node scripts/check_db.cjs           # inspect SQLite state
node scripts/clone_versions_data.cjs
```

To reset the local DB, delete `glossahub.db` (and `-shm` / `-wal` files). Restart the server — `ensureDbInit()` will recreate tables and seed default users.

---

## Environment variables (`.env`)

Backend (`server.cjs` reads these via `dotenv`):
- `PORT` — default 3001
- `JWT_SECRET` — **required in production**; dev falls back to `glossahub-dev-secret-do-not-use-in-prod`
- `INITIAL_ADMIN_PASSWORD` — seeds admin password on first init (default `magene123`)
- `DATABASE_URL` — Postgres connection string. If set + valid → uses **Postgres (Supabase)**; if absent or invalid → fallback **SQLite** (file at `./glossahub.db`)
- `CORS_ORIGINS` — comma-separated; auto-allows `*.vercel.app` plus `localhost:5173`
- `DIFY_BASE_URL`, `DIFY_API_KEY` — server-side defaults; per-project configs in `projects.dify_config` win

Frontend:
- `VITE_API_BASE_URL` — defaults to `''` (same-origin); proxy `/api` → `:3001` is wired in `vite.config.js`

Default seeded users (change via `INITIAL_ADMIN_PASSWORD` for admins):
- Admins: `wangzhaoyun`, `shidongsheng`, `liuchenlu`, `liuyuanyuan`, `bizihao`, `shengyongbang`, `lanyiwei`, `jiahao` — password `magene123` (or env)
- Editors: `user1`, `user2` — `user123`
- Viewers: `viewer1`, `viewer2` — `viewer123`

---

## High-level architecture

### File layout (the non-obvious bits)

- `server.cjs` is **just a re-export shim** — real backend is `server/app.cjs` mounting modular routers.
- `src/App.jsx` is the SPA shell — single root component hosting a tab-switching state machine. It lazy-loads each tab via `React.lazy()` so secondary tabs don't bloat initial bundle.
- Tab components in `src/components/` are independent: `DashboardTab`, `TranslationTab`, `VersionsTab`, `ComparisonTab`, `GlossaryTab`, `LanguagesTab`, `LogsTab`, `UsersTab`, `SettingsTab`. A view called `guide` is an `<iframe>` over `/public/操作说明.html`.
- API entry for Vercel serverless: `api/index.js` re-exports the same `app` from `server.cjs`. `vercel.json` rewrites `/api/:path*` → `/api/index.js`.
- DDL for Postgres lives in `db_init_pg.sql` (referenced by Supabase MCP); SQLite DDL is generated programmatically in `server/config/db.cjs` → `initSqliteTables()`.

### Backend routing layout (mounted in `server/app.cjs`)

```
/api/health                         → routes/health.cjs (always reachable)
/api/auth                           → routes/auth.cjs        (login, JWT issue)
/api/admin                          → routes/admin.cjs       (system admin user CRUD)
/api                                → routes/versions.cjs    (project/version table CRUD + clone)
/api                                → routes/terms.cjs       (term CRUD + paged reads)
/api                                → routes/sync.cjs        (CSV bulk sync, requires admin/editor)
/api                                → routes/glossary.cjs    (professional term library)
/api                                → routes/languages.cjs   (per-project language dictionary)
/api                                → routes/translation.cjs (Dify AI proxy + project dify config)
/api/dashboard                      → routes/dashboard.cjs   (coverage + AI usage stats)
/api                                → routes/recycleBin.cjs  (soft-delete restore, owner only)
/api/logs                           → routes/logs.cjs        (audit log pagination/filter)
```

All `/api/*` except `/api/health` pass through a DB-init guard middleware before mounting.

### Database layer

`server/config/db.cjs` exports a unified `db` object that abstracts SQLite vs. Postgres:
- `db.query(sql, params)` / `db.queryOne` / `db.run` / `db.transaction`
- SQL uses `$1, $2, ...` style placeholders for **both** backends — the SQLite path auto-rewrites to `?`.
- JSON field handling: `parseJsonField()` in `server/utils/jsonFields.cjs` unwraps nested double-encoded JSON (legacy data), handles null/empty gracefully.
- SQLite uses WAL mode, `synchronous = NORMAL`, `busy_timeout = 5000` for better concurrency.
- **Critical**: when writing cross-DB SQL, watch for type quirks — Postgres boolean vs SQLite integer 0/1 (e.g. `is_locked`), `datetime('now')` vs `NOW()`, `INSERT OR IGNORE` vs `ON CONFLICT ... DO NOTHING`, `json_extract` vs `->>`. See `server/routes/sync.cjs` and `server/routes/versions.cjs` for the workarounds.

### RBAC model (3 layers, enforced in `server/middleware/auth.cjs`)

1. `authenticateToken` — every protected route; rejects missing/invalid JWT with 401. Frontend `apiFetch()` (`src/utils/api.js`) handles 401 by clearing localStorage and forcing a reload.
2. `requireProjectMember` — system admins auto-pass as `owner`; everyone else checked against `project_members` table, role is stashed in `req.projectRole`.
3. `requireRole(['owner','editor'])` — fine-grained role gate for write ops.
4. `requireSystemAdmin` — system-admin-only routes (e.g. `sync-cleanup`, `debug-status`, `/api/admin/*`).

Project roles: `owner` (full CRUD), `editor` (write, no destructive ops), `viewer` (read-only + reviews).

### Dify AI translation (key business logic)

`server/services/difyService.cjs` + `server/routes/translation.cjs`:
- Per-project Dify config stored in `projects.dify_config` JSON column. Falls back to env defaults `DIFY_BASE_URL` / `DIFY_API_KEY`.
- `executeDifyWithFailover()` (in `translation.cjs`) tries the project's configured URL, then a hard-coded Magene production URL, then public Dify — passing through multiple keys with stale-key auto-correction. All candidates deduped by `url___key` signature.
- Each successful call logs to `ai_usage_logs` (tokens, elapsed_time, term kw, target languages) for the Dashboard's AI telemetry tab.
- KW (English key) generation in `generateKwHelper()` calls Dify first, falls back to public Google Translate, sanitizes output to `KW_SCREAMING_SNAKE` and prepends `KW_` if missing.

### Frontend state model

`src/App.jsx` owns cross-tab state: `activeTab`, `selectedTableId` (cross-tab navigation target), `theme`, `token`, `user`, `projectRole`, `modifiedCells`, `difyConnected`. Individual tab components are otherwise self-contained.

- `selectedTableId` flows in from Dashboard `onNavigate` to land on a specific table — handled via the `handleNavigate` callback that auto-clears it when leaving the translate tab.
- `projectRole` is fetched from `GET /api/projects/proj-default/role` after login and treated as `owner` for system admins (UI gating, not the source of truth — server enforces RBAC).
- Theme (`dark` default / `light`) persisted in `localStorage` and applied via `.light-mode` class on `<html>` — the early-load script in `index.html` reads it before React mounts to avoid flash.

### Translation tab — the most complex module

`src/components/TranslationTab.jsx` (~1500 lines as of v1.1) handles:
- Paged grid (page/pageSize) with search + status filter + "untranslated only" filter
- Cell-level optimistic UI with **optimistic locking**: client sends `updated_at`; server `UPDATE ... WHERE updated_at = $X` returns 409 on conflict (see `routes/terms.cjs` PUT handler).
- `translations_meta` JSON tracks per-language provenance (`ai` vs `human`) for the Bot icon in the grid (leftmost column).
- Inline edits via double-click, row-level dirty tracking with debounced localStorage persistence of `glossahub_modified_cells` (avoids main-thread blocking).
- Stale-fetch guard: each `loadTableData` increments a ref-based token; late responses are discarded.
- CSV import/export path uses `src/utils/csvHelper.js` (RFC-4180 parser + exporter).
- **Bulk AI translation** via Dify proxy; uses `requestsRef.current` to avoid stale closure issues noted in v1.1 review.

### Snapshots & rollback

`term_snapshots` table is written on every term update within the same `db.transaction()` (per v1.1 review fix M4). The Logs tab's "rollback" button reads snapshots, lets user pick a version, and restores. The rollback **itself creates another snapshot first** (a "后悔药" restore point) so it's reversible.

### Recycle bin

`server/services/recycleBin.cjs` (`backupToRecycleBin()`) serializes deleted entities (versions + cascaded terms, glossary tables, or language columns) into the `recycle_bin` table with `expires_at`. Owners can list and restore via `/api/projects/:projectId/recycle-bin` and `/api/recycle-bin/:id/restore`. Per v1.1 roadmap, items purge after 30 days.

### Testing approach

- **Backend tests** (`server/__tests__/*.test.cjs`) use `supertest` + the live `app.cjs`. Login as `wangzhaoyun/magene123`, `user1/user123`, `viewer1/viewer123` to exercise RBAC. They create a `RBAC测试表` test fixture and `ver-rbac-test-*` IDs to avoid colliding with real data.
- **Frontend tests** (`src/**/*.test.{js,jsx}`) use vitest + @testing-library/react + jsdom. Covered: `EmptyState`, `ErrorBoundary`, `Pagination`, `Skeleton`, `Toast`, plus `api.js` and `csvHelper.js`.
- Setup file: `src/test/setup.js` (just `@testing-library/jest-dom`).
- vitest config is in `vite.config.js` under the `test` key (inlined).

### Deployment topology

See `deployment/DEPLOYMENT.md` for full guide. The key thing:
- **Vercel** serves the static Vite build, rewrites `/api/*` to a serverless function at `api/index.js`.
- The **same** Express `app` from `server.cjs` runs both as a Node service (Render, `node server.cjs`) and as Vercel serverless functions (`api/index.js`). `app.cjs` checks `process.env.VERCEL` to skip `app.listen()` in the serverless case.
- **Supabase Postgres** is supported via `DATABASE_URL`; the connection string is rewritten at runtime to use the IPv4 pooler (`aws-1-ap-northeast-2.pooler.supabase.com:6543`) to bypass Render's IPv6 limitation.
- In serverless `VERCEL` mode without `DATABASE_URL`, DB lives in `/tmp` (ephemeral — warning is printed).

### Recent fix points (from `reviews/迭代计划-v1.1.md`)

When touching related code, check whether these specific bug classes might still lurk:
- **Optimistic lock TOCTOU**: `terms.cjs` PUT must keep `updated_at` in `WHERE` clause
- **INSERT OR REPLACE destroys locks/status**: use `ON CONFLICT (version_id, kw)` (PG) or `INSERT OR IGNORE` + targeted UPDATE (SQLite)
- **Snapshot + update not in same transaction** — wrap in `db.transaction(...)`
- **Set state side-effects in render** — use `recordsRef.current` for read-only synchronous derivations
- **Stale closure in batch translate / CSV import** — same remedy
- **Empty-records safety net on `sync-table`**: server throws if `records=[]` would wipe a populated table

### Other notes

- The codebase is bilingual (zh-CN comments + UI strings). Don't translate technical identifiers or log prefixes like `🌐`, `⚡`, `❌`.
- `package.json` `"type": "module"` makes the frontend ESM; all server-side files use `.cjs` to stay CommonJS.
- `oxlint` is the linter (faster than eslint).
- The `public/` folder is served by Vite as static assets, including `产品介绍.html`, `历史版本.html`, `操作说明.html`.
