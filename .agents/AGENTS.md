# Glossa-Hub AI Agent Guidelines

This file contains the core principles, architecture constraints, and business rules for the Glossa-Hub project. As an AI agent working on this repository, you must always adhere to these rules.

## 1. Git & Deployment Workflow
- **Dual Branch Commit**: When committing changes, always ensure code is pushed to BOTH the `v1.1` and `main` branches. 
- **Environment Split**: Vercel automatically deploys from the `main` branch. Active feature development should be done on the `v1.1` branch, followed by a merge to `main`.

## 2. Tech Stack & Architecture
- **Frontend**: React 18, Vite, Tailwind CSS. Components should be functional, use React Hooks, and follow modern modular design.
- **Backend**: Express.js (`server.cjs`). All API routes are contained here.
- **Dual Database Strategy**: 
  - **Local**: SQLite (`database.db`).
  - **Production**: PostgreSQL (Supabase). 
  - **Rule**: Whenever modifying database schema or writing SQL queries, you MUST provide compatible SQL for both dialects (e.g., SQLite uses `INTEGER` for booleans, while Postgres strictly uses `BOOLEAN`). Always test data type compatibility.

## 3. Core Business Logic & AI Integration
- **Dify AI Translation**: Translation calls use the Dify API. The system injects a `glossary_context` parameter for specialized vocabulary matching.
- **Two-tier Intercept Funnel**: 
  1. Full Match Bypass: If a term perfectly matches the local glossary, bypass AI and use local translation directly.
  2. Partial Match Prompting: If a term partially matches, inject the glossary rule into the Prompt via Dify.
- **Translation Metadata**: The `translations_meta` JSON field tracks whether a translation is `ai` (AI Generated) or `tm` (Translation Memory / Glossary Match). The UI renders `tm` with a green checkmark ✅.

## 4. Coding Standards & Best Practices
- **UI Design**: Use Tailwind CSS for styling. Keep interfaces clean, responsive, and aligned with the "Magene" brand style if applicable.
- **Error Handling**: API errors must return standard JSON formats (e.g., `{ error: '...' }`). Frontend should gracefully handle these with Toast notifications.
- **Idempotency**: Database initialization scripts (like `ALTER TABLE`) should always be idempotent (e.g., using `IF NOT EXISTS` or ignoring duplication errors) so they run safely on Vercel cold starts.
- **Security**: Protect routes with `authenticateToken`, `requireProjectMember`, and `requireRole` middleware where appropriate to maintain RBAC (Role-Based Access Control) integrity.
