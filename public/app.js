async function j(url, opts) {
  const r = await fetch(url, opts);
  const t = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: t };
}
function pkr(n) {
  if (n === null || n === undefined) return '—';
  return 'PKR ' + Math.round(n).toLocaleString('en-PK');
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fillSelect(el, items, first) {
  el.innerHTML = (first ? '<option value="">' + first + '</option>' : '')
    + items.map((x) => '<option>' + esc(x) + '</option>').join('');
}

async function init() {
  const meta = await j('/api/meta');
  if (!meta.ok) return;
  const m = meta.data;
  fillSelect(document.getElementById('fRole'), m.roles);
  fillSelect(document.getElementById('fCity'), m.cities);
  fillSelect(document.getElementById('fExp'), m.exp_bands);
  fillSelect(document.getElementById('fWork'), m.work_types);
  fillSelect(document.getElementById('sRole'), m.roles, 'All roles');
  fillSelect(document.getElementById('sCity'), m.cities, 'All cities');
  loadStats();
  loadCompanies();
  loadReference();
}

document.getElementById('reportForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('reportMsg');
  const body = {
    role: document.getElementById('fRole').value,
    city: document.getElementById('fCity').value,
    exp_band: document.getElementById('fExp').value,
    base_monthly_pkr: Number(document.getElementById('fBase').value),
    bonus_yearly_pkr: document.getElementById('fBonus').value === '' ? 0 : Number(document.getElementById('fBonus').value),
    work_type: document.getElementById('fWork').value,
    company: document.getElementById('fCompany').value.trim(),
  };
  const r = await j('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (r.ok) {
    msg.textContent = '✅ Submitted! Your report is PENDING — it will appear in stats only after admin approval.';
    e.target.reset();
  } else {
    msg.textContent = '❌ ' + (r.data.error || 'Could not submit. Please check your values.');
  }
});

async function loadStats() {
  const q = new URLSearchParams({
    role: document.getElementById('sRole').value,
    city: document.getElementById('sCity').value,
    exp: document.getElementById('sExp').value,
    work: document.getElementById('sWork').value,
  }).toString();
  const r = await j('/api/stats?' + q);
  const out = document.getElementById('statsOut');
  if (!r.ok) { out.innerHTML = '<p class="note">Could not load stats.</p>'; return; }
  const s = r.data;
  if (s.empty) {
    out.innerHTML = '<div class="empty">No approved reports match these filters yet. '
      + 'Be the first — <a href="#report">report your salary anonymously</a>. Nothing is invented here: zero reports means zero figures, not a guess. '
      + 'If you filtered narrowly, try widening a filter (e.g. All cities) before concluding there is no data.</div>';
    return;
  }
  out.innerHTML = '<div class="cards">'
    + '<div class="card big"><span>Median base</span><strong>' + pkr(s.median) + '</strong></div>'
    + '<div class="card"><span>25th percentile</span><strong>' + pkr(s.p25) + '</strong></div>'
    + '<div class="card"><span>75th percentile</span><strong>' + pkr(s.p75) + '</strong></div>'
    + '<div class="card"><span>Median total / month (base + bonus ÷ 12)</span><strong>' + pkr(s.median_total_monthly) + '</strong></div>'
    + '<div class="card"><span>Reports counted</span><strong>' + s.count + '</strong></div>'
    + '<div class="card"><span>Range</span><strong>' + pkr(s.min) + ' – ' + pkr(s.max) + '</strong></div>'
    + '</div>'
    + '<p class="note">Typical pay — the middle 50% of approved reports fall between <strong>' + pkr(s.p25) + '</strong> and <strong>' + pkr(s.p75) + '</strong> per month. The median is the middle value: half of reports are below it, half above.</p>'
    + (s.sample_note ? '<p class="warn">⚠️ ' + esc(s.sample_note) + ' (' + s.count + ' approved report' + (s.count === 1 ? '' : 's') + ').</p>' : '');
}
document.getElementById('sGo').addEventListener('click', loadStats);

async function loadCompanies() {
  const r = await j('/api/companies');
  const out = document.getElementById('companiesOut');
  if (!r.ok || r.data.companies.length === 0) {
    out.innerHTML = '<p class="note">No company has 3 approved reports yet, so no company is named here. '
      + 'Companies with fewer than 3 reports are not listed at all — that rule protects anonymity.</p>';
    return;
  }
  out.innerHTML = '<div class="table-wrap"><table><thead><tr><th>Company</th><th>Reports</th><th>Median base / month</th></tr></thead><tbody>'
    + r.data.companies.map((c) => '<tr><td>' + esc(c.company) + '</td><td>' + c.count + '</td><td>' + pkr(c.median_base) + '</td></tr>').join('')
    + '</tbody></table></div>';
}

async function loadReference() {
  const r = await j('/api/reference');
  const out = document.getElementById('referenceOut');
  if (!r.ok) { out.innerHTML = '<p class="note">Could not load reference figures.</p>'; return; }
  out.innerHTML = '<div class="table-wrap"><table><thead><tr><th>Figure</th><th>Value</th><th>Source</th><th>Date</th><th>Sample</th><th>What it counts</th></tr></thead><tbody>'
    + r.data.rows.map((x) => '<tr><td>' + esc(x.label) + (x.note ? '<br><span class="small">' + esc(x.note) + '</span>' : '')
      + '</td><td>' + esc(x.value_text) + '</td><td>' + esc(x.source) + '</td><td>' + esc(x.date_label) + '</td><td>'
      + esc(x.sample_size || '—') + '</td><td>' + esc(x.counts_what) + '</td></tr>').join('')
    + '</tbody></table></div>';
}

init();
