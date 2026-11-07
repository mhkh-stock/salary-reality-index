async function j(url, opts) {
  const r = await fetch(url, opts);
  const t = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: t };
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function pkr(n) { return 'PKR ' + Math.round(n).toLocaleString('en-PK'); }

async function load() {
  const code = document.getElementById('code').value;
  const status = document.getElementById('status').value;
  const msg = document.getElementById('msg');
  const list = document.getElementById('list');
  const r = await j('/api/admin/reports?code=' + encodeURIComponent(code) + '&status=' + status);
  if (!r.ok) { msg.textContent = '❌ ' + (r.data.error || 'Could not load.'); list.innerHTML = ''; return; }
  msg.textContent = r.data.rows.length + ' report(s).';
  if (r.data.rows.length === 0) { list.innerHTML = '<p class="note">Queue is empty for this filter.</p>'; return; }
  list.innerHTML = '<div class="table-wrap"><table><thead><tr><th>Role / City / Exp</th><th>Base / Bonus</th><th>Work / Company</th><th>Status</th><th>Actions</th></tr></thead><tbody>'
    + r.data.rows.map((x) => '<tr><td>' + esc(x.role) + '<br>' + esc(x.city) + ' · ' + esc(x.exp_band)
      + (x.is_example ? ' <span class="badge example">EXAMPLE</span>' : '') + '</td><td>' + pkr(x.base_monthly_pkr)
      + '<br>bonus ' + pkr(x.bonus_yearly_pkr) + '/yr</td><td>' + esc(x.work_type) + '<br>' + esc(x.company || '—') + '</td><td>'
      + '<span class="badge ' + esc(x.status) + '">' + esc(x.status) + '</span></td><td>'
      + (x.status === 'pending' ? '<button data-act="approve" data-id="' + x.id + '">Approve</button> <button class="danger" data-act="reject" data-id="' + x.id + '">Reject</button>'
        : x.status === 'approved' ? '<button class="ghost" data-act="hide" data-id="' + x.id + '">Hide</button>'
        : '<button data-act="approve" data-id="' + x.id + '">Restore</button>')
      + '</td></tr>').join('') + '</tbody></table></div>';
  list.querySelectorAll('button[data-act]').forEach((b) => b.addEventListener('click', async () => {
    const code2 = document.getElementById('code').value;
    const rr = await j('/api/admin/' + b.dataset.act, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code2, id: Number(b.dataset.id) }) });
    msg.textContent = rr.ok ? '✅ Done.' : '❌ ' + (rr.data.error || 'Failed.');
    if (rr.ok) load();
  }));
}
document.getElementById('load').addEventListener('click', load);
