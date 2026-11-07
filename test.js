// Tests for Salary Reality Index. Spawns the server on a throwaway DB,
// runs HTTP checks, then deletes the test DB. Exit 0 only if all pass.
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const DIR = __dirname;
const DB = path.join(DIR, 'data', 'test-tmp.sqlite');
const PORT = 3096;
const BASE = 'http://127.0.0.1:' + PORT;
const CODE = 'test-admin';

let passed = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { passed++; }
  else { failures.push(name + (extra !== undefined ? ' :: ' + JSON.stringify(extra) : '')); }
}
async function j(url, opts) {
  const r = await fetch(url, opts);
  const t = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: t };
}
async function postReport(body) {
  const r = await j(BASE + '/api/report', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('report submit failed: ' + JSON.stringify(r.data));
  return r.data.id;
}
async function approve(id) {
  const r = await j(BASE + '/api/admin/approve', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: CODE, id }) });
  if (!r.ok) throw new Error('approve failed: ' + JSON.stringify(r.data));
}
async function stats(q) {
  const r = await j(BASE + '/api/stats?' + q);
  if (!r.ok) throw new Error('stats failed: ' + JSON.stringify(r.data));
  return r.data;
}
async function adminList(status, code, extra) {
  // Admin list auth: Authorization: Bearer header only — never ?code=.
  // `extra` appends raw query params (e.g. '&page=2&per_page=10').
  const headers = {};
  if (code !== undefined) headers.Authorization = 'Bearer ' + code;
  return j(BASE + '/api/admin/reports?status=' + status + (extra || ''), { headers });
}

async function main() {
  for (const f of [DB, DB + '-wal', DB + '-shm']) { try { fs.unlinkSync(f); } catch {} }
  const child = spawn('node', ['server.js'], { cwd: DIR, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT), DB_FILE: DB, ADMIN_CODE: CODE } });
  try {
    let ready = false;
    for (let i = 0; i < 50 && !ready; i++) {
      try { const r = await fetch(BASE + '/api/meta'); ready = r.ok; } catch {}
      if (!ready) await new Promise((r) => setTimeout(r, 100));
    }
    check('server starts', ready);

    // 0. DB fallback helper (db-path.js, FoodScope pattern): a read-only app
    // dir falls back to /tmp/<app>, a writable one stays in data/, and
    // DB_FILE env wins over both. isWritable is injected so the read-only
    // case is deterministic even as root (chmod alone would not fail there).
    const { resolveDbFile } = require('./db-path.js');
    const os = require('node:os');
    check('db fallback: read-only app dir -> /tmp/salary/salary.sqlite',
      resolveDbFile({ appDir: DIR, fileName: 'salary.sqlite', tmpName: 'salary', isWritable: () => false })
        === path.join(os.tmpdir(), 'salary', 'salary.sqlite'));
    check('db fallback: writable app dir -> data/salary.sqlite',
      resolveDbFile({ appDir: DIR, fileName: 'salary.sqlite', tmpName: 'salary', isWritable: () => true })
        === path.join(DIR, 'data', 'salary.sqlite'));
    {
      const prevDbFile = process.env.DB_FILE;
      process.env.DB_FILE = '/tmp/custom-test.sqlite';
      const envWins = resolveDbFile({ appDir: DIR, fileName: 'salary.sqlite', tmpName: 'salary', isWritable: () => false }) === '/tmp/custom-test.sqlite';
      if (prevDbFile === undefined) delete process.env.DB_FILE; else process.env.DB_FILE = prevDbFile;
      check('db fallback: DB_FILE env wins over both', envWins);
    }

    // 1. Meta lists.
    const meta = await j(BASE + '/api/meta');
    check('meta roles = 8', meta.data.roles && meta.data.roles.length === 8, meta.data.roles);
    check('meta cities = 11', meta.data.cities && meta.data.cities.length === 11, meta.data.cities);
    check('meta max bonus = 600000000', meta.data.max_bonus_yearly_pkr === 600000000, meta.data.max_bonus_yearly_pkr);

    // 2. Reference rows carry source + date.
    const ref = await j(BASE + '/api/reference');
    check('reference rows = 13', ref.data.rows && ref.data.rows.length === 13, ref.data.rows && ref.data.rows.length);
    check('every reference row has source + date',
      ref.data.rows && ref.data.rows.every((x) => x.source && x.date_label));
    check('Levels.fyi Pakistan median present',
      ref.data.rows && ref.data.rows.some((x) => x.source === 'Levels.fyi' && x.monthly_pkr === 258790));

    // 3. Fresh DB: zero approved community reports; EXAMPLE rows excluded.
    const s0 = await stats('');
    check('fresh stats empty, median null (never 0)', s0.count === 0 && s0.empty === true && s0.median === null, s0);
    const sEx = await stats('role=' + encodeURIComponent('Software Engineer') + '&city=Lahore&exp=' + encodeURIComponent('1–3'));
    check('EXAMPLE report does not affect stats', sEx.count === 0 && sEx.empty === true, sEx);

    // 4. Validation rejects bad input with 400.
    const bad = [
      [{ role: 'Astronaut', city: 'Lahore', exp_band: '1–3', base_monthly_pkr: 50000, work_type: 'Local Pakistan' }, 'bad role'],
      [{ role: 'Data Analyst', city: 'Atlantis', exp_band: '1–3', base_monthly_pkr: 50000, work_type: 'Local Pakistan' }, 'bad city'],
      [{ role: 'Data Analyst', city: 'Lahore', exp_band: '9–9', base_monthly_pkr: 50000, work_type: 'Local Pakistan' }, 'bad exp'],
      [{ role: 'Data Analyst', city: 'Lahore', exp_band: '1–3', base_monthly_pkr: 0, work_type: 'Local Pakistan' }, 'base zero'],
      [{ role: 'Data Analyst', city: 'Lahore', exp_band: '1–3', base_monthly_pkr: 50000000, work_type: 'Local Pakistan' }, 'base at cap'],
      [{ role: 'Data Analyst', city: 'Lahore', exp_band: '1–3', base_monthly_pkr: 50000, bonus_yearly_pkr: -5, work_type: 'Local Pakistan' }, 'negative bonus'],
    ];
    for (const [body, name] of bad) {
      const r = await j(BASE + '/api/report', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      check('400 for ' + name, r.status === 400, r.status);
    }
    // 4b. Bonus cap: at the cap is rejected, just under it is accepted.
    const bonusCap = await j(BASE + '/api/report', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'Data Analyst', city: 'Lahore', exp_band: '1–3', base_monthly_pkr: 50000, bonus_yearly_pkr: 600000000, work_type: 'Local Pakistan' }) });
    check('400 for bonus at cap', bonusCap.status === 400, bonusCap.status);
    const bonusOk = await j(BASE + '/api/report', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'Accountant', city: 'Hyderabad', exp_band: '5+', base_monthly_pkr: 50000, bonus_yearly_pkr: 599999999, work_type: 'Local Pakistan' }) });
    check('200 for bonus just under cap', bonusOk.status === 200, bonusOk.status);

    // 5. Pending report does not affect stats.
    const pendId = await postReport({ role: 'Data Analyst', city: 'Islamabad', exp_band: '1–3',
      base_monthly_pkr: 999999, work_type: 'Local Pakistan' });
    const sPend = await stats('role=' + encodeURIComponent('Data Analyst') + '&city=Islamabad&exp=' + encodeURIComponent('1–3'));
    check('pending report invisible in stats', sPend.count === 0, sPend);

    // 6. Admin gates: wrong code 403; query-string codes rejected outright.
    const wrongList = await adminList('pending', 'nope');
    check('admin list wrong code 403', wrongList.status === 403, wrongList.status);
    const noHeaderList = await adminList('pending');
    check('admin list no header 403', noHeaderList.status === 403, noHeaderList.status);
    const queryList = await j(BASE + '/api/admin/reports?code=' + CODE + '&status=pending');
    check('admin list query-string code rejected 403 (even when correct)', queryList.status === 403, queryList.status);
    const queryWrongList = await j(BASE + '/api/admin/reports?code=nope&status=pending');
    check('admin list query-string wrong code 403', queryWrongList.status === 403, queryWrongList.status);
    const goodList = await adminList('pending', CODE);
    check('admin list Bearer code 200', goodList.ok === true && Array.isArray(goodList.data.rows), goodList.status);
    const wrongApprove = await j(BASE + '/api/admin/approve', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'nope', id: pendId }) });
    check('admin approve wrong code 403', wrongApprove.status === 403, wrongApprove.status);

    // 7. Known median case: 50000 / 60000 / 70000 -> median 60000.
    for (const base of [50000, 60000, 70000]) {
      const id = await postReport({ role: 'Data Analyst', city: 'Islamabad', exp_band: '1–3',
        base_monthly_pkr: base, work_type: 'Local Pakistan' });
      await approve(id);
    }
    const sMed = await stats('role=' + encodeURIComponent('Data Analyst') + '&city=Islamabad&exp=' + encodeURIComponent('1–3'));
    check('median case count 3', sMed.count === 3, sMed);
    check('median 60000', sMed.median === 60000, sMed);
    check('p25 50000 / p75 70000', sMed.p25 === 50000 && sMed.p75 === 70000, sMed);
    check('min 50000 / max 70000', sMed.min === 50000 && sMed.max === 70000, sMed);
    check('median total = 60000 with zero bonuses', sMed.median_total_monthly === 60000, sMed);
    check('3 reports = not small sample', sMed.sample_note === null, sMed);

    // 8. Median total monthly equivalent with bonuses: totals 50000 and 90000.
    for (const [base, bonus] of [[50000, 0], [70000, 240000]]) {
      const id = await postReport({ role: 'QA Engineer', city: 'Lahore', exp_band: '0–1',
        base_monthly_pkr: base, bonus_yearly_pkr: bonus, work_type: 'Local Pakistan' });
      await approve(id);
    }
    const sTot = await stats('role=' + encodeURIComponent('QA Engineer') + '&city=Lahore&exp=' + encodeURIComponent('0–1'));
    check('bonus median base 60000', sTot.median === 60000, sTot);
    check('bonus median total 70000', sTot.median_total_monthly === 70000, sTot);
    check('2 reports = small sample label', sTot.sample_note !== null, sTot);

    // 9. Company hidden below 3, shown at 3.
    const coIds = [];
    for (const base of [90000, 110000]) {
      const id = await postReport({ role: 'Web Developer', city: 'Karachi', exp_band: '3–5',
        base_monthly_pkr: base, work_type: 'Local Pakistan', company: 'TestCo' });
      await approve(id); coIds.push(id);
    }
    const co2 = await j(BASE + '/api/companies');
    check('company hidden below 3 reports',
      !co2.data.companies.some((c) => c.company === 'TestCo'), co2.data.companies);
    const id3 = await postReport({ role: 'Web Developer', city: 'Karachi', exp_band: '3–5',
      base_monthly_pkr: 100000, work_type: 'Local Pakistan', company: 'TestCo' });
    await approve(id3); coIds.push(id3);
    const co3 = await j(BASE + '/api/companies');
    const testCo = co3.data.companies.find((c) => c.company === 'TestCo');
    check('company shown at 3 reports', !!testCo && testCo.count === 3, co3.data.companies);
    check('company median 100000', !!testCo && testCo.median_base === 100000, testCo);

    // 10. Hide removes a report from stats and from the company list.
    const hide = await j(BASE + '/api/admin/hide', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: CODE, id: id3 }) });
    check('hide succeeds', hide.ok === true, hide);
    const coAfter = await j(BASE + '/api/companies');
    check('company hidden again after hide drops it below 3',
      !coAfter.data.companies.some((c) => c.company === 'TestCo'), coAfter.data.companies);

    // 11. Reject keeps a report out of stats.
    const rejId = await postReport({ role: 'Accountant', city: 'Quetta', exp_band: '5+',
      base_monthly_pkr: 123456, work_type: 'Local Pakistan' });
    const rej = await j(BASE + '/api/admin/reject', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: CODE, id: rejId }) });
    check('reject succeeds', rej.ok === true, rej);
    const sRej = await stats('role=Accountant&city=Quetta&exp=' + encodeURIComponent('5+'));
    check('rejected report invisible in stats', sRej.count === 0, sRej);

    // 12. Pages serve.
    const home = await fetch(BASE + '/');
    const homeText = await home.text();
    check('homepage 200 + title', home.ok && homeText.includes('Salary Reality Index'), home.status);
    const adminPage = await fetch(BASE + '/admin.html');
    check('admin page 200', adminPage.ok, adminPage.status);

    // 13. Health + admin status validation.
    const health = await j(BASE + '/health');
    check('health 200 + ok', health.ok === true && health.data.ok === true, health);
    const badStatus = await adminList('garbage', CODE);
    check('admin list bad status 400', badStatus.status === 400, badStatus.status);

    // 14. Moderation state machine: illegal moves are 409, restore works.
    async function adminAct(act, id, code) {
      return j(BASE + '/api/admin/' + act, { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code === undefined ? CODE : code, id }) });
    }
    const smId = await postReport({ role: 'Digital Marketer', city: 'Multan', exp_band: '3–5',
      base_monthly_pkr: 77000, work_type: 'Local Pakistan' });
    const hidePend = await adminAct('hide', smId);
    check('hide pending -> 409', hidePend.status === 409, hidePend.status);
    const approveMissing = await adminAct('approve', 999999);
    check('approve unknown id -> 404', approveMissing.status === 404, approveMissing.status);
    const approveNan = await adminAct('approve', 'abc');
    check('approve non-numeric id -> 400', approveNan.status === 400, approveNan.status);
    check('approve pending -> 200', (await adminAct('approve', smId)).ok === true);
    check('hide approved -> 200', (await adminAct('hide', smId)).ok === true);
    const hideAgain = await adminAct('hide', smId);
    check('hide hidden -> 409', hideAgain.status === 409, hideAgain.status);
    check('restore hidden via approve -> 200', (await adminAct('approve', smId)).ok === true);
    check('reject approved -> 200', (await adminAct('reject', smId)).ok === true);
    check('restore rejected via approve -> 200', (await adminAct('approve', smId)).ok === true);
    const sSm = await stats('role=' + encodeURIComponent('Digital Marketer') + '&city=Multan&exp=' + encodeURIComponent('3–5'));
    check('restored report counts again', sSm.count === 1 && sSm.median === 77000, sSm);

    // 14b. Admin-queue pagination. Two pending reports already exist (the
    // 999999 probe from §5 and the just-under-cap bonus report from 4b,
    // neither moderated); add 25 more.
    for (let i = 0; i < 25; i++) {
      await postReport({ role: 'Data Analyst', city: 'Lahore', exp_band: '1–3',
        base_monthly_pkr: 40000 + i * 1000, work_type: 'Local Pakistan' });
    }
    const pgDef = await adminList('pending', CODE);
    check('pagination default: 20 rows, total 27, 2 pages, page 1',
      pgDef.data.rows.length === 20 && pgDef.data.total === 27 && pgDef.data.total_pages === 2 && pgDef.data.page === 1, pgDef.data);
    const pg1 = await adminList('pending', CODE, '&page=1&per_page=10');
    check('pagination page 1 of 10: 10 rows, total 27, 3 pages',
      pg1.data.rows.length === 10 && pg1.data.total === 27 && pg1.data.total_pages === 3, pg1.data);
    const pg3 = await adminList('pending', CODE, '&page=3&per_page=10');
    check('pagination page 3 of 10: last 7 rows',
      pg3.data.rows.length === 7 && pg3.data.page === 3, pg3.data);
    const pg99 = await adminList('pending', CODE, '&page=99&per_page=10');
    check('pagination past the end: 0 rows, total still 27',
      pg99.data.rows.length === 0 && pg99.data.total === 27, pg99.data);
    check('pagination page=0 -> 400', (await adminList('pending', CODE, '&page=0')).status === 400);
    check('pagination per_page=101 -> 400', (await adminList('pending', CODE, '&per_page=101')).status === 400);
    check('pagination per_page=abc -> 400', (await adminList('pending', CODE, '&per_page=abc')).status === 400);

    // 14c. Security headers on API and static responses; favicon serves.
    const metaRes = await fetch(BASE + '/api/meta');
    check('security headers on API: nosniff + DENY + no-referrer',
      metaRes.headers.get('x-content-type-options') === 'nosniff'
      && metaRes.headers.get('x-frame-options') === 'DENY'
      && metaRes.headers.get('referrer-policy') === 'no-referrer',
      { cto: metaRes.headers.get('x-content-type-options'), xfo: metaRes.headers.get('x-frame-options'), rp: metaRes.headers.get('referrer-policy') });
    const homeRes = await fetch(BASE + '/');
    check('security headers on static pages: nosniff + DENY + no-referrer',
      homeRes.headers.get('x-content-type-options') === 'nosniff'
      && homeRes.headers.get('x-frame-options') === 'DENY'
      && homeRes.headers.get('referrer-policy') === 'no-referrer');
    const fav = await fetch(BASE + '/favicon.svg');
    const favText = await fav.text();
    check('favicon serves (200, svg, Rs mark)',
      fav.ok && (fav.headers.get('content-type') || '').includes('image/svg+xml') && favText.includes('>Rs<'), fav.status);

    // 14d. Oversize body: over 200,000 bytes -> 413 JSON, server stays up.
    const big = await j(BASE + '/api/report', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'Data Analyst', city: 'Lahore', exp_band: '1–3',
        base_monthly_pkr: 50000, work_type: 'Local Pakistan', company: 'x'.repeat(250000) }) });
    check('oversize body -> 413 with JSON error',
      big.status === 413 && big.data.error === 'request body too large', big);
    const stillUp = await j(BASE + '/api/meta');
    check('server still serves after a 413', stillUp.ok === true, stillUp.status);

    // 15. Fail-closed: a server started without ADMIN_CODE must exit, not serve.
    const DB2 = DB + '2';
    for (const f of [DB2, DB2 + '-wal', DB2 + '-shm']) { try { fs.unlinkSync(f); } catch {} }
    const envNoCode = { ...process.env, PORT: '3095', DB_FILE: DB2 };
    delete envNoCode.ADMIN_CODE;
    const child2 = spawn('node', ['server.js'], { cwd: DIR, stdio: 'ignore', env: envNoCode });
    let exitCode = null;
    child2.on('exit', (c) => { exitCode = c; });
    for (let i = 0; i < 30 && exitCode === null; i++) await new Promise((r) => setTimeout(r, 100));
    check('server exits without ADMIN_CODE', exitCode !== null && exitCode !== 0, exitCode);
    let noServe = false;
    try { const r = await fetch('http://127.0.0.1:3095/api/meta'); noServe = !r.ok; } catch { noServe = true; }
    check('nothing listening without ADMIN_CODE', noServe);
    try { child2.kill(); } catch {}
    for (const f of [DB2, DB2 + '-wal', DB2 + '-shm']) { try { fs.unlinkSync(f); } catch {} }
  } finally {
    child.kill();
    await new Promise((r) => setTimeout(r, 300));
    for (const f of [DB, DB + '-wal', DB + '-shm']) { try { fs.unlinkSync(f); } catch {} }
  }
  console.log(`\n${passed} passed, ${failures.length} failed.`);
  if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log(' - ' + f); process.exit(1); }
  console.log('ALL TESTS PASS');
}

main().catch((e) => { console.error(e); process.exit(1); });
