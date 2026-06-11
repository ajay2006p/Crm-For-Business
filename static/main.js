/* ── State ────────────────────────────────────────────────────────────────── */
let currentData    = [];
let currentJobId   = null;
let pollInterval   = null;
let evtSource      = null;
let currentMode    = 'quick';
let currentScope   = 'city';
let currentFilePath = null;
let currentPage    = 1;
const PAGE_SIZE    = 50;
let sortCol = '', sortAsc = true;
let totalFound = 0, totalTarget = 0;
let areasCount = 0;

/* ── Init ─────────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  loadCities();
  loadCountries();
  updateDashboardFiles();
  initOutreach();
  bindLeadFilters();
  refreshDashboardStats();
});

async function loadCities() {
  try {
    const r = await fetch('/api/cities');
    const cities = await r.json();
    const dl = document.getElementById('city-list');
    cities.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.charAt(0).toUpperCase() + c.slice(1);
      dl.appendChild(opt);
    });
  } catch(e) {}
}

async function loadCountries() {
  try {
    const r = await fetch('/api/countries');
    const countries = await r.json();
    const dl = document.getElementById('country-list');
    countries.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.name;
      dl.appendChild(opt);
    });
  } catch(e) {}
}

function setScope(scope) {
  currentScope = scope;
  document.getElementById('scope-city').classList.toggle('active', scope === 'city');
  document.getElementById('scope-country').classList.toggle('active', scope === 'country');
  const input = document.getElementById('q-city');
  const label = document.getElementById('location-label');
  const hint  = document.getElementById('scope-hint');
  if (scope === 'city') {
    label.innerHTML = '<i class="fa-solid fa-city"></i> City';
    input.placeholder = 'Jaipur, Delhi, Mumbai…';
    input.setAttribute('list', 'city-list');
    input.value = input.value || 'Jaipur';
    hint.textContent = 'Searches only inside the selected city, then expands to every sector/colony in that city.';
  } else {
    label.innerHTML = '<i class="fa-solid fa-globe"></i> Country';
    input.placeholder = 'India, USA, UK…';
    input.setAttribute('list', 'country-list');
    input.value = input.value === 'Jaipur' ? 'India' : input.value;
    hint.textContent = 'Searches each city in the country, then every sector inside each city.';
  }
}

async function updateDashboardFiles() {
  try {
    const r = await fetch('/api/files?folder=output');
    const result = await r.json();
    document.getElementById('stat-files').innerText = result.files ? result.files.length : 0;
  } catch(e) {}
}

/* ── Tab Nav ──────────────────────────────────────────────────────────────── */
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    item.classList.add('active');
    const tabId = item.getAttribute('data-tab');
    document.getElementById('tab-' + tabId).classList.add('active');
    document.getElementById('current-tab-title').innerText = item.innerText.trim();
    if (tabId === 'files') loadFiles();
    if (tabId === 'dashboard') refreshDashboardStats();
    if (tabId === 'outreach') loadTemplates();
  });
});

function goToScrape() {
  document.querySelector('.nav-item[data-tab="new-job"]').click();
}

/* ── Mode toggle ──────────────────────────────────────────────────────────── */
function setMode(mode) {
  currentMode = mode;
  document.getElementById('mode-quick').classList.toggle('active', mode === 'quick');
  document.getElementById('mode-adv').classList.toggle('active', mode === 'advanced');
  document.getElementById('quick-form').style.display = mode === 'quick' ? '' : 'none';
  document.getElementById('adv-form').style.display   = mode === 'advanced' ? '' : 'none';
}

/* ── Toast ────────────────────────────────────────────────────────────────── */
function toast(msg, type = 'info') {
  const icons = { success: 'fa-check-circle', error: 'fa-circle-xmark', info: 'fa-circle-info' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="fa-solid ${icons[type]}"></i> ${msg}`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

/* ── Terminal ─────────────────────────────────────────────────────────────── */
function clearTerminal() {
  document.getElementById('progress-terminal').innerHTML = '<span class="t-muted">Cleared.</span>';
}

function appendLog(text) {
  const term = document.getElementById('progress-terminal');
  if (term.querySelector('.t-muted')) term.innerHTML = '';

  const span = document.createElement('span');
  span.style.display = 'block';

  const t = text.trim();
  if (t.startsWith('[') && t.includes('Searching'))              span.className = 't-search';
  else if (t.startsWith('→ +') || t.includes('Saved.'))          span.className = 't-save';
  else if (t.includes('All queries') || t.startsWith('✔'))        span.className = 't-ok';
  else if (t.toLowerCase().includes('error') || t.toLowerCase().includes('fatal')) span.className = 't-error';
  else if (t.includes('Extracting'))                              span.className = 't-extract';
  else if (t.startsWith('[Query') || t.startsWith('==='))         span.className = 't-hdr';
  else                                                            span.className = 't-info';

  span.textContent = text;
  term.appendChild(span);
  term.scrollTop = term.scrollHeight;

  // Count new area searches for the stat card
  const mArea = t.match(/Searching:\s*['"](.+?)['"]/);
  if (mArea) {
    areasCount++;
    document.getElementById('stat-areas').innerText = areasCount;
  }
}

function updateProgress(found, target) {
  totalFound = found; totalTarget = target;
  const pct = target > 0 ? Math.min(100, Math.round((found/target)*100)) : 0;
  document.getElementById('prog-found').innerText  = found;
  document.getElementById('prog-target').innerText = target;
  document.getElementById('prog-bar').style.width  = pct + '%';
  document.getElementById('prog-pct').innerText    = pct + '%';
  document.getElementById('stat-leads').innerText  = found;
  // topbar mini
  document.getElementById('topbar-progress').style.display = '';
  document.getElementById('topbar-found').innerText  = found;
  document.getElementById('topbar-target').innerText = target;
  document.getElementById('mini-bar-fill').style.width = pct + '%';
}

/* ── Start Scraping ───────────────────────────────────────────────────────── */
document.getElementById('btn-start').addEventListener('click', async () => {
  let searches, total, output_folder, no_website_only;

  if (currentMode === 'quick') {
    const q    = document.getElementById('q-query').value.trim();
    const city = document.getElementById('q-city').value.trim();
    total      = parseInt(document.getElementById('q-total').value) || 100;
    output_folder  = document.getElementById('q-folder').value.trim() || 'output';
    no_website_only = document.getElementById('q-no-website').checked;

    if (!q || !city) {
      toast(currentScope === 'country'
        ? 'Please fill in Business Type and Country.'
        : 'Please fill in Business Type and City.', 'error');
      return;
    }
    searches = `${q} in ${city}`;
  } else {
    searches    = document.getElementById('searches').value.trim();
    total       = parseInt(document.getElementById('adv-total').value) || 100;
    output_folder   = document.getElementById('adv-folder').value.trim() || 'output';
    no_website_only = document.getElementById('adv-no-website').checked;
    if (!searches) { toast('Enter at least one search query.', 'error'); return; }
  }

  // Reset
  areasCount = 0; totalFound = 0;
  document.getElementById('stat-areas').innerText = 0;
  document.getElementById('prog-area').innerText  = '—';
  document.getElementById('prog-status').innerText = 'Running';
  document.getElementById('progress-section').style.display = '';
  updateProgress(0, total);

  btnStart.style.display  = 'none';
  btnPause.style.display  = 'inline-flex';
  btnStop.style.display   = 'inline-flex';
  setSidebarStatus('running', 'Running…');

  try {
    const res = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        searches, total, output_folder, no_website_only,
        location_scope: currentMode === 'quick' ? currentScope : 'city'
      })
    });
    const result = await res.json();
    if (result.status === 'success') {
      currentJobId = result.job_id;
      startSSE(currentJobId);
      startPolling();
      toast('Scrape job started!', 'info');
    } else {
      appendLog('Error: ' + result.message);
      resetControls();
    }
  } catch(err) {
    appendLog('Error: ' + err.message);
    resetControls();
  }
});

const btnStart  = document.getElementById('btn-start');
const btnPause  = document.getElementById('btn-pause');
const btnResume = document.getElementById('btn-resume');
const btnStop   = document.getElementById('btn-stop');

btnPause.addEventListener('click',  () => sendControl('pause'));
btnResume.addEventListener('click', () => sendControl('resume'));
btnStop.addEventListener('click',   () => sendControl('stop'));

async function sendControl(action) {
  if (!currentJobId) return;
  await fetch('/api/control', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ job_id: currentJobId, action })
  });
  if (action === 'pause') {
    btnPause.style.display  = 'none';
    btnResume.style.display = 'inline-flex';
    setSidebarStatus('paused', 'Paused');
    document.getElementById('prog-status').innerText = 'Paused';
    appendLog('[System] Job Paused.');
  } else if (action === 'resume') {
    btnResume.style.display = 'none';
    btnPause.style.display  = 'inline-flex';
    setSidebarStatus('running', 'Running…');
    document.getElementById('prog-status').innerText = 'Running';
    appendLog('[System] Job Resumed.');
  } else if (action === 'stop') {
    if (evtSource) { evtSource.close(); evtSource = null; }
    appendLog('[System] Stopping…');
    setSidebarStatus('idle', 'Idle');
  }
}

/* ── SSE ──────────────────────────────────────────────────────────────────── */
function startSSE(jobId) {
  if (evtSource) { evtSource.close(); evtSource = null; }
  const term = document.getElementById('progress-terminal');
  term.innerHTML = '<span class="t-info">Connecting to live log…</span>';

  evtSource = new EventSource(`/api/stream/${jobId}`);

  evtSource.onopen = () => {
    term.innerHTML = '';
  };

  evtSource.onmessage = e => {
    const msg = e.data;
    if (msg.startsWith('__DONE__')) {
      evtSource.close(); evtSource = null;
      const st = msg.replace('__DONE__', '');
      if (st === 'completed') {
        appendLog('✔ All done — scrape completed!');
        toast('Scrape completed!', 'success');
      } else if (st === 'stopped') {
        appendLog('[System] Job stopped.');
      } else if (st === 'error') {
        appendLog('[System] Job ended with error — check log above.');
      }
      return;
    }
    appendLog(msg);
  };

  evtSource.onerror = () => {
    // SSE failed — polling still keeps progress stats updated
    if (evtSource) { evtSource.close(); evtSource = null; }
    const t2 = document.getElementById('progress-terminal');
    if (!t2.children.length || t2.querySelector('.t-info')) {
      t2.innerHTML = '<span class="t-error">Live log unavailable (SSE error). Progress bar still works via polling.</span>';
    }
  };
}

/* ── Polling (primary driver for progress stats + data) ──────────────────── */
function startPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(async () => {
    if (!currentJobId) return;
    try {
      const res   = await fetch(`/api/status/${currentJobId}`);
      const state = await res.json();

      document.getElementById('stat-job').innerText = state.status.toUpperCase();

      // Always update progress from structured server state (works even if SSE fails)
      if (state.target > 0) {
        updateProgress(state.found || 0, state.target);
      }

      if (state.current_area) {
        const a = state.current_area;
        document.getElementById('prog-area').innerText = a.length > 22 ? a.slice(0, 22) + '…' : a;
      }

      if (state.data && state.data.length > 0) {
        currentData = state.data;
        applyFilters();
      }

      if (['completed', 'stopped', 'error'].includes(state.status)) {
        clearInterval(pollInterval);
        resetControls();
        updateDashboardFiles();
        refreshDashboardStats();
        if (state.status === 'completed') {
          document.getElementById('prog-status').innerText = 'Done ✓';
          setSidebarStatus('done', 'Done');
        } else if (state.status === 'stopped') {
          document.getElementById('prog-status').innerText = 'Stopped';
        } else if (state.status === 'error') {
          document.getElementById('prog-status').innerText = 'Error';
        }
      }
    } catch(e) { /* network blip — keep polling */ }
  }, 1500);
}

function resetControls() {
  btnStart.style.display  = 'inline-flex';
  btnPause.style.display  = 'none';
  btnResume.style.display = 'none';
  btnStop.style.display   = 'none';
  document.getElementById('stat-job').innerText = 'Idle';
  setSidebarStatus('idle', 'Idle');
}

function setSidebarStatus(cls, text) {
  const dot = document.querySelector('.job-indicator .dot');
  dot.className = 'dot ' + cls;
  document.getElementById('sidebar-status-text').innerText = text;
}

/* ── Filters ──────────────────────────────────────────────────────────────── */
function getFilteredLeads() {
  const q = (document.getElementById('filter-input')?.value || '').toLowerCase();
  const statusF = document.getElementById('filter-status')?.value || '';
  const phoneF = document.getElementById('filter-phone')?.value || '';
  const webF = document.getElementById('filter-website')?.value || '';
  const minRating = parseFloat(document.getElementById('filter-min-rating')?.value) || 0;

  return currentData
    .map((row, idx) => ({ ...row, _idx: idx }))
    .filter(row => {
      if (q && !Object.values(row).some(v => String(v).toLowerCase().includes(q))) return false;
      if (statusF && (row.status || 'New') !== statusF) return false;
      if (phoneF === 'yes' && !row.phone_number) return false;
      if (phoneF === 'no' && row.phone_number) return false;
      if (webF === 'yes' && !row.website) return false;
      if (webF === 'no' && row.website) return false;
      if (minRating > 0 && (parseFloat(row.reviews_average) || 0) < minRating) return false;
      return true;
    });
}

function bindLeadFilters() {
  ['filter-input', 'filter-status', 'filter-phone', 'filter-website', 'filter-min-rating']
    .forEach(id => document.getElementById(id)?.addEventListener('input', applyFilters));
  document.getElementById('btn-clear-filters')?.addEventListener('click', () => {
    ['filter-input', 'filter-min-rating'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    ['filter-status', 'filter-phone', 'filter-website'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    applyFilters();
  });
}

function applyFilters() {
  currentPage = 1;
  const filtered = getFilteredLeads();
  renderTable(filtered);
  const summary = document.getElementById('filter-summary');
  if (summary) {
    summary.innerText = filtered.length === currentData.length
      ? `Showing all ${currentData.length} leads`
      : `Showing ${filtered.length} of ${currentData.length} leads`;
  }
  refreshDashboardStats();
}

async function refreshDashboardStats() {
  try {
    const r = await fetch('/api/dashboard/stats', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leads: currentData }),
    });
    const d = await r.json();
    if (d.status !== 'success') return;
    document.getElementById('stat-leads').innerText = d.loaded;
    document.getElementById('stat-phone').innerText = d.with_phone;
    document.getElementById('stat-rating').innerText = d.avg_rating || '—';
    document.getElementById('stat-all-leads').innerText = d.folder?.total_leads ?? '—';
    renderStatusChart(d.statuses || {});
  } catch (e) {}
}

function renderStatusChart(statuses) {
  const el = document.getElementById('status-chart');
  if (!el) return;
  const total = Object.values(statuses).reduce((a, b) => a + b, 0);
  if (!total) {
    el.innerHTML = '<div class="empty-state" style="padding:1rem">Load leads to see breakdown</div>';
    return;
  }
  const colors = { New: 'var(--blue)', Contacted: 'var(--warning)', Interviewing: 'var(--purple)', Hired: 'var(--success)', Rejected: 'var(--danger)' };
  el.innerHTML = Object.entries(statuses).map(([st, cnt]) => {
    const pct = Math.round((cnt / total) * 100);
    return `<div class="status-bar-row">
      <span class="sbr-label">${st}</span>
      <div class="sbr-track"><div class="sbr-fill" style="width:${pct}%;background:${colors[st] || 'var(--accent)'}"></div></div>
      <span class="sbr-count">${cnt}</span>
    </div>`;
  }).join('');
}

/* ── Table (with pagination) ──────────────────────────────────────────────── */
function renderTable(data) {
  const tbody  = document.getElementById('table-body');
  const total  = data.length;
  const pages  = Math.max(1, Math.ceil(total / PAGE_SIZE));
  currentPage  = Math.min(currentPage, pages);
  const start  = (currentPage - 1) * PAGE_SIZE;
  const slice  = data.slice(start, start + PAGE_SIZE);

  tbody.innerHTML = '';
  if (total === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No leads yet. Start a scrape or open a file.</td></tr>';
    renderPagination(0, 0, data);
    document.getElementById('table-count').innerText = '0 leads';
    return;
  }

  slice.forEach((row, i) => {
    const idx = row._idx !== undefined ? row._idx : (start + i);
    const stClass = 'status-' + (row.status || 'new').toLowerCase().replace(/\s+/g,'-');
    const stars = row.reviews_average
      ? `${row.reviews_average} <i class="fa-solid fa-star star"></i>`
      : '—';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="checkbox" data-idx="${idx}"/></td>
      <td>
        <strong>${esc(row.name||'')}</strong>
        <br/><small style="color:var(--text-muted)">${esc(row.address||'')}</small>
      </td>
      <td>${esc(row.phone_number||'')}</td>
      <td>${stars}</td>
      <td><small>${row.reviews_count || '—'}</small></td>
      <td><span class="status-badge ${stClass}">${row.status||'New'}</span></td>
      <td><small style="color:var(--text-muted)">${esc(row.notes||'')}</small></td>
      <td>
        ${row.phone_number ? `<a class="action-btn" href="tel:${row.phone_number}" title="Call"><i class="fa-solid fa-phone"></i></a>` : ''}
        ${row.website ? `<a class="action-btn" href="${row.website.startsWith('http') ? row.website : 'https://'+row.website}" target="_blank" title="Website"><i class="fa-solid fa-globe"></i></a>` : ''}
        <button class="action-btn edit-btn" data-index="${idx}" title="Edit"><i class="fa-solid fa-pen"></i></button>
        <button class="action-btn delete delete-btn" data-index="${idx}" title="Delete"><i class="fa-solid fa-trash"></i></button>
      </td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.edit-btn').forEach(b =>
    b.addEventListener('click', e => openModal(e.currentTarget.dataset.index))
  );
  tbody.querySelectorAll('.delete-btn').forEach(b =>
    b.addEventListener('click', e => {
      if (confirm('Delete this lead?')) {
        currentData.splice(parseInt(e.currentTarget.dataset.index), 1);
        applyFilters();
      }
    })
  );

  renderPagination(pages, currentPage, data);
  document.getElementById('table-count').innerText =
    `${total} leads  (page ${currentPage}/${pages})`;
}

function renderPagination(pages, active, data) {
  const pg = document.getElementById('pagination');
  pg.innerHTML = '';
  if (pages <= 1) return;
  const viewData = data || getFilteredLeads();
  const add = (label, page, disabled) => {
    const b = document.createElement('button');
    b.className = 'page-btn' + (page === active ? ' active' : '');
    b.disabled  = disabled;
    b.innerHTML = label;
    b.addEventListener('click', () => { currentPage = page; renderTable(viewData); });
    pg.appendChild(b);
  };
  add('<i class="fa-solid fa-chevron-left"></i>', active - 1, active === 1);
  const range = 5;
  const start = Math.max(1, active - Math.floor(range/2));
  const end   = Math.min(pages, start + range - 1);
  for (let p = start; p <= end; p++) add(p, p, false);
  add('<i class="fa-solid fa-chevron-right"></i>', active + 1, active === pages);
}

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ── Sorting ──────────────────────────────────────────────────────────────── */
document.querySelectorAll('.sortable').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.col;
    sortAsc = sortCol === col ? !sortAsc : true;
    sortCol = col;
    currentData.sort((a, b) => {
      let va = a[col] ?? '', vb = b[col] ?? '';
      if (!isNaN(va) && va !== '') va = Number(va);
      if (!isNaN(vb) && vb !== '') vb = Number(vb);
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    currentPage = 1;
    applyFilters();
  });
});

/* ── Select All ───────────────────────────────────────────────────────────── */
document.getElementById('select-all').addEventListener('change', e => {
  document.querySelectorAll('#table-body input[type=checkbox]').forEach(cb => cb.checked = e.target.checked);
});

/* ── Export CSV ───────────────────────────────────────────────────────────── */
function exportCSV() {
  if (!currentData.length) { toast('No data to export!', 'error'); return; }
  const fields = ['name','address','phone_number','website','reviews_average','reviews_count','latitude','longitude','status','notes'];
  const rows   = [fields.join(',')];
  currentData.forEach(r => {
    rows.push(fields.map(f => `"${String(r[f]||'').replace(/"/g,'""')}"`).join(','));
  });
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'leads_export.csv';
  a.click();
  toast('CSV exported!', 'success');
}

/* ── Export Excel ─────────────────────────────────────────────────────────── */
document.getElementById('export-excel').addEventListener('click', () => {
  if (!currentData.length) { toast('No data to export!', 'error'); return; }
  const ws = XLSX.utils.json_to_sheet(currentData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Leads');
  XLSX.writeFile(wb, 'leads_export.xlsx');
  toast('Excel exported!', 'success');
});

/* ── Import ───────────────────────────────────────────────────────────────── */
document.getElementById('import-excel').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  const fd = new FormData(); fd.append('file', file);
  try {
    const res    = await fetch('/api/import', { method: 'POST', body: fd });
    const result = await res.json();
    if (result.status === 'success') {
      currentData     = result.data;
      currentFilePath = null;
      currentPage     = 1;
      applyFilters();
      toast(`Imported ${currentData.length} leads.`, 'success');
    }
  } catch(err) { toast('Import error: ' + err.message, 'error'); }
});

/* ── Modal ────────────────────────────────────────────────────────────────── */
function openModal(index) {
  const modal = document.getElementById('crud-modal');
  modal.style.display = 'flex';
  const idx = index !== null && index !== undefined ? parseInt(index) : null;
  if (idx !== null && currentData[idx]) {
    document.getElementById('modal-title').innerText = 'Edit Lead';
    document.getElementById('modal-index').value    = idx;
    const r = currentData[idx];
    document.getElementById('modal-name').value    = r.name         || '';
    document.getElementById('modal-phone').value   = r.phone_number || '';
    document.getElementById('modal-address').value = r.address      || '';
    document.getElementById('modal-website').value = r.website      || '';
    document.getElementById('modal-status').value  = r.status       || 'New';
    document.getElementById('modal-notes').value   = r.notes        || '';
  } else {
    document.getElementById('modal-title').innerText = 'Add New Lead';
    document.getElementById('modal-index').value     = '';
    ['modal-name','modal-phone','modal-address','modal-website','modal-notes'].forEach(id =>
      document.getElementById(id).value = '');
    document.getElementById('modal-status').value = 'New';
  }
}

function closeModal() { document.getElementById('crud-modal').style.display = 'none'; }

document.getElementById('btn-save-lead').addEventListener('click', () => {
  const idx = document.getElementById('modal-index').value;
  const row = {
    name:           document.getElementById('modal-name').value,
    phone_number:   document.getElementById('modal-phone').value,
    address:        document.getElementById('modal-address').value,
    website:        document.getElementById('modal-website').value,
    status:         document.getElementById('modal-status').value,
    notes:          document.getElementById('modal-notes').value,
    reviews_average: '',
    reviews_count:  ''
  };
  if (idx !== '') {
    currentData[parseInt(idx)] = { ...currentData[parseInt(idx)], ...row };
  } else {
    currentData.unshift(row);
  }
  closeModal();
  currentPage = 1;
  applyFilters();
  toast('Lead saved.', 'success');
});

/* ── Save Changes ─────────────────────────────────────────────────────────── */
document.getElementById('btn-save-changes').addEventListener('click', async () => {
  if (!currentFilePath)
    currentFilePath = prompt('Save as (e.g. output/my_leads.json):', 'output/saved_leads.json');
  if (!currentFilePath) return;
  try {
    const res = await fetch('/api/save_file', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ filepath: currentFilePath, data: currentData })
    });
    const r = await res.json();
    r.status === 'success' ? toast('Saved to ' + currentFilePath, 'success') : toast('Save error: ' + r.message, 'error');
  } catch(e) { toast('Network error.', 'error'); }
});

/* ── File Manager ─────────────────────────────────────────────────────────── */
document.getElementById('btn-refresh-files').addEventListener('click', loadFiles);

async function loadFiles() {
  const tree   = document.getElementById('file-tree');
  const folder = document.getElementById('q-folder')?.value || 'output';
  tree.innerHTML = '<div class="empty-state">Loading…</div>';
  try {
    const res    = await fetch(`/api/files?folder=${encodeURIComponent(folder)}`);
    const result = await res.json();
    if (!result.files?.length) { tree.innerHTML = '<div class="empty-state">No files found.</div>'; return; }
    tree.innerHTML = '';
    result.files.forEach(f => {
      const div = document.createElement('div');
      div.className = 'file-card';
      div.innerHTML = `
        <div class="file-icon"><i class="fa-solid fa-file-code"></i></div>
        <div class="file-name">${f.name}</div>
        <div class="file-size">${(f.size/1024).toFixed(1)} KB</div>
        <div class="file-actions">
          <button class="btn-icon open-btn" title="Open"><i class="fa-solid fa-folder-open"></i></button>
          <button class="btn-icon rename-btn" title="Rename"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-icon delete-btn" title="Delete" style="color:var(--danger)"><i class="fa-solid fa-trash"></i></button>
        </div>`;

      div.querySelector('.open-btn').addEventListener('click', async e => {
        e.stopPropagation();
        const r = await fetch(`/api/read_file?filepath=${encodeURIComponent(f.path)}`);
        const d = await r.json();
        if (d.status === 'success') {
          currentData = d.data; currentFilePath = f.path; currentPage = 1;
          applyFilters();
          document.querySelector('.nav-item[data-tab="leads"]').click();
          toast(`Opened ${f.name} (${d.data.length} leads)`, 'success');
        }
      });

      div.querySelector('.rename-btn').addEventListener('click', async e => {
        e.stopPropagation();
        const nm = prompt('New name:', f.name);
        if (!nm || nm === f.name) return;
        const r = await fetch('/api/rename_file', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ old_path: f.path, new_name: nm })
        });
        const d = await r.json();
        d.status === 'success' ? (loadFiles(), toast('Renamed.','success')) : toast('Rename failed.','error');
      });

      div.querySelector('.delete-btn').addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm(`Delete ${f.name}?`)) return;
        try {
          // No delete API yet — inform user
          toast('Delete not available — remove manually from output/ folder.', 'info');
        } catch(err) {}
      });

      tree.appendChild(div);
    });
    document.getElementById('stat-files').innerText = result.files.length;
  } catch(e) {
    tree.innerHTML = `<div class="empty-state">Error: ${e.message}</div>`;
  }
}
