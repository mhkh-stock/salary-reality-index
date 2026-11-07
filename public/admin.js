async function j(url, opts) {
  const r = await fetch(url, opts);
  const t = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: t };
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function pkr(n) { return 'PKR ' + Math.round(n).toLocaleString('en-PK'); }

let page = 1;
const PER_PAGE = 20;

async function load() {
  const code = document.getElementById('code').value;
  const status = document.getElementById('status').value;
  const msg = document.getElementById('msg');
  const list = document.getElementById('list');
  const r = await j('/api/admin/reports?status=' + status + '&page=' + page + '&per_page=' + PER_PAGE,
    { headers: { Authorization: 'Bearer ' + code } });
  if (!r.ok) { msg.textContent = '❌ ' + (r.data.error || 'Could not load.'); list.innerHTML = ''; return; }
  msg.textContent = r.data.total + ' report(s) — page ' + r.data.page + ' of ' + r.data.total_pages + '.';
  if (r.data.rows.length === 0) { list.innerHTML = '<p class="note">Queue is empty for this filter.</p>'; return; }
  list.innerHTML = '<div class="table-wrap"><table><thead><tr><th>Role / City / Exp</th><th>Base / Bonus</th><th>Work / Company</th><th>Status</th><th>Actions</th></tr></thead><tbody>'
    + r.data.rows.map((x) => '<tr><td>' + esc(x.role) + '<br>' + esc(x.city) + ' · ' + esc(x.exp_band)
      + (x.is_example ? ' <span class="badge example">EXAMPLE</span>' : '') + '</td><td>' + pkr(x.base_monthly_pkr)
      + '<br>bonus ' + pkr(x.bonus_yearly_pkr) + '/yr</td><td>' + esc(x.work_type) + '<br>' + esc(x.company || '—') + '</td><td>'
      + '<span class="badge ' + esc(x.status) + '">' + esc(x.status) + '</span></td><td>'
      + (x.status === 'pending' ? '<button data-act="approve" data-id="' + x.id + '">Approve</button> <button class="danger" data-act="reject" data-id="' + x.id + '">Reject</button>'
        : x.status === 'approved' ? '<button class="ghost" data-act="hide" data-id="' + x.id + '">Hide</button>'
        : '<button data-act="approve" data-id="' + x.id + '">Restore</button>')
      + '</td></tr>').join('') + '</tbody></table></div>'
    + (r.data.total_pages > 1
      ? '<p class="note"><button id="prevPage" ' + (r.data.page <= 1 ? 'disabled' : '') + '>← Prev</button> '
        + 'Page ' + r.data.page + ' of ' + r.data.total_pages + ' '
        + '<button id="nextPage" ' + (r.data.page >= r.data.total_pages ? 'disabled' : '') + '>Next →</button></p>'
      : '');
  list.querySelectorAll('button[data-act]').forEach((b) => b.addEventListener('click', async () => {
    const code2 = document.getElementById('code').value;
    const rr = await j('/api/admin/' + b.dataset.act, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code2, id: Number(b.dataset.id) }) });
    msg.textContent = rr.ok ? '✅ Done.' : '❌ ' + (rr.data.error || 'Failed.');
    if (rr.ok) load();
  }));
  const prev = document.getElementById('prevPage');
  if (prev) prev.addEventListener('click', () => { if (page > 1) { page--; load(); } });
  const next = document.getElementById('nextPage');
  if (next) next.addEventListener('click', () => { page++; load(); });
}
document.getElementById('load').addEventListener('click', () => { page = 1; load(); });
