# Product Requirement Document (PRD) - GlossaHub (Developer Edition)

This document specifies the technical architecture, security requirements, and data schemas for **GlossaHub**, a Translation & Version Management Platform for Magene.

---

## 1. Technical Architecture & Run Environments

### 1.1 Stack Overview
*   **Frontend**: React 19 + Vite 8 (Port 5173).
*   **Backend**: Node.js Express (Port 3001).
*   **Database (SQLite/PostgreSQL)**: Supported SQLite by default (`glossahub.db`), unified via a database wrapper `db.query` / `db.run` supporting PostgreSQL placeholder conversions.
*   **Authentication**: JSON Web Token (JWT) issued on login, saved in browser `localStorage`.
*   **Styling**: Pure CSS (`index.css`) with custom dark components.

### 1.2 Authentication & Route Guards
*   All frontend API calls must be wrapped inside `apiFetch` (declared in `src/utils/api.js`).
*   **Auto-Login Redirect**: If an API call returns `401 Unauthorized`, `apiFetch` automatically clears stored token/user states and redirects the user to the `/login` route.
*   The system strictly forbids auto-login bypasses. Authentic passwords and usernames are checked.

---

## 2. API Endpoints Specifications

### 2.1 Authentication & Security (Auth Routing)
*   `POST /api/auth/login`: Accepts `username` and `password`. Returns JWT token.
    *   *Limit rule*: Rated limited using `express-rate-limit` to prevent brute force.
    *   *Password rule*: Hashed using `bcrypt` (10 rounds).

### 2.2 Version Tables (Data Tables)
*   `GET /api/projects/:projectId/versions`: Return all versions (tables) with latest modified audit date.
*   `POST /api/projects/:projectId/versions`: Create a new table.
*   `PUT /api/projects/:projectId/versions/:versionId`: Rename an existing table name.
*   `DELETE /api/projects/:projectId/versions/:versionId`: Delete version and cascade delete all its translations.

### 2.3 Main Translation Net Grid
*   `GET /api/versions/:versionId/terms`: Returns all keywords and multi-language JSON mappings.
*   `POST /api/versions/:versionId/terms/upsert`: Auto-debounce upsert. Matches `kw` unique constraint.
*   `POST /api/translate` / `POST /api/translate-all`: AI translation handlers. Proxied securely to Dify endpoint, keeping `DIFY_API_KEY` hidden from the network logs.

### 2.4 Glossary Manager (Dynamic Schema Engine)
*   `GET /api/projects/:projectId/glossary-tables`: Returns tables metadata including parsed JSON `headers`.
*   `POST /api/glossary-tables/:tableId/terms`: Overwrite-imports parsed terms list and saves custom headers arrays in the table metadata.
*   `GET /api/glossary-tables/:tableId/terms`: Returns terms list including the dynamic `fields` JSON map.

### 2.5 AI Telemetry & Diagnostics
*   `GET /api/dashboard/ai-usage`: Returns aggregated stats (today/this week tokens and elapsed times, alongside 7-day trend chart metrics).

---

## 3. Database Schema Layout

### 3.1 `versions` (Tables)
```sql
CREATE TABLE IF NOT EXISTS versions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  version_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

### 3.2 `terms` (Main translations)
```sql
CREATE TABLE IF NOT EXISTS terms (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
  kw TEXT NOT NULL,
  context TEXT,
  owner TEXT,
  zh_cn TEXT NOT NULL,
  translations TEXT NOT NULL DEFAULT '{}', -- Saved as JSON String: {"EN":"...", "FR":"..."}
  translations_meta TEXT DEFAULT '{}', -- Saved as JSON metadata: {"EN":{"source":"ai"}, "FR":{"source":"tm"}}
  created_at TEXT,
  updated_at TEXT,
  is_locked INTEGER DEFAULT 0,
  locked_by TEXT,
  locked_at TEXT,
  status TEXT DEFAULT 'DRAFT',
  reject_reason TEXT,
  UNIQUE(version_id, kw)
);
```

### 3.3 `glossary_tables`
```sql
CREATE TABLE IF NOT EXISTS glossary_tables (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  table_name TEXT NOT NULL,
  created_at TEXT,
  headers TEXT DEFAULT '["中文专业术语","英文翻译对应","说明 / 定义"]' -- Saved as JSON Array
);
```

### 3.4 `glossary_terms`
```sql
CREATE TABLE IF NOT EXISTS glossary_terms (
  id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL REFERENCES glossary_tables(id) ON DELETE CASCADE,
  cn_term TEXT,
  en_term TEXT,
  description TEXT,
  created_at TEXT,
  fields TEXT DEFAULT '{}' -- Saved as JSON map payload aligning headers
);
```

### 3.5 `ai_usage_logs` (AI usage telemetry)
```sql
CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  total_tokens INTEGER NOT NULL,
  elapsed_time INTEGER NOT NULL,
  user_id TEXT
);
```

