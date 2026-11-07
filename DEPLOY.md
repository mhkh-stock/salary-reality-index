# Deploy — Salary Reality Index

Deploy-ready. The app collects anonymous salary reports for Pakistan:
community medians come ONLY from admin-approved, non-example reports.
Published reference figures are other platforms' data, shown with source
and date, and are never mixed into community stats.

## What you need
- This repo on GitHub: https://github.com/mhkh-stock/salary-reality-index
- A SnapDeploy account (sign in with "Continue with GitHub") and one free
  container slot (the free tier allows 4 containers and 5 deploys per
  12-hour window — check the dashboard before pushing, the budget is rolling).

## Steps (SnapDeploy)
1. SnapDeploy dashboard → **New Container** (or "Create app").
2. Connect the repo `mhkh-stock/salary-reality-index` (branch `main`).
3. Runtime: **Node 24** (the app needs Node 24+ for `node:sqlite`; no
   `npm install` — there are zero dependencies). `package.json` declares
   `"engines": {"node": ">=24"}`.
4. Start command: `node server.js`
5. Port: **3033** (the server binds `0.0.0.0` and reads `PORT` from the
   environment if the platform sets one).
6. Environment variables:
   - `ADMIN_CODE` — **required, fail-closed**. The server refuses to start
     without it; there is no default. Set a private code in the container's
     environment only — never in a file, the repo, or chat. The admin list
     takes it ONLY as an `Authorization: Bearer <code>` header, never in a
     URL query string.
   - `PORT` — optional, defaults to `3033`.
   - `DB_FILE` — optional. Default is `data/salary.sqlite` in the app
     directory. On SnapDeploy set it to `/tmp/salary.sqlite` (see below).
7. Deploy. SnapDeploy auto-deploys on every GitHub push after the first one.

## Writable directory (read-only app dir)
SnapDeploy's `/app` is read-only, so the app cannot create
`data/salary.sqlite` there. Two layers handle this:
- If `DB_FILE` is set (recommended: `/tmp/salary.sqlite`), it is used as-is.
- If it is not set and the app directory is not writable, the server
  automatically falls back to `/tmp/salary/salary.sqlite` and logs
  `Data directory (read-only app dir fallback): /tmp/salary`.
  The DB is re-seeded from `seed-data.json` on first start (13 reference
  figures + 3 EXAMPLE reports), so nothing is lost — but note `/tmp` does
  not survive a container rebuild, so community reports approved after a
  rebuild would be lost with it. There is no export yet: approve promptly
  and treat the live DB as the only copy of community reports.

## After deploy — check it works
- Open the site URL. The home page (salary explorer) must load.
- `GET /health` must return `{"ok":true,"service":"salary-reality-index"}`.
- `GET /api/meta` must return 8 roles and 11 cities.
- `GET /api/stats` must return `{"count":0,"empty":true,"median":null,...}`
  on a fresh DB (EXAMPLE reports never count).
- `GET /api/reference` must return 13 rows, every one with source + date.
- If the first open shows SnapDeploy's "Waking up your container..." page,
  wait a moment and reload — free containers sleep after ~15 minutes idle.

## Notes
- The SQLite file (`data/salary.sqlite`) is created on the container at
  first start and seeded from `seed-data.json` — do NOT upload a local
  database file; it is gitignored on purpose (`data/`, `*.sqlite*`).
- The app serves only files under `public/` plus `/health`, `/api/meta`,
  `/api/stats`, `/api/reference`, `/api/companies`, `/api/report` and the
  `/api/admin/*` moderation endpoints. Nothing else is reachable
  (`/data/salary.sqlite`, `/seed-data.json`, `/README.md` all return 404).
- The admin queue is paginated (`GET /api/admin/reports?status=pending
  &page=1&per_page=20`, per_page 1–100, default 20) and returns
  `total` / `total_pages` with the rows.
- Oversize request bodies (over 200,000 bytes) are rejected with HTTP 413
  and a JSON error, never a hung connection.
- Run the tests before pushing: `ADMIN_CODE` is required to run the server,
  the suite uses a dummy test code on a throwaway DB —
  `node test.js` (must print ALL TESTS PASS).
