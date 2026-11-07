// Salary Reality Index — anonymous, graduate-focused salary reports for Pakistan.
// Community medians come ONLY from admin-approved, non-example reports.
// Published reference figures are other platforms' data, shown with source and
// date, and are NEVER mixed into community medians.
// Node.js 24+, native node:http + node:sqlite only. No external dependencies.
// Port 3033. Data: data/salary.sqlite.
// Admin gate is a shared code that comes ONLY from the ADMIN_CODE environment
// variable. There is NO default: the server exits FATAL without it, so a
// deployed copy can never be moderated with a code anyone can read in the repo.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT || 3033);
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'salary.sqlite');
const PUBLIC_DIR = path.join(__dirname, 'public');
const ADMIN_CODE = process.env.ADMIN_CODE;
if (!ADMIN_CODE) {
  console.error('FATAL: ADMIN_CODE environment variable is required. Set a private admin code before starting, e.g. ADMIN_CODE=<private-code> node server.js. There is no default code.');
  process.exit(1);
}

const ROLES = ['Software Engineer', 'Data Analyst', 'Web Developer', 'QA Engineer',
  'DevOps Engineer', 'UI/UX Designer', 'Digital Marketer', 'Accountant'];
const CITIES = ['Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Faisalabad',
  'Peshawar', 'Multan', 'Hyderabad', 'Quetta', 'Remote (Pakistan)', 'Remote (International)'];
const EXP_BANDS = ['0–1', '1–3', '3–5', '5+'];
const WORK_TYPES = ['Local Pakistan', 'Remote International'];
const MAX_BASE = 50000000; // PKR per month; anything at/above is rejected
const MAX_BONUS = 600000000; // PKR per year (12x MAX_BASE); blocks absurd bonus values inflating the median total

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS reference_figures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL, source TEXT NOT NULL, date_label TEXT NOT NULL,
  sample_size TEXT NOT NULL DEFAULT '', counts_what TEXT NOT NULL,
  value_text TEXT NOT NULL, monthly_pkr REAL, note TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL, city TEXT NOT NULL, exp_band TEXT NOT NULL,
  base_monthly_pkr REAL NOT NULL, bonus_yearly_pkr REAL NOT NULL DEFAULT 0,
  work_type TEXT NOT NULL, company TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','approved','rejected','hidden')),
  is_example INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// ---- seed: published reference figures + exactly 3 EXAMPLE reports. ----
// Zero approved community reports are seeded. EXAMPLE rows are approved in
// status but carry is_example=1 and are excluded from every stat and list.
const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-data.json'), 'utf8'));
if (db.prepare('SELECT COUNT(*) c FROM reference_figures').get().c === 0) {
  const ins = db.prepare(`INSERT INTO reference_figures
    (label, source, date_label, sample_size, counts_what, value_text, monthly_pkr, note)
    VALUES(?,?,?,?,?,?,?,?)`);
  for (const r of seed.reference) {
    ins.run(r.label, r.source, r.date_label, r.sample_size || '', r.counts_what,
      r.value_text, r.monthly_pkr === null ? null : r.monthly_pkr, r.note || '');
  }
}
if (db.prepare('SELECT COUNT(*) c FROM reports').get().c === 0) {
  const ins = db.prepare(`INSERT INTO reports
    (role, city, exp_band, base_monthly_pkr, bonus_yearly_pkr, work_type, company, status, is_example)
    VALUES(?,?,?,?,?,?,?,?,1)`);
  for (const r of seed.example_reports) {
    ins.run(r.role, r.city, r.exp_band, r.base_monthly_pkr, r.bonus_yearly_pkr,
      r.work_type, r.company || '', 'approved');
  }
}

function medianSorted(sorted) {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100;
}
function percentileSorted(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
// Approved, non-example reports matching the filters. Empty filter = all.
function matchingReports(filters) {
  const conds = ["status = 'approved'", 'is_example = 0'];
  const params = [];
  for (const [key, col] of [['role', 'role'], ['city', 'city'], ['exp', 'exp_band'], ['work', 'work_type']]) {
    if (filters[key]) { conds.push(col + ' = ?'); params.push(filters[key]); }
  }
  return db.prepare(`SELECT base_monthly_pkr base, bonus_yearly_pkr bonus FROM reports
    WHERE ${conds.join(' AND ')} ORDER BY base_monthly_pkr ASC`).all(...params);
}
function statsFor(filters) {
  const rows = matchingReports(filters);
  if (rows.length === 0) {
    return { count: 0, empty: true, median: null, p25: null, p75: null, min: null,
      max: null, median_total_monthly: null, sample_note: null };
  }
  const bases = rows.map((r) => r.base).sort((a, b) => a - b);
  const totals = rows.map((r) => round2(r.base + r.bonus / 12)).sort((a, b) => a - b);
  return { count: rows.length, empty: false, median: medianSorted(bases),
    p25: percentileSorted(bases, 25), p75: percentileSorted(bases, 75),
    min: bases[0], max: bases[bases.length - 1], median_total_monthly: medianSorted(totals),
    sample_note: rows.length < 3 ? 'small sample — treat with care' : null };
}
function companies() {
  // A company is named ONLY when >= 3 approved, non-example reports name it.
  const bases = db.prepare(`SELECT company, base_monthly_pkr base FROM reports
    WHERE status = 'approved' AND is_example = 0 AND TRIM(company) != ''`).all();
  const byKey = new Map();
  for (const b of bases) {
    const key = b.company.trim().toLowerCase();
    if (!byKey.has(key)) byKey.set(key, { display: b.company.trim(), values: [] });
    byKey.get(key).values.push(b.base);
  }
  return [...byKey.values()]
    .filter((g) => g.values.length >= 3)
    .map((g) => {
      const sorted = g.values.sort((a, b) => a - b);
      return { company: g.display, count: sorted.length, median_base: medianSorted(sorted) };
    })
    .sort((a, b) => b.count - a.count);
}
function adminOk(code) {
  return code === ADMIN_CODE;
}

// ---- HTTP layer (same shape as the house style) ----
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 200000) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve(null); } });
    req.on('error', reject);
  });
}
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.join(PUBLIC_DIR, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    if (p === '/health' && req.method === 'GET') {
      return sendJson(res, 200, { ok: true, service: 'salary-reality-index' });
    }
    if (p === '/api/meta' && req.method === 'GET') {
      return sendJson(res, 200, { roles: ROLES, cities: CITIES, exp_bands: EXP_BANDS,
        work_types: WORK_TYPES, max_base_monthly_pkr: MAX_BASE,
        max_bonus_yearly_pkr: MAX_BONUS,
        notice: 'Community medians come only from admin-approved anonymous reports. Published reference figures are other platforms\' data and are never mixed into community stats.' });
    }
    if (p === '/api/stats' && req.method === 'GET') {
      const f = { role: url.searchParams.get('role') || '', city: url.searchParams.get('city') || '',
        exp: url.searchParams.get('exp') || '', work: url.searchParams.get('work') || '' };
      return sendJson(res, 200, { filters: f, ...statsFor(f) });
    }
    if (p === '/api/reference' && req.method === 'GET') {
      const rows = db.prepare('SELECT * FROM reference_figures ORDER BY id').all();
      return sendJson(res, 200, { rows });
    }
    if (p === '/api/companies' && req.method === 'GET') {
      return sendJson(res, 200, { companies: companies(),
        rule: 'A company is named only when at least 3 approved reports name it; otherwise it is hidden.' });
    }
    if (p === '/api/report' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body) return sendJson(res, 400, { error: 'body required' });
      const role = String(body.role || '').trim();
      const city = String(body.city || '').trim();
      const exp = String(body.exp_band || '').trim();
      const work = String(body.work_type || '').trim();
      const base = Number(body.base_monthly_pkr);
      const bonus = body.bonus_yearly_pkr === undefined || body.bonus_yearly_pkr === '' ? 0 : Number(body.bonus_yearly_pkr);
      const company = String(body.company || '').trim().slice(0, 100);
      if (!ROLES.includes(role)) return sendJson(res, 400, { error: 'role must be one of the 8 listed roles' });
      if (!CITIES.includes(city)) return sendJson(res, 400, { error: 'city must be one of the listed cities' });
      if (!EXP_BANDS.includes(exp)) return sendJson(res, 400, { error: 'exp_band must be one of 0–1, 1–3, 3–5, 5+' });
      if (!WORK_TYPES.includes(work)) return sendJson(res, 400, { error: 'work_type must be Local Pakistan or Remote International' });
      if (!Number.isFinite(base) || base <= 0 || base >= MAX_BASE) {
        return sendJson(res, 400, { error: 'base_monthly_pkr must be a positive number under PKR 50,000,000/month' });
      }
      if (!Number.isFinite(bonus) || bonus < 0 || bonus >= MAX_BONUS) return sendJson(res, 400, { error: 'bonus_yearly_pkr must be 0 or more and under PKR 600,000,000/year' });
      const row = db.prepare(`INSERT INTO reports
        (role, city, exp_band, base_monthly_pkr, bonus_yearly_pkr, work_type, company, status)
        VALUES(?,?,?,?,?,?,?,'pending')`).run(role, city, exp, base, bonus, work, company);
      return sendJson(res, 200, { ok: true, id: Number(row.lastInsertRowid),
        status: 'pending', note: 'Your report is PENDING. It will appear in stats only after admin approval.' });
    }
    if (p === '/api/admin/reports' && req.method === 'GET') {
      if (!adminOk(url.searchParams.get('code') || '')) return sendJson(res, 403, { error: 'bad admin code' });
      const status = url.searchParams.get('status') || 'pending';
      if (!['pending', 'approved', 'rejected', 'hidden', 'all'].includes(status)) {
        return sendJson(res, 400, { error: 'status must be pending, approved, rejected, hidden or all' });
      }
      const rows = status === 'all'
        ? db.prepare('SELECT * FROM reports ORDER BY created_at DESC, id DESC').all()
        : db.prepare('SELECT * FROM reports WHERE status = ? ORDER BY created_at DESC, id DESC').all(status);
      return sendJson(res, 200, { rows });
    }
    // Moderation state machine: approve restores from pending/hidden/rejected,
    // reject removes from pending/approved, hide removes from approved only.
    // Anything else (e.g. hiding a pending report, hiding twice) is a 409, so
    // a report can never be silently lost from the queue by a wrong click.
    const ALLOWED_TRANSITIONS = {
      approved: ['pending', 'hidden', 'rejected'],
      rejected: ['pending', 'approved'],
      hidden: ['approved'],
    };
    const setStatus = async (newStatus) => {
      const body = await readBody(req);
      if (!body || !adminOk(body.code)) return sendJson(res, 403, { error: 'bad admin code' });
      if (body.id === undefined) return sendJson(res, 400, { error: 'id required' });
      const id = Number(body.id);
      if (!Number.isFinite(id)) return sendJson(res, 400, { error: 'id must be a number' });
      const row = db.prepare('SELECT status FROM reports WHERE id = ?').get(id);
      if (!row) return sendJson(res, 404, { error: 'report not found' });
      if (!ALLOWED_TRANSITIONS[newStatus].includes(row.status)) {
        return sendJson(res, 409, { error: `cannot move report from ${row.status} to ${newStatus}` });
      }
      db.prepare('UPDATE reports SET status = ? WHERE id = ?').run(newStatus, id);
      return sendJson(res, 200, { ok: true, status: newStatus });
    };
    if (p === '/api/admin/approve' && req.method === 'POST') return setStatus('approved');
    if (p === '/api/admin/reject' && req.method === 'POST') return setStatus('rejected');
    if (p === '/api/admin/hide' && req.method === 'POST') return setStatus('hidden');
    if (req.method === 'GET') return serveStatic(req, res);
    res.writeHead(405); res.end('Method not allowed');
  } catch (e) {
    console.error(e);
    sendJson(res, 500, { error: 'server error' });
  }
});

server.listen(PORT, () => {
  console.log(`Salary Reality Index running on http://127.0.0.1:${PORT} (DB: ${DB_FILE})`);
});
