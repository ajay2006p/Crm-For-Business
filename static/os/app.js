/* RecruitKr Business OS — SPA Application Logic */

const API_BASE = '';
const TOKEN_KEY = 'rk_jwt';
const USER_KEY = 'rk_user';

let currentUser = null;
let leadsPage = 1;
let selectedLeads = new Map(); // id -> {name, phone}
let leadsCache = [];
let scrapeJobId = null;
let scrapePollTimer = null;
let scrapeSaveFolder = '';   // folder id chosen on the scrape form
let charts = {};
let templatesCache = {};
let foldersCache = [];
let appSettings = {};          // cached business/integration settings
let currentFolder = '';        // '' = all, 'unfiled', or a folder id
let currentDetailLead = null;  // lead object open in detail modal
let searchDebounce = null;

/* ── Local fallback for Area API ─────────────────────────────────────────── */
const LOCAL_CITY_META = {
  jaipur: { display: 'Jaipur', state: 'Rajasthan', country: 'India', lat: 26.9124, lng: 75.7873 },
  delhi: { display: 'Delhi', state: 'Delhi', country: 'India', lat: 28.6139, lng: 77.2090 },
  mumbai: { display: 'Mumbai', state: 'Maharashtra', country: 'India', lat: 19.0760, lng: 72.8777 },
  bangalore: { display: 'Bangalore', state: 'Karnataka', country: 'India', lat: 12.9716, lng: 77.5946 },
  bengaluru: { display: 'Bengaluru', state: 'Karnataka', country: 'India', lat: 12.9716, lng: 77.5946 },
  hyderabad: { display: 'Hyderabad', state: 'Telangana', country: 'India', lat: 17.3850, lng: 78.4867 },
  chennai: { display: 'Chennai', state: 'Tamil Nadu', country: 'India', lat: 13.0827, lng: 80.2707 },
  pune: { display: 'Pune', state: 'Maharashtra', country: 'India', lat: 18.5204, lng: 73.8567 },
  kolkata: { display: 'Kolkata', state: 'West Bengal', country: 'India', lat: 22.5726, lng: 88.3639 },
  ahmedabad: { display: 'Ahmedabad', state: 'Gujarat', country: 'India', lat: 23.0225, lng: 72.5714 },
};

const LOCAL_AREAS = {
  jaipur: ['Malviya Nagar', 'Vaishali Nagar', 'Mansarovar', 'C-Scheme', 'Raja Park', 'Tonk Road', 'Ajmer Road', 'Sanganer', 'Jagatpura'],
  delhi: ['Connaught Place', 'Lajpat Nagar', 'Saket', 'Dwarka', 'Rohini', 'Karol Bagh', 'Hauz Khas', 'Nehru Place'],
  mumbai: ['Andheri West', 'Bandra West', 'Borivali', 'Dadar', 'Powai', 'Thane', 'Worli', 'Malad'],
  bangalore: ['Koramangala', 'Indiranagar', 'Whitefield', 'Electronic City', 'Jayanagar', 'HSR Layout', 'Marathahalli'],
  bengaluru: ['Koramangala', 'Indiranagar', 'Whitefield', 'Electronic City', 'Jayanagar', 'HSR Layout'],
  hyderabad: ['Banjara Hills', 'Jubilee Hills', 'Gachibowli', 'Hitech City', 'Secunderabad', 'Madhapur'],
  chennai: ['T Nagar', 'Adyar', 'Anna Nagar', 'Velachery', 'OMR', 'Porur'],
  pune: ['Koregaon Park', 'Hinjewadi', 'Kothrud', 'Baner', 'Wakad', 'Hadapsar'],
};

const LOCAL_COUNTRIES = { india: 'India', usa: 'USA', uk: 'UK', uae: 'UAE', australia: 'Australia', canada: 'Canada' };

const TAB_TITLES = {
  dashboard: ['Dashboard', 'Overview & activity'],
  leads: ['Leads', 'CRM & scraping'],
  'area-api': ['Area API', 'City search & area lookup'],
  outreach: ['Outreach', 'Templates & campaigns'],
  meetings: ['Meetings', 'Schedule & track'],
  tasks: ['Tasks', 'Team task management'],
  employees: ['Employees', 'HR directory'],
  attendance: ['Attendance', 'Upload & view records'],
  leave: ['Leave', 'Leave requests'],
  payroll: ['Payroll', 'Salary processing'],
  holidays: ['Holidays', 'Company calendar'],
  invoices: ['Invoices', 'Billing & GST'],
  quotations: ['Quotations', 'Estimates & proposals'],
  expenses: ['Expenses', 'Spend tracking'],
  documents: ['Documents', 'File management'],
  'qr-generator': ['QR Generator', 'PDF QR insertion'],
  analytics: ['Analytics', 'Business intelligence'],
  companies: ['Companies', 'CRM company directory'],
  users: ['Users', 'Account management'],
  settings: ['Settings', 'App configuration'],
};

/* ── Utilities ───────────────────────────────────────────────────────────── */
function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

function setAuth(token, user) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
  currentUser = user || null;
}

function esc(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

function fmtMoney(n) {
  const v = parseFloat(n) || 0;
  return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleString(); } catch { return String(d); }
}

function safeArr(val) {
  return Array.isArray(val) ? val : [];
}

// Build a readable location for a lead: prefer city/area, else derive from address.
function leadLocation(l) {
  const city = (l.city || '').trim();
  const area = (l.area || '').trim();
  if (city || area) return [area, city].filter(Boolean).join(', ');
  return (l.address || '').trim();
}

function safeObj(val) {
  return val && typeof val === 'object' && !Array.isArray(val) ? val : {};
}

function badgeClass(status) {
  const s = String(status || '').toLowerCase();
  if (['approved', 'completed', 'client', 'success'].includes(s)) return 'badge-success';
  if (['pending', 'new', 'scheduled', 'open'].includes(s)) return 'badge-new';
  if (['rejected', 'cancelled'].includes(s)) return 'badge-danger';
  return 'badge-warn';
}

/* ── Toast & Loading ─────────────────────────────────────────────────────── */
function notify(msg, type = 'info') {
  const icons = { success: 'fa-check-circle', error: 'fa-circle-xmark', info: 'fa-circle-info', warning: 'fa-triangle-exclamation' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span>${esc(msg)}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

let loadingCount = 0;
function setLoading(show, text) {
  const overlay = document.getElementById('loading-overlay');
  if (text) document.getElementById('loading-text').textContent = text;
  if (show) {
    loadingCount++;
    overlay.classList.remove('hidden');
  } else {
    loadingCount = Math.max(0, loadingCount - 1);
    if (loadingCount === 0) overlay.classList.add('hidden');
  }
}

/* ── Form Validation ─────────────────────────────────────────────────────── */
function validateForm(form) {
  if (!form) return false;
  const fields = form.querySelectorAll('[required]');
  for (const field of fields) {
    const val = (field.value || '').trim();
    const minLen = field.getAttribute('minlength');
    if (!val) {
      notify(`${field.labels?.[0]?.textContent || field.name || 'Field'} is required`, 'error');
      field.focus();
      return false;
    }
    if (minLen && val.length < parseInt(minLen, 10)) {
      notify(`${field.labels?.[0]?.textContent || field.name} must be at least ${minLen} characters`, 'error');
      field.focus();
      return false;
    }
    if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      notify('Please enter a valid email address', 'error');
      field.focus();
      return false;
    }
    if (field.pattern && !new RegExp(field.pattern).test(val)) {
      notify(`Invalid format for ${field.labels?.[0]?.textContent || field.name}`, 'error');
      field.focus();
      return false;
    }
  }
  return true;
}

function formToObject(form) {
  const data = {};
  new FormData(form).forEach((v, k) => { data[k] = v; });
  return data;
}

/* ── API Helper ────────────────────────────────────────────────────────────── */
async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token && !options.skipAuth) headers['Authorization'] = `Bearer ${token}`;

  let body = options.body;
  if (body && !(body instanceof FormData) && typeof body === 'object') {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers, body });
  } catch (err) {
    throw new Error('Network error — is the server running?');
  }

  if (res.status === 401 && !options.skipAuth) {
    logout();
    notify('Session expired. Please log in again.', 'warning');
    throw new Error('Unauthorized');
  }

  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    let json;
    try { json = await res.json(); } catch { json = {}; }
    if (!res.ok) {
      const detail = json.detail || json.message || res.statusText;
      throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    }
    return json || {};
  }

  if (!res.ok) throw new Error(res.statusText || 'Request failed');
  return res;
}

/* ── Auth ──────────────────────────────────────────────────────────────────── */
function showLogin() {
  document.getElementById('login-page')?.classList.remove('hidden');
  document.getElementById('main-app')?.classList.add('hidden');
}

function showApp() {
  document.getElementById('login-page')?.classList.add('hidden');
  document.getElementById('main-app')?.classList.remove('hidden');
  updateUserUI();
}

function updateUserUI() {
  const u = currentUser || {};
  document.getElementById('user-name').textContent = u.name || 'User';
  document.getElementById('user-email').textContent = u.email || '';
  document.getElementById('user-avatar').textContent = (u.name || 'U').charAt(0).toUpperCase();
}

async function login(email, password) {
  setLoading(true, 'Signing in…');
  try {
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: { email, password },
      skipAuth: true,
    });
    setAuth(res.access_token, res.user);
    currentUser = res.user;
    showApp();
    notify(`Welcome back, ${res.user?.name || 'User'}!`, 'success');
    navigateTab('dashboard');
    loadDashboard();
  } finally {
    setLoading(false);
  }
}

function logout() {
  notify('Login system is disabled', 'info');
}

/* ── Tab Navigation ────────────────────────────────────────────────────────── */
function navigateTab(tab) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${tab}`));
  const [title, sub] = TAB_TITLES[tab] || [tab, ''];
  document.getElementById('page-title').textContent = title;
  document.getElementById('page-subtitle').textContent = sub;

  const loaders = {
    dashboard: loadDashboard,
    leads: () => { loadFolders(); loadLeads(); },
    quotations: loadQuotations,
    expenses: loadExpenses,
    'area-api': checkAreaAPIStatus,
    outreach: () => { loadTemplates().then(renderCampaignRecipients); loadCampaigns(); },
    meetings: loadMeetings,
    tasks: loadTasks,
    employees: loadEmployees,
    attendance: loadAttendance,
    leave: loadLeave,
    payroll: loadPayroll,
    holidays: loadHolidays,
    invoices: loadInvoices,
    documents: loadDocuments,
    'qr-generator': loadQRHistory,
    analytics: loadAnalytics,
    companies: loadCompanies,
    users: loadUsers,
    settings: loadSettings,
  };
  if (loaders[tab]) loaders[tab]();
}

function initNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      navigateTab(item.dataset.tab);
    });
  });
}

/* ── Dashboard ─────────────────────────────────────────────────────────────── */
let dashChart = null;

async function loadDashboard() {
  const errBar = document.getElementById('dash-db-error');
  try {
    const res = await api('/api/dashboard/summary');
    if (res.status === 'error') {
      if (errBar) errBar.classList.remove('hidden');
    } else {
      if (errBar) errBar.classList.add('hidden');
    }
    const data = safeObj(res.data);
    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setText('stat-leads', data.total_leads ?? 0);
    setText('stat-new-week', data.new_this_week ?? 0);
    setText('stat-conversion', (data.conversion_rate ?? 0) + '%');
    setText('stat-clients', data.clients ?? 0);
    setText('stat-meetings', data.meetings ?? 0);
    setText('stat-tasks', data.open_tasks ?? 0);
    setText('stat-revenue', fmtMoney(data.revenue_total));
    setText('stat-expenses', fmtMoney(data.expense_total));
    setText('stat-net', fmtMoney(data.net_total));
    setText('stat-payroll', fmtMoney(data.payroll_total));

    renderFollowups(safeArr(data.due_followups));
    renderRecentLeads(safeArr(data.recent_leads));

    const activities = safeArr(data.activities);
    const actEl = document.getElementById('dash-activities');
    if (!activities.length) {
      actEl.innerHTML = '<p class="text-slate-500 text-sm py-4 text-center">No recent activity yet — start by adding leads or employees.</p>';
    } else {
      actEl.innerHTML = activities.map(a => `
        <div class="flex gap-2 items-start py-1.5 border-b border-white/5">
          <i class="fa-solid fa-circle-dot text-indigo-400 text-xs mt-1 flex-shrink-0"></i>
          <div class="min-w-0">
            <p class="text-slate-200 text-sm truncate">${esc(a.message || a.action || 'Activity')}</p>
            <p class="text-xs text-slate-500">${esc(a.module || '')} · ${fmtDate(a.created_at)}</p>
          </div>
        </div>`).join('');
    }

    await renderDashChart();
  } catch (err) {
    if (errBar) errBar.classList.remove('hidden');
    ['stat-leads','stat-new-week','stat-conversion','stat-clients','stat-meetings','stat-tasks','stat-revenue','stat-expenses','stat-net','stat-payroll'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '—';
    });
    notify('Dashboard load failed: ' + err.message, 'error');
  }
}

async function renderDashChart() {
  try {
    const res = await api('/api/analytics/overview');
    const leads = safeObj(res.leads);
    const labels = Object.keys(leads);
    const values = Object.values(leads);
    const ctx = document.getElementById('dash-chart-leads');
    if (dashChart) dashChart.destroy();
    if (!labels.length) {
      dashChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: ['No data'], datasets: [{ data: [1], backgroundColor: ['#e5e7eb'] }] },
        options: { plugins: { legend: { labels: { color: '#6b7280' } } } },
      });
      return;
    }
    dashChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: CHART_PALETTE }],
      },
      options: { plugins: { legend: { position: 'bottom', labels: { color: '#374151', padding: 12 } } } },
    });
  } catch { /* chart optional on dashboard */ }
}

const CHART_PALETTE = ['#111827', '#4b5563', '#9ca3af', '#059669', '#d97706', '#dc2626', '#2563eb', '#7c3aed'];

function renderFollowups(items) {
  const el = document.getElementById('dash-followups');
  const countEl = document.getElementById('dash-followup-count');
  if (countEl) countEl.textContent = items.length;
  if (!el) return;
  if (!items.length) {
    el.innerHTML = '<p class="text-slate-500 text-sm py-4 text-center">No follow-ups due. You\'re all caught up.</p>';
    return;
  }
  el.innerHTML = items.map(l => `
    <div class="flex items-center gap-2 py-1.5 border-b border-white/5 cursor-pointer hover:bg-slate-900/40 rounded px-1 dash-followup-row" data-id="${esc(l.id)}">
      <i class="fa-solid fa-circle-exclamation text-amber-500 text-xs"></i>
      <div class="min-w-0 flex-1">
        <p class="text-slate-200 text-sm truncate">${esc(l.name)}</p>
        <p class="text-xs text-slate-500">${esc(l.phone_number || '—')} · due ${esc(l.follow_up_date || '')}</p>
      </div>
      <span class="badge ${badgeClass(l.status)}">${esc(l.status || 'New')}</span>
    </div>`).join('');
  el.querySelectorAll('.dash-followup-row').forEach(row => {
    row.addEventListener('click', () => { navigateTab('leads'); setTimeout(() => openLeadDetail(row.dataset.id), 150); });
  });
}

function renderRecentLeads(items) {
  const tb = document.getElementById('dash-recent-leads');
  if (!tb) return;
  if (!items.length) {
    tb.innerHTML = '<tr><td colspan="5" class="text-slate-500 text-center py-5">No leads yet</td></tr>';
    return;
  }
  tb.innerHTML = items.map(l => `
    <tr class="cursor-pointer dash-recent-row" data-id="${esc(l.id)}">
      <td class="font-medium text-white">${esc(l.name)}</td>
      <td>${esc(l.phone_number || '—')}</td>
      <td class="text-slate-300">${esc(leadLocation(l) || '—')}</td>
      <td><span class="badge ${badgeClass(l.status)}">${esc(l.status || 'New')}</span></td>
      <td class="text-slate-400 text-xs">${fmtDate(l.created_at)}</td>
    </tr>`).join('');
  tb.querySelectorAll('.dash-recent-row').forEach(row => {
    row.addEventListener('click', () => { navigateTab('leads'); setTimeout(() => openLeadDetail(row.dataset.id), 150); });
  });
}

/* ── Leads ─────────────────────────────────────────────────────────────────── */
function leadFilterParams() {
  const params = new URLSearchParams();
  const q = document.getElementById('lead-filter-q')?.value?.trim();
  const status = document.getElementById('lead-filter-status')?.value;
  const city = document.getElementById('lead-filter-city')?.value?.trim();
  const phone = document.getElementById('lead-filter-phone')?.value;
  const website = document.getElementById('lead-filter-website')?.value;
  const rating = document.getElementById('lead-filter-rating')?.value;
  const followup = document.getElementById('lead-filter-followup')?.checked;
  if (q) params.set('q', q);
  if (status) params.set('status', status);
  if (city) params.set('city', city);
  if (phone) params.set('has_phone', phone);
  if (website) params.set('has_website', website);
  if (rating) params.set('min_rating', rating);
  if (followup) params.set('due_followup', 'true');
  if (currentFolder) params.set('folder_id', currentFolder);
  return params;
}

function resetLeadFilters() {
  ['lead-filter-q', 'lead-filter-city'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['lead-filter-status', 'lead-filter-phone', 'lead-filter-website', 'lead-filter-rating'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const fu = document.getElementById('lead-filter-followup'); if (fu) fu.checked = false;
  loadLeads(1);
}

async function loadLeads(page = leadsPage) {
  leadsPage = page;
  const params = leadFilterParams();
  params.set('page', page);
  params.set('limit', 50);

  try {
    const res = await api(`/api/leads?${params}`);
    const leads = safeArr(res.leads);
    const total = res.total ?? leads.length;
    document.getElementById('leads-count').textContent = `${total} leads (page ${page})`;

    leadsCache = leads;
    const tbody = document.getElementById('leads-tbody');
    if (!leads.length) {
      const inFolder = currentFolder && currentFolder !== 'unfiled';
      const folderName = (foldersCache.find(f => f.id === currentFolder) || {}).name || 'this folder';
      tbody.innerHTML = inFolder
        ? `<tr><td colspan="7" class="text-slate-500 text-center py-6">
             <i class="fa-solid fa-folder-open text-2xl mb-2 block opacity-40"></i>
             <b>${esc(folderName)}</b> is empty.<br>
             <span class="text-xs">Tick leads in <button class="underline open-allleads">All Leads</button>, then choose <b>“Move to folder…”</b> — or click <b>Add Lead</b> to create one here.</span>
           </td></tr>`
        : '<tr><td colspan="7" class="text-slate-500 text-center py-6">No leads found</td></tr>';
      const jump = tbody.querySelector('.open-allleads');
      if (jump) jump.addEventListener('click', () => { currentFolder = ''; loadFolders(); loadLeads(1); });
      updateSelectionUI();
      return;
    }
    tbody.innerHTML = leads.map(l => {
      const loc = leadLocation(l);
      const checked = selectedLeads.has(l.id) ? 'checked' : '';
      const rating = l.reviews_average != null
        ? `<span class="text-amber-500 font-medium">${esc(l.reviews_average)}</span>`
        : '<span class="text-slate-400">—</span>';
      return `
      <tr>
        <td><input type="checkbox" class="lead-check" data-id="${esc(l.id)}" data-name="${esc(l.name)}" data-phone="${esc(l.phone_number || '')}" ${checked} /></td>
        <td class="font-medium text-white"><button class="open-lead text-left hover:underline block w-full truncate" data-id="${esc(l.id)}" title="${esc(l.name)}">${esc(l.name)}</button></td>
        <td>${esc(l.phone_number || '—')}</td>
        <td class="text-slate-300" title="${esc(loc)}">${esc(loc || '—')}</td>
        <td><span class="badge ${badgeClass(l.status)}">${esc(l.status || 'New')}</span></td>
        <td>${rating}</td>
        <td class="whitespace-nowrap">
          <button class="btn-secondary text-xs open-lead" data-id="${esc(l.id)}" title="Open / timeline"><i class="fa-solid fa-eye"></i></button>
          <button class="btn-secondary text-xs delete-lead ml-1" data-id="${esc(l.id)}" title="Delete lead"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('.lead-check').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) selectedLeads.set(cb.dataset.id, { name: cb.dataset.name, phone: cb.dataset.phone });
        else selectedLeads.delete(cb.dataset.id);
        updateSelectionUI();
      });
    });
    updateSelectionUI();

    tbody.querySelectorAll('.open-lead').forEach(btn => {
      btn.addEventListener('click', () => openLeadDetail(btn.dataset.id));
    });
    tbody.querySelectorAll('.copy-lead-id').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(btn.dataset.id);
        notify('Lead ID copied', 'success');
      });
    });
    tbody.querySelectorAll('.delete-lead').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this lead?')) return;
        try {
          await api(`/api/leads/${btn.dataset.id}`, { method: 'DELETE' });
          notify('Lead deleted', 'success');
          loadLeads();
        } catch (e) { notify(e.message, 'error'); }
      });
    });
  } catch (err) {
    notify(err.message, 'error');
  }
}

function updateSelectionUI() {
  const count = selectedLeads.size;
  const bar = document.getElementById('leads-bulk-bar');
  if (bar) {
    bar.classList.toggle('hidden', count === 0);
    bar.classList.toggle('flex', count > 0);
    const c = document.getElementById('leads-selected-count');
    if (c) c.textContent = count;
  }
  // sync the header "select all" checkbox against current page rows
  const all = document.getElementById('leads-select-all');
  if (all) {
    const rows = [...document.querySelectorAll('.lead-check')];
    all.checked = rows.length > 0 && rows.every(cb => cb.checked);
    all.indeterminate = rows.some(cb => cb.checked) && !all.checked;
  }
}

function clearLeadSelection() {
  selectedLeads.clear();
  document.querySelectorAll('.lead-check').forEach(cb => { cb.checked = false; });
  updateSelectionUI();
}

async function startScrape(e) {
  e.preventDefault();
  const form = document.getElementById('scrape-form');
  if (!validateForm(form)) return;

  const body = {
    business_type: document.getElementById('scrape-business').value.trim(),
    location: document.getElementById('scrape-location').value.trim(),
    target: parseInt(document.getElementById('scrape-target').value, 10) || 100,
    scope: document.getElementById('scrape-scope').value,
    no_website_only: document.getElementById('scrape-no-website').checked,
  };

  // Remember which folder to file the results into (chosen on the scrape form)
  scrapeSaveFolder = document.getElementById('scrape-folder')?.value || '';

  setLoading(true, 'Starting scrape…');
  try {
    const res = await api('/api/leads/scrape', { method: 'POST', body });
    scrapeJobId = res.job_id;
    document.getElementById('scrape-status').classList.remove('hidden');
    document.getElementById('scrape-save-btn').classList.add('hidden');
    const bar = document.getElementById('scrape-progress-bar');
    bar.classList.add('scrape-working');   // animated "working" stripes
    bar.style.width = '100%';
    notify('Scrape started — a Chromium window will open and work automatically', 'info');
    pollScrapeStatus();
  } catch (err) {
    notify(err.message, 'error');
  } finally {
    setLoading(false);
  }
}

function pollScrapeStatus() {
  if (scrapePollTimer) clearInterval(scrapePollTimer);
  scrapePollTimer = setInterval(async () => {
    if (!scrapeJobId) return;
    try {
      const res = await api(`/api/leads/scrape/${scrapeJobId}`);
      const found = res.found || 0;
      const target = res.target || 100;
      const status = res.job_status || 'running';
      const statusEl = document.getElementById('scrape-job-status');
      statusEl.textContent = status;
      statusEl.className = status === 'error' ? 'badge badge-danger' : status === 'completed' ? 'badge badge-success' : 'badge badge-warn';

      const lastLog = safeArr(res.log).slice(-1)[0] || '';
      const bar = document.getElementById('scrape-progress-bar');
      const running = !(status === 'done' || status === 'completed' || status === 'error');

      document.getElementById('scrape-progress-text').textContent =
        status === 'error'
          ? (lastLog || 'Scrape failed — check the Chromium window / Playwright')
          : running
            ? `Working… ${found} / ${target} found${res.current_area ? ' · ' + res.current_area : ''}`
            : `${found} / ${target} found`;

      if (running) {
        // keep the animated full-width "working" bar so it's clearly busy even at 0 found
        bar.classList.add('scrape-working');
        bar.style.width = '100%';
      } else {
        bar.classList.remove('scrape-working');
        bar.style.width = (target ? Math.min(100, (found / target) * 100) : 0) + '%';
      }

      if (!running) {
        clearInterval(scrapePollTimer);
        if (status === 'error') {
          notify('Scrape finished with errors — see the message above', 'error');
        } else if (found > 0) {
          // Auto-save the results into the chosen folder
          autoSaveScrape(found);
        } else {
          notify('Scrape complete, but 0 leads were found. Try a broader search or a different area/scope.', 'warning');
        }
      }
    } catch { /* keep polling */ }
  }, 2000);
}

async function autoSaveScrape(found) {
  if (!scrapeJobId) return;
  setLoading(true, 'Saving leads…');
  try {
    const fq = (scrapeSaveFolder && scrapeSaveFolder !== 'unfiled') ? `?folder_id=${encodeURIComponent(scrapeSaveFolder)}` : '';
    const res = await api(`/api/leads/scrape/${scrapeJobId}/save${fq}`, { method: 'POST' });
    const folderName = (foldersCache.find(f => f.id === scrapeSaveFolder) || {}).name;
    const into = folderName ? ` into “${folderName}”` : '';
    const parts = [`${res.inserted || 0} new`];
    if (res.filed) parts.push(`${res.filed} existing filed`);
    if (res.skipped) parts.push(`${res.skipped} duplicates`);
    notify(`Saved${into}: ${parts.join(', ')}`, 'success');
    loadFolders();
    if (scrapeSaveFolder) { currentFolder = scrapeSaveFolder; }
    loadLeads(1);
  } catch (err) {
    notify('Auto-save failed: ' + err.message + ' — use “Save to Database”.', 'error');
    document.getElementById('scrape-save-btn').classList.remove('hidden');
  } finally {
    setLoading(false);
  }
}

async function saveScrapeResults() {
  if (!scrapeJobId) return;
  setLoading(true, 'Saving leads…');
  try {
    const fq = (currentFolder && currentFolder !== 'unfiled') ? `?folder_id=${encodeURIComponent(currentFolder)}` : '';
    const res = await api(`/api/leads/scrape/${scrapeJobId}/save${fq}`, { method: 'POST' });
    notify(`Saved ${res.inserted || 0} leads to database`, 'success');
    loadFolders();
    loadLeads();
  } catch (err) {
    notify(err.message, 'error');
  } finally {
    setLoading(false);
  }
}

function openLeadModal() {
  // Default the folder dropdown to the folder currently being viewed (if any real folder)
  const sel = document.getElementById('lead-form-folder');
  if (sel) sel.value = (currentFolder && currentFolder !== 'unfiled') ? currentFolder : '';
  document.getElementById('lead-modal').classList.remove('hidden');
}

async function createLead(e) {
  e.preventDefault();
  const form = document.getElementById('lead-form');
  if (!validateForm(form)) return;
  const data = formToObject(form);
  if (!data.folder_id) delete data.folder_id;
  if (!data.follow_up_date) delete data.follow_up_date;
  setLoading(true);
  try {
    await api('/api/leads', { method: 'POST', body: data });
    notify('Lead created', 'success');
    document.getElementById('lead-modal').classList.add('hidden');
    form.reset();
    loadLeads();
  } catch (err) {
    notify(err.message, 'error');
  } finally {
    setLoading(false);
  }
}

/* ── Area API ──────────────────────────────────────────────────────────────── */
async function checkAreaAPIStatus() {
  const badge = document.getElementById('area-api-status');
  if (!badge) return;
  badge.className = 'badge badge-warn';
  badge.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-1"></i>Checking…';
  try {
    const res = await api('/api/locations/search?q=india&limit=1');
    const hasLive = res.live || safeArr(res.results).some(r => r.source === 'nominatim');
    if (hasLive) {
      badge.className = 'badge badge-success';
      badge.innerHTML = '<i class="fa-solid fa-circle mr-1 text-xs"></i>Live API Online';
    } else {
      badge.className = 'badge badge-warn';
      badge.innerHTML = '<i class="fa-solid fa-circle-half-stroke mr-1 text-xs"></i>Local Data Only';
    }
  } catch {
    badge.className = 'badge badge-danger';
    badge.innerHTML = '<i class="fa-solid fa-circle-xmark mr-1 text-xs"></i>API Offline';
  }
}


function localSearchCity(q) {
  const query = q.toLowerCase().trim();
  const results = [];
  const seen = new Set();
  for (const [key, meta] of Object.entries(LOCAL_CITY_META)) {
    const hay = `${key} ${meta.display} ${meta.state} ${meta.country}`.toLowerCase();
    if (hay.includes(query) || query.split(' ').some(p => p.length > 2 && key.includes(p))) {
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        name: meta.display,
        display: [meta.display, meta.state, meta.country].filter(Boolean).join(', '),
        city: meta.display,
        city_key: key,
        state: meta.state,
        country: meta.country,
        source: 'local',
      });
    }
  }
  for (const [k, label] of Object.entries(LOCAL_COUNTRIES)) {
    if (k.includes(query) || label.toLowerCase().includes(query)) {
      results.push({ name: label, display: label, city: '', city_key: '', country: label, source: 'local-country' });
    }
  }
  return results.slice(0, 8);
}

function localLoadAreas(city, state, country) {
  const key = city.toLowerCase().trim();
  const aliases = { bengaluru: 'bangalore', bombay: 'mumbai', 'new delhi': 'delhi' };
  const norm = aliases[key] || key;
  const areas = LOCAL_AREAS[norm] || LOCAL_AREAS[key] || [];
  const meta = LOCAL_CITY_META[norm] || LOCAL_CITY_META[key] || {};
  return {
    city,
    state: state || meta.state || '',
    country: country || meta.country || '',
    areas,
    local_count: areas.length,
    api_count: 0,
    total: areas.length,
    lat: meta.lat,
    lng: meta.lng,
    source: 'local',
  };
}

function renderCityResults(results, fallback = false) {
  const el = document.getElementById('city-search-results');
  if (!results.length) {
    el.innerHTML = '<p class="text-slate-500 text-sm">No cities found</p>';
    return;
  }
  el.innerHTML = results.map(r => `
    <button type="button" class="city-result glass rounded-lg p-3 text-left hover:border-indigo-400 transition text-sm w-full"
      data-city="${esc(r.city || r.name)}" data-state="${esc(r.state || '')}" data-country="${esc(r.country || '')}">
      <p class="font-medium text-white">${esc(r.display || r.name)}</p>
      <p class="text-xs text-slate-400 mt-1">${esc(r.source || 'api')}${fallback ? ' · offline fallback' : ''}</p>
    </button>`).join('');

  el.querySelectorAll('.city-result').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('areas-city').value = btn.dataset.city;
      document.getElementById('areas-state').value = btn.dataset.state;
      document.getElementById('areas-country').value = btn.dataset.country;
      notify(`Selected ${btn.dataset.city}`, 'info');
    });
  });
}

async function searchCity() {
  const q = document.getElementById('city-search-q').value.trim();
  if (q.length < 2) {
    notify('Enter at least 2 characters', 'error');
    return;
  }
  const loading = document.getElementById('city-search-loading');
  const sourceEl = document.getElementById('city-search-source');
  loading.classList.remove('hidden');
  if (sourceEl) sourceEl.classList.add('hidden');
  try {
    const res = await api(`/api/locations/search?q=${encodeURIComponent(q)}&limit=8`);
    const results = safeArr(res.results);
    renderCityResults(results);
    if (sourceEl) {
      const liveCount = results.filter(r => r.source === 'nominatim').length;
      const localCount = results.length - liveCount;
      sourceEl.classList.remove('hidden');
      if (liveCount > 0) {
        sourceEl.innerHTML = `<i class="fa-solid fa-satellite-dish mr-1 text-emerald-400"></i><span class="text-emerald-400">${liveCount} live</span> + ${localCount} local results`;
      } else {
        sourceEl.innerHTML = `<i class="fa-solid fa-database mr-1 text-amber-400"></i><span class="text-amber-400">Local results only</span> — Nominatim returned no results for this query`;
      }
    }
  } catch {
    const local = localSearchCity(q);
    renderCityResults(local, true);
    if (sourceEl) {
      sourceEl.classList.remove('hidden');
      sourceEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-1 text-amber-400"></i><span class="text-amber-400">Offline fallback</span> — showing local city database only';
    }
    notify('Live API unavailable — showing offline city data', 'warning');
  } finally {
    loading.classList.add('hidden');
  }
}

function renderAreas(data, fallback = false) {
  const meta = document.getElementById('areas-meta');
  const liveCount = data.api_count || 0;
  const localCount = data.local_count || 0;
  const sourceBadge = fallback
    ? `<span class="badge badge-warn ml-2"><i class="fa-solid fa-database mr-1 text-xs"></i>Offline</span>`
    : (liveCount > 0
      ? `<span class="badge badge-success ml-2"><i class="fa-solid fa-satellite-dish mr-1 text-xs"></i>Live+Local</span>`
      : `<span class="badge badge-warn ml-2"><i class="fa-solid fa-database mr-1 text-xs"></i>Local only</span>`);

  meta.innerHTML = `
    <div class="flex flex-wrap items-center gap-3">
      <span><i class="fa-solid fa-city mr-1 text-indigo-400"></i><strong class="text-white">${esc(data.city)}</strong></span>
      ${data.state ? `<span class="text-slate-400">${esc(data.state)}</span>` : ''}
      ${data.country ? `<span class="text-slate-400">· ${esc(data.country)}</span>` : ''}
      <span class="text-slate-300">${data.total || 0} areas found</span>
      ${liveCount > 0 ? `<span class="text-xs text-slate-500">(${localCount} local + ${liveCount} from Nominatim)</span>` : ''}
      ${sourceBadge}
    </div>`;

  const badge = document.getElementById('areas-api-badge');
  if (badge) {
    badge.classList.remove('hidden');
    if (fallback || liveCount === 0) {
      badge.className = 'badge badge-warn';
      badge.innerHTML = '<i class="fa-solid fa-database mr-1 text-xs"></i>Local data only';
    } else {
      badge.className = 'badge badge-success';
      badge.innerHTML = `<i class="fa-solid fa-satellite-dish mr-1 text-xs"></i>${liveCount} live areas`;
    }
  }

  const list = document.getElementById('areas-list');
  const areas = safeArr(data.areas);
  if (!areas.length) {
    list.innerHTML = '<p class="text-slate-500 text-sm py-3">No areas found — try another city spelling or check the city name</p>';
    return;
  }
  list.innerHTML = areas.map(a =>
    `<span class="badge badge-new cursor-pointer hover:bg-indigo-500/30 transition" title="Click to copy"
      onclick="navigator.clipboard.writeText('${esc(a)}'); this.style.background='rgba(34,197,94,0.3)'; setTimeout(()=>this.style.background='',800)">
      ${esc(a)}</span>`
  ).join('');
}

async function loadAreas(e) {
  if (e) e.preventDefault();
  const form = document.getElementById('areas-form');
  if (!validateForm(form)) return;

  const city = document.getElementById('areas-city').value.trim();
  const state = document.getElementById('areas-state').value.trim();
  const country = document.getElementById('areas-country').value.trim();
  const loading = document.getElementById('areas-loading');
  const badge = document.getElementById('areas-api-badge');
  loading.classList.remove('hidden');
  if (badge) { badge.classList.remove('hidden'); badge.className = 'badge badge-warn'; badge.textContent = 'Loading…'; }

  try {
    const params = new URLSearchParams({ city });
    if (country) params.set('country', country);
    if (state) params.set('state', state);
    const res = await api(`/api/locations/areas?${params}`);
    renderAreas(res);
    if (res.message) notify(res.message, 'info');
    if (res.live) {
      notify(`${res.api_count} live areas fetched from Nominatim`, 'success');
    }
  } catch {
    const local = localLoadAreas(city, state, country);
    renderAreas(local, true);
    notify('Live API unavailable — showing local area database', 'warning');
  } finally {
    loading.classList.add('hidden');
  }
}

/* ── Outreach ──────────────────────────────────────────────────────────────── */
async function loadTemplates() {
  try {
    const res = await api('/api/outreach/templates');
    const templates = safeArr(res.templates);
    const list = document.getElementById('templates-list');
    const select = document.getElementById('campaign-template');

    select.innerHTML = templates.length
      ? templates.map(t => `<option value="${esc(t.id)}">${esc(t.name)} (${esc(t.channel)})</option>`).join('')
      : '<option value="">No templates</option>';

    if (!templates.length) {
      list.innerHTML = '<p class="text-slate-500 text-sm">No templates yet</p>';
      return;
    }
    templatesCache = {};
    list.innerHTML = templates.map(t => {
      templatesCache[t.id] = t;
      return `
      <div class="glass rounded-lg p-3 text-sm">
        <div class="flex justify-between items-start">
          <div><p class="font-medium text-white">${esc(t.name)}</p>
          <p class="text-xs text-slate-400">${esc(t.channel)} · ${esc((t.body || '').slice(0, 60))}…</p></div>
          <div class="flex gap-1">
            <button class="btn-secondary text-xs edit-tpl" data-id="${esc(t.id)}">Edit</button>
            <button class="btn-secondary text-xs delete-tpl" data-id="${esc(t.id)}">Del</button>
          </div>
        </div>
      </div>`;
    }).join('');

    list.querySelectorAll('.edit-tpl').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = templatesCache[btn.dataset.id] || {};
        document.getElementById('template-edit-id').value = t.id || '';
        document.getElementById('tpl-name').value = t.name || '';
        document.getElementById('tpl-channel').value = t.channel || 'whatsapp';
        document.getElementById('tpl-body').value = t.body || '';
        document.getElementById('tpl-image').value = t.image_url || '';
      });
    });
    list.querySelectorAll('.delete-tpl').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete template?')) return;
        try {
          await api(`/api/outreach/templates/${btn.dataset.id}`, { method: 'DELETE' });
          notify('Template deleted', 'success');
          loadTemplates();
        } catch (e) { notify(e.message, 'error'); }
      });
    });
  } catch (err) {
    notify(err.message, 'error');
  }
}

async function saveTemplate(e) {
  e.preventDefault();
  const form = document.getElementById('template-form');
  if (!validateForm(form)) return;

  const body = {
    name: document.getElementById('tpl-name').value.trim(),
    channel: document.getElementById('tpl-channel').value,
    body: document.getElementById('tpl-body').value.trim(),
    image_url: document.getElementById('tpl-image').value.trim(),
  };
  const editId = document.getElementById('template-edit-id').value;

  setLoading(true);
  try {
    if (editId) {
      await api(`/api/outreach/templates/${editId}`, { method: 'PUT', body });
      notify('Template updated', 'success');
    } else {
      await api('/api/outreach/templates', { method: 'POST', body });
      notify('Template created', 'success');
    }
    document.getElementById('template-edit-id').value = '';
    form.reset();
    loadTemplates();
  } catch (err) {
    notify(err.message, 'error');
  } finally {
    setLoading(false);
  }
}

/* ── Outreach recipient picker (shares `selectedLeads` with the Leads tab) ──── */
function renderCampaignRecipients() {
  const wrap = document.getElementById('campaign-recipients');
  if (!wrap) return;
  document.getElementById('campaign-recipient-count').textContent = selectedLeads.size;
  if (!selectedLeads.size) {
    wrap.innerHTML = '<span class="text-xs text-slate-500" id="campaign-recipients-empty">No recipients yet — select leads in the Leads tab or search above.</span>';
    updateCampaignPreview();
    return;
  }
  wrap.innerHTML = [...selectedLeads.entries()].map(([id, l]) => `
    <span class="chip">
      ${esc(l.name || 'Lead')}${l.phone ? ` · ${esc(l.phone)}` : ''}
      <button type="button" class="recipient-remove hover:text-black" data-id="${esc(id)}"><i class="fa-solid fa-xmark"></i></button>
    </span>`).join('');
  wrap.querySelectorAll('.recipient-remove').forEach(b => b.addEventListener('click', () => {
    selectedLeads.delete(b.dataset.id);
    renderCampaignRecipients();
    updateSelectionUI();
  }));
  updateCampaignPreview();
}

let campaignSearchTimer = null;
function searchCampaignLeads() {
  const q = document.getElementById('campaign-lead-search').value.trim();
  const box = document.getElementById('campaign-lead-results');
  clearTimeout(campaignSearchTimer);
  if (q.length < 2) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  campaignSearchTimer = setTimeout(async () => {
    try {
      const res = await api(`/api/leads?${new URLSearchParams({ q, limit: 25 })}`);
      const leads = safeArr(res.leads);
      box.classList.remove('hidden');
      box.innerHTML = leads.length
        ? leads.map(l => `
          <label class="flex items-center gap-2 text-xs text-slate-200 hover:bg-white/5 rounded px-1.5 py-1 cursor-pointer">
            <input type="checkbox" class="campaign-pick" data-id="${esc(l.id)}" data-name="${esc(l.name)}" data-phone="${esc(l.phone_number || '')}" ${selectedLeads.has(l.id) ? 'checked' : ''} />
            <span class="font-medium text-white">${esc(l.name)}</span>
            <span class="text-slate-500">${esc(l.phone_number || '')}</span>
          </label>`).join('')
        : '<p class="text-xs text-slate-500 px-1.5 py-1">No matches</p>';
      box.querySelectorAll('.campaign-pick').forEach(cb => cb.addEventListener('change', () => {
        if (cb.checked) selectedLeads.set(cb.dataset.id, { name: cb.dataset.name, phone: cb.dataset.phone });
        else selectedLeads.delete(cb.dataset.id);
        renderCampaignRecipients();
        updateSelectionUI();
      }));
    } catch (e) { notify(e.message, 'error'); }
  }, 300);
}

async function updateCampaignPreview() {
  const el = document.getElementById('campaign-preview');
  if (!el) return;
  const tplId = document.getElementById('campaign-template').value;
  const tpl = templatesCache[tplId];
  const first = [...selectedLeads.values()][0];
  if (!tpl || !tpl.body) { el.textContent = 'Select a template and recipient to preview.'; return; }
  const sample = first || { name: 'there' };
  try {
    const res = await api('/api/outreach/preview', {
      method: 'POST',
      body: { body: tpl.body, image_url: tpl.image_url || '', lead: { name: sample.name, phone_number: sample.phone || '' } },
    });
    el.textContent = res.message || tpl.body;
  } catch {
    el.textContent = tpl.body;
  }
}

async function createCampaign(e) {
  e.preventDefault();
  const form = document.getElementById('campaign-form');
  if (!validateForm(form)) return;

  const leadIds = [...selectedLeads.keys()];
  if (!leadIds.length) {
    notify('Select at least one recipient', 'error');
    return;
  }

  const body = {
    template_id: document.getElementById('campaign-template').value,
    lead_ids: leadIds,
    channel: document.getElementById('campaign-channel').value,
    mark_contacted: document.getElementById('campaign-mark').checked,
  };

  setLoading(true);
  try {
    const res = await api('/api/outreach/campaigns', { method: 'POST', body });
    const camp = safeObj(res.campaign);
    const resultEl = document.getElementById('campaign-result');
    resultEl.classList.remove('hidden');
    const messages = safeArr(camp.messages);
    const links = messages.filter(m => m.url).map(m => m.url);
    resultEl.innerHTML = `
      <div class="flex items-center justify-between mb-2">
        <p class="text-emerald-400 font-medium"><i class="fa-solid fa-circle-check mr-1"></i>${camp.ready || messages.length} message(s) ready${camp.skipped ? `, ${camp.skipped} skipped` : ''}</p>
        ${links.length ? `<button type="button" id="campaign-open-all" class="btn-secondary text-xs">Open all WhatsApp</button>` : ''}
      </div>
      <div class="space-y-2 max-h-56 overflow-y-auto">${messages.map(m => `
        <div class="text-xs glass rounded-lg p-2.5">
          <div class="flex items-center justify-between gap-2">
            <span><strong class="text-white">${esc(m.name)}</strong> <span class="text-slate-500">${esc(m.phone || '—')}</span></span>
            ${m.url ? `<a href="${esc(m.url)}" target="_blank" class="text-indigo-400 whitespace-nowrap"><i class="fa-brands fa-whatsapp mr-1"></i>Open</a>` : '<span class="text-slate-600">no phone</span>'}
          </div>
          <p class="text-slate-400 mt-1 line-clamp-2">${esc(m.message || '')}</p>
        </div>`).join('')}</div>`;
    const openAll = document.getElementById('campaign-open-all');
    if (openAll) openAll.addEventListener('click', () => {
      links.slice(0, 20).forEach((u, i) => setTimeout(() => window.open(u, '_blank'), i * 300));
    });
    notify(`Campaign created — ${messages.length} message(s) ready`, 'success');
    document.getElementById('campaign-lead-search').value = '';
    document.getElementById('campaign-lead-results').classList.add('hidden');
    selectedLeads.clear();
    renderCampaignRecipients();
    updateSelectionUI();
    loadCampaigns();
  } catch (err) {
    notify(err.message, 'error');
  } finally {
    setLoading(false);
  }
}

async function loadCampaigns() {
  try {
    const res = await api('/api/outreach/campaigns');
    const campaigns = safeArr(res.campaigns);
    const el = document.getElementById('campaigns-list');
    if (!campaigns.length) {
      el.innerHTML = '<p class="text-slate-500 text-sm">No campaigns yet</p>';
      return;
    }
    el.innerHTML = campaigns.map(c => `
      <div class="glass rounded-lg p-3 text-sm flex justify-between">
        <div><p class="text-white font-medium">${esc(c.template || 'Campaign')}</p>
        <p class="text-xs text-slate-400">${esc(c.channel)} · ${c.lead_count || c.ready || 0} leads · ${fmtDate(c.created_at)}</p></div>
        <span class="badge badge-success">${esc(c.status || 'success')}</span>
      </div>`).join('');
  } catch (err) {
    notify(err.message, 'error');
  }
}

/* ── Meetings ──────────────────────────────────────────────────────────────── */
async function loadMeetings() {
  try {
    const res = await api('/api/meetings');
    const meetings = safeArr(res.meetings);
    const tbody = document.getElementById('meetings-tbody');
    if (!meetings.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-slate-500 py-4">No meetings</td></tr>';
      return;
    }
    tbody.innerHTML = meetings.map((m, i) => `
      <tr>
        <td class="text-white">${esc(m.title)}</td>
        <td>${fmtDate(m.scheduled_at)}</td>
        <td><span class="badge ${badgeClass(m.status)}">${esc(m.status)}</span></td>
        <td class="text-slate-400">${esc(m.notes || '—')}</td>
        <td><button class="btn-secondary text-xs notify-meeting" data-i="${i}"><i class="fa-brands fa-whatsapp mr-1"></i>Team</button></td>
      </tr>`).join('');
    tbody.querySelectorAll('.notify-meeting').forEach(btn => btn.addEventListener('click', () => {
      const m = meetings[btn.dataset.i];
      const text = `📅 *Meeting: ${m.title}*\n🕒 ${fmtDate(m.scheduled_at)}\nStatus: ${m.status || 'Scheduled'}${m.notes ? `\n📝 ${m.notes}` : ''}\n\n— ${appSettings.company || 'Team'}`;
      openWhatsApp(appSettings.team_whatsapp, text);
    }));
  } catch (err) {
    notify(err.message, 'error');
  }
}

async function createMeeting(e) {
  e.preventDefault();
  const form = document.getElementById('meeting-form');
  if (!validateForm(form)) return;
  const data = formToObject(form);
  setLoading(true);
  try {
    await api('/api/meetings', { method: 'POST', body: data });
    notify('Meeting scheduled', 'success');
    form.reset();
    loadMeetings();
  } catch (err) {
    notify(err.message, 'error');
  } finally {
    setLoading(false);
  }
}

/* ── Tasks ─────────────────────────────────────────────────────────────────── */
async function loadTasks() {
  try {
    const res = await api('/api/tasks');
    const tasks = safeArr(res.tasks);
    const tbody = document.getElementById('tasks-tbody');
    if (!tasks.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-slate-500 py-4">No tasks</td></tr>';
      return;
    }
    tbody.innerHTML = tasks.map((t, i) => `
      <tr>
        <td class="text-white">${esc(t.title)}</td>
        <td><span class="badge ${badgeClass(t.priority)}">${esc(t.priority)}</span></td>
        <td>${esc(t.due_date || '—')}</td>
        <td><span class="badge ${badgeClass(t.status)}">${esc(t.status || 'Open')}</span></td>
        <td class="whitespace-nowrap">
          <button class="btn-secondary text-xs notify-task" data-i="${i}" title="Send to team WhatsApp"><i class="fa-brands fa-whatsapp"></i></button>
          <button class="btn-secondary text-xs complete-task ml-1" data-id="${esc(t.id)}">Complete</button>
        </td>
      </tr>`).join('');

    tbody.querySelectorAll('.notify-task').forEach(btn => btn.addEventListener('click', () => {
      const t = tasks[btn.dataset.i];
      const text = `✅ *Task: ${t.title}*\nPriority: ${t.priority || 'Medium'}${t.due_date ? `\n📆 Due: ${t.due_date}` : ''}${t.description ? `\n${t.description}` : ''}\n\n— ${appSettings.company || 'Team'}`;
      openWhatsApp(appSettings.team_whatsapp, text);
    }));

    tbody.querySelectorAll('.complete-task').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await api(`/api/tasks/${btn.dataset.id}`, { method: 'PUT', body: { status: 'Completed' } });
          notify('Task completed', 'success');
          loadTasks();
        } catch (e) { notify(e.message, 'error'); }
      });
    });
  } catch (err) {
    notify(err.message, 'error');
  }
}

async function createTask(e) {
  e.preventDefault();
  const form = document.getElementById('task-form');
  if (!validateForm(form)) return;
  const data = formToObject(form);
  setLoading(true);
  try {
    await api('/api/tasks', { method: 'POST', body: data });
    notify('Task created', 'success');
    form.reset();
    loadTasks();
  } catch (err) {
    notify(err.message, 'error');
  } finally {
    setLoading(false);
  }
}

/* ── HR: Employees ───────────────────────────────────────────────────────── */
async function loadEmployees() {
  try {
    const res = await api('/api/hr/employees');
    const employees = safeArr(res.employees);
    const tbody = document.getElementById('employees-tbody');
    if (!employees.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-slate-500 py-4">No employees</td></tr>';
      return;
    }
    tbody.innerHTML = employees.map(e => `
      <tr>
        <td class="text-white">${esc(e.name)}</td>
        <td>${esc(e.email)}</td>
        <td>${esc(e.department || '—')}</td>
        <td>${esc(e.designation || '—')}</td>
        <td>${fmtMoney(e.ctc)}</td>
        <td><button class="btn-secondary text-xs copy-id" data-id="${esc(e.id)}">${esc((e.id || '').slice(-6))}</button></td>
      </tr>`).join('');
    tbody.querySelectorAll('.copy-id').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(btn.dataset.id);
        notify('Employee ID copied', 'success');
      });
    });
  } catch (err) {
    notify(err.message, 'error');
  }
}

async function createEmployee(e) {
  e.preventDefault();
  const form = document.getElementById('employee-form');
  if (!validateForm(form)) return;
  const data = formToObject(form);
  data.ctc = parseFloat(data.ctc) || 0;
  setLoading(true);
  try {
    await api('/api/hr/employees', { method: 'POST', body: data });
    notify('Employee added', 'success');
    form.reset();
    loadEmployees();
  } catch (err) {
    notify(err.message, 'error');
  } finally {
    setLoading(false);
  }
}

/* ── HR: Attendance ──────────────────────────────────────────────────────── */
function uploadAttendanceWithProgress(url, formData, token) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const wrap = document.getElementById('attendance-progress-wrap');
    const bar = document.getElementById('attendance-progress-bar');
    const pctEl = document.getElementById('attendance-progress-pct');
    wrap.classList.remove('hidden');
    bar.style.width = '0%';
    pctEl.textContent = '0%';

    xhr.upload.addEventListener('progress', ev => {
      if (ev.lengthComputable) {
        const pct = Math.round((ev.loaded / ev.total) * 100);
        bar.style.width = pct + '%';
        pctEl.textContent = pct + '%';
      }
    });
    xhr.addEventListener('load', () => {
      wrap.classList.add('hidden');
      try {
        const json = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300) resolve(json);
        else reject(new Error(json.detail || json.message || 'Upload failed'));
      } catch {
        if (xhr.status >= 200 && xhr.status < 300) resolve({});
        else reject(new Error('Upload failed'));
      }
    });
    xhr.addEventListener('error', () => { wrap.classList.add('hidden'); reject(new Error('Upload failed')); });
    xhr.open('POST', url);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.send(formData);
  });
}

async function uploadAttendance(e) {
  e.preventDefault();
  const form = document.getElementById('attendance-form');
  if (!validateForm(form)) return;

  const month = document.getElementById('attendance-month').value.trim();
  const file = document.getElementById('attendance-file').files[0];
  if (!file) { notify('Select a file', 'error'); return; }

  const fd = new FormData();
  fd.append('file', file);

  setLoading(true, 'Uploading attendance…');
  try {
    const res = await uploadAttendanceWithProgress(
      `${API_BASE}/api/hr/attendance/upload?month=${encodeURIComponent(month)}`,
      fd,
      getToken()
    );
    notify(`Uploaded ${res.rows || 0} attendance rows`, 'success');
    form.reset();
    loadAttendance();
  } catch (err) {
    notify(err.message, 'error');
  } finally {
    setLoading(false);
  }
}

async function loadAttendance() {
  const month = document.getElementById('attendance-filter-month')?.value?.trim() || '';
  try {
    const q = month ? `?month=${encodeURIComponent(month)}` : '';
    const res = await api(`/api/hr/attendance${q}`);
    const records = safeArr(res.records);
    const el = document.getElementById('attendance-records');
    if (!records.length) {
      el.innerHTML = '<p class="text-slate-500 text-sm">No attendance records</p>';
      return;
    }
    el.innerHTML = records.map(r => `
      <div class="glass rounded-lg p-3 text-sm flex justify-between">
        <div><p class="text-white font-medium">${esc(r.month)} · ${esc(r.filename || 'upload')}</p>
        <p class="text-xs text-slate-400">${r.row_count || 0} rows · ${fmtDate(r.uploaded_at)}</p></div>
      </div>`).join('');
  } catch (err) {
    notify(err.message, 'error');
  }
}

/* ── HR: Leave ───────────────────────────────────────────────────────────── */
async function loadLeave() {
  try {
    const res = await api('/api/hr/leave');
    const requests = safeArr(res.requests);
    const tbody = document.getElementById('leave-tbody');
    if (!requests.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-slate-500 py-4">No leave requests</td></tr>';
      return;
    }
    tbody.innerHTML = requests.map(r => `
      <tr>
        <td>${esc(r.employee_id?.slice?.(-8) || r.employee_id || '—')}</td>
        <td>${esc(r.leave_type)}</td>
        <td>${esc(r.start_date)} → ${esc(r.end_date)}</td>
        <td><span class="badge ${badgeClass(r.status)}">${esc(r.status)}</span></td>
        <td>${r.status === 'Pending' ? `
          <button class="btn-secondary text-xs leave-approve" data-id="${esc(r.id)}">Approve</button>
          <button class="btn-secondary text-xs leave-reject ml-1" data-id="${esc(r.id)}">Reject</button>` : esc(r.hr_note || '—')}
        </td>
      </tr>`).join('');

    tbody.querySelectorAll('.leave-approve').forEach(btn => {
      btn.addEventListener('click', () => leaveAction(btn.dataset.id, 'Approved'));
    });
    tbody.querySelectorAll('.leave-reject').forEach(btn => {
      btn.addEventListener('click', () => leaveAction(btn.dataset.id, 'Rejected'));
    });
  } catch (err) {
    notify(err.message, 'error');
  }
}

async function leaveAction(id, status) {
  try {
    await api(`/api/hr/leave/${id}/action`, { method: 'POST', body: { status, hr_note: '' } });
    notify(`Leave ${status.toLowerCase()}`, 'success');
    loadLeave();
  } catch (err) {
    notify(err.message, 'error');
  }
}

async function applyLeave(e) {
  e.preventDefault();
  const form = document.getElementById('leave-form');
  if (!validateForm(form)) return;
  const data = formToObject(form);
  setLoading(true);
  try {
    await api('/api/hr/leave', { method: 'POST', body: data });
    notify('Leave request submitted', 'success');
    form.reset();
    loadLeave();
  } catch (err) {
    notify(err.message, 'error');
  } finally {
    setLoading(false);
  }
}

/* ── HR: Payroll ─────────────────────────────────────────────────────────── */
async function loadPayroll() {
  const month = document.getElementById('payroll-filter-month')?.value?.trim() || '';
  try {
    const q = month ? `?month=${encodeURIComponent(month)}` : '';
    const res = await api(`/api/hr/payroll${q}`);
    const rows = safeArr(res.payroll);
    const tbody = document.getElementById('payroll-tbody');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-slate-500 py-4">No payroll records</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(p => `
      <tr>
        <td class="text-white">${esc(p.employee_name || p.employee_id)}</td>
        <td>${esc(p.month)}</td>
        <td>${fmtMoney(p.net_salary)}</td>
        <td>${esc(p.absent_days ?? 0)}</td>
        <td>${fmtMoney(p.bonus)}</td>
      </tr>`).join('');
  } catch (err) {
    notify(err.message, 'error');
  }
}

async function runPayroll(e) {
  e.preventDefault();
  const form = document.getElementById('payroll-form');
  if (!validateForm(form)) return;
  const data = formToObject(form);
  data.absent_days = parseFloat(data.absent_days) || 0;
  data.leave_days = parseFloat(data.leave_days) || 0;
  data.bonus = parseFloat(data.bonus) || 0;
  data.other_deductions = parseFloat(data.other_deductions) || 0;

  setLoading(true);
  try {
    const res = await api('/api/hr/payroll/run', { method: 'POST', body: data });
    const p = safeObj(res.payroll);
    const el = document.getElementById('payroll-result');
    el.classList.remove('hidden');
    el.innerHTML = `
      <p class="text-emerald-400 font-medium">${esc(p.employee_name)} — ${esc(p.month)}</p>
      <div class="grid grid-cols-2 gap-2 mt-2 text-slate-300">
        <span>Gross: ${fmtMoney(p.monthly_gross)}</span>
        <span>Net: ${fmtMoney(p.net_salary)}</span>
        <span>Deductions: ${fmtMoney(p.total_deductions)}</span>
        <span>Per Day: ${fmtMoney(p.per_day_salary)}</span>
      </div>`;
    notify('Payroll calculated', 'success');
    loadPayroll();
  } catch (err) {
    notify(err.message, 'error');
  } finally {
    setLoading(false);
  }
}

/* ── HR: Holidays ────────────────────────────────────────────────────────── */
async function loadHolidays() {
  try {
    const res = await api('/api/hr/holidays');
    const holidays = safeArr(res.holidays);
    const el = document.getElementById('holidays-list');
    if (!holidays.length) {
      el.innerHTML = '<p class="text-slate-500 text-sm">No holidays configured</p>';
      return;
    }
    el.innerHTML = holidays.map(h => `
      <div class="glass rounded-lg p-3 flex justify-between text-sm">
        <div><p class="text-white font-medium">${esc(h.title)}</p>
        <p class="text-xs text-slate-400">${esc(h.description || '')}</p></div>
        <span class="badge badge-new">${esc(h.date)}</span>
      </div>`).join('');
  } catch (err) {
    notify(err.message, 'error');
  }
}

async function addHoliday(e) {
  e.preventDefault();
  const form = document.getElementById('holiday-form');
  if (!validateForm(form)) return;
  const data = formToObject(form);
  setLoading(true);
  try {
    await api('/api/hr/holidays', { method: 'POST', body: data });
    notify('Holiday added', 'success');
    form.reset();
    loadHolidays();
  } catch (err) {
    notify(err.message, 'error');
  } finally {
    setLoading(false);
  }
}

/* ── Finance: Invoices ───────────────────────────────────────────────────── */
async function loadInvoices() {
  try {
    const res = await api('/api/finance/invoices');
    const invoices = safeArr(res.invoices);
    const tbody = document.getElementById('invoices-tbody');
    if (!invoices.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-slate-500 py-4">No invoices</td></tr>';
      return;
    }
    tbody.innerHTML = invoices.map(inv => `
      <tr>
        <td class="text-white">${esc(inv.invoice_number)}</td>
        <td>${esc(inv.client_name)}</td>
        <td>${fmtMoney(inv.total)}</td>
        <td>${esc(inv.gst_percent)}%</td>
        <td><a href="/api/finance/invoices/${esc(inv.id)}/pdf" target="_blank" class="text-indigo-400 text-xs"
          onclick="event.preventDefault(); downloadWithAuth('/api/finance/invoices/${esc(inv.id)}/pdf', '${esc(inv.invoice_number)}.pdf')">
          <i class="fa-solid fa-file-pdf"></i> PDF</a></td>
      </tr>`).join('');
  } catch (err) {
    notify(err.message, 'error');
  }
}

async function downloadWithAuth(url, filename) {
  try {
    const res = await fetch(`${API_BASE}${url}`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    notify(err.message, 'error');
  }
}
window.downloadWithAuth = downloadWithAuth;

function getInvoiceItems() {
  const items = [];
  document.querySelectorAll('#invoice-items .invoice-item').forEach(row => {
    const desc = row.querySelector('[name="description"]')?.value?.trim();
    const qty = parseFloat(row.querySelector('[name="qty"]')?.value) || 1;
    const price = parseFloat(row.querySelector('[name="price"]')?.value) || 0;
    if (desc) items.push({ description: desc, qty, price });
  });
  return items;
}

async function createInvoice(e) {
  e.preventDefault();
  const form = document.getElementById('invoice-form');
  if (!validateForm(form)) return;
  const items = getInvoiceItems();
  if (!items.length) { notify('Add at least one line item', 'error'); return; }

  const body = {
    client_name: form.client_name.value.trim(),
    client_email: form.client_email.value.trim(),
    gst_percent: parseFloat(form.gst_percent.value) || 18,
    notes: form.notes.value.trim(),
    items,
  };

  setLoading(true);
  try {
    const res = await api('/api/finance/invoices', { method: 'POST', body });
    notify(`Invoice ${res.invoice_number} created — ${fmtMoney(res.total)}`, 'success');
    form.reset();
    loadInvoices();
  } catch (err) {
    notify(err.message, 'error');
  } finally {
    setLoading(false);
  }
}

function addInvoiceItem() {
  const container = document.getElementById('invoice-items');
  const div = document.createElement('div');
  div.className = 'invoice-item grid grid-cols-4 gap-2';
  div.innerHTML = `
    <input name="description" class="input-field" placeholder="Description" required />
    <input name="qty" type="number" min="1" class="input-field" value="1" required />
    <input name="price" type="number" min="0" step="0.01" class="input-field" placeholder="Price" required />
    <button type="button" class="btn-secondary remove-item text-xs">Remove</button>`;
  div.querySelector('.remove-item').addEventListener('click', () => div.remove());
  container.appendChild(div);
}

/* ── Documents ─────────────────────────────────────────────────────────────── */
async function loadDocuments(q = '') {
  try {
    const path = q ? `/api/documents?q=${encodeURIComponent(q)}` : '/api/documents';
    const res = await api(path);
    const docs = safeArr(res.documents);
    const el = document.getElementById('documents-list');
    if (!docs.length) {
      el.innerHTML = '<p class="text-slate-500 text-sm">No documents</p>';
      return;
    }
    el.innerHTML = docs.map(d => `
      <div class="glass rounded-lg p-3 flex justify-between items-center text-sm">
        <div><p class="text-white font-medium">${esc(d.title)}</p>
        <p class="text-xs text-slate-400">${esc(d.category)} · ${fmtDate(d.created_at)}</p></div>
        <button class="btn-secondary text-xs" onclick="downloadWithAuth('/api/documents/${esc(d.id)}/download', '${esc(d.original_name || d.title)}')">
          <i class="fa-solid fa-download"></i> Download</button>
      </div>`).join('');
  } catch (err) {
    notify(err.message, 'error');
  }
}

async function uploadDocument(e) {
  e.preventDefault();
  const form = document.getElementById('document-form');
  if (!validateForm(form)) return;
  const fd = new FormData(form);
  setLoading(true, 'Uploading document…');
  try {
    await api('/api/documents/upload', { method: 'POST', body: fd });
    notify('Document uploaded', 'success');
    form.reset();
    loadDocuments();
  } catch (err) {
    notify(err.message, 'error');
  } finally {
    setLoading(false);
  }
}

/* ── QR Generator ──────────────────────────────────────────────────────────── */
function updateQRPreview() {
  const position = document.getElementById('qr-position').value;
  const size = Math.min(300, Math.max(40, parseInt(document.getElementById('qr-size').value, 10) || 100));
  const marker = document.getElementById('qr-preview-marker');
  const box = document.getElementById('qr-preview-box');
  const scale = 220 / 595;
  const px = Math.max(20, Math.round(size * scale));
  marker.style.width = px + 'px';
  marker.style.height = px + 'px';
  marker.style.top = marker.style.bottom = marker.style.left = marker.style.right = 'auto';
  const pad = '8px';
  const positions = {
    'top-left': { top: pad, left: pad },
    'top-right': { top: pad, right: pad },
    'bottom-left': { bottom: pad, left: pad },
    'bottom-right': { bottom: pad, right: pad },
    center: { top: '50%', left: '50%' },
  };
  const pos = positions[position] || positions['bottom-right'];
  Object.assign(marker.style, pos);
  marker.style.transform = position === 'center' ? 'translate(-50%, -50%)' : '';

  // Draw faux document lines once so the preview looks like a page
  const lines = document.getElementById('qr-doc-lines');
  if (lines && !lines.dataset.drawn) {
    const widths = [70, 95, 88, 60, 92, 80, 45, 90, 85, 55];
    lines.innerHTML = '<div style="height:10px;width:55%;background:#1f2937;border-radius:2px;margin-bottom:6px"></div>' +
      widths.map(w => `<div style="height:6px;width:${w}%;background:#e5e7eb;border-radius:2px"></div>`).join('');
    lines.dataset.drawn = '1';
  }
}

function showQRFileName() {
  const f = document.getElementById('qr-file').files[0];
  const el = document.getElementById('qr-doc-name');
  if (el) el.textContent = f ? `📄 ${f.name}` : 'No document selected — choose a PDF on the left';
}

async function generateQR(e) {
  e.preventDefault();
  const form = document.getElementById('qr-form');
  const file = document.getElementById('qr-file').files[0];
  if (!file) { notify('Select a PDF file', 'error'); return; }
  const size = parseInt(document.getElementById('qr-size').value, 10);
  if (size < 40 || size > 300) { notify('QR size must be 40–300', 'error'); return; }

  const fd = new FormData();
  fd.append('file', file);
  fd.append('position', document.getElementById('qr-position').value);
  fd.append('size', size);
  fd.append('qr_data', document.getElementById('qr-data').value.trim());

  setLoading(true, 'Generating QR PDF…');
  try {
    const res = await api('/api/documents/qr/generate', { method: 'POST', body: fd });
    const el = document.getElementById('qr-result');
    el.classList.remove('hidden');
    el.innerHTML = `
      <p class="text-emerald-400 mb-2">QR PDF generated successfully</p>
      <button class="btn-primary text-sm" onclick="downloadWithAuth('${esc(res.download_url)}', 'document_qr.pdf')">
        <i class="fa-solid fa-download mr-1"></i>Download PDF</button>`;
    notify('QR document ready', 'success');
    loadQRHistory();
    form.reset();
    updateQRPreview();
  } catch (err) {
    notify(err.message, 'error');
  } finally {
    setLoading(false);
  }
}

async function loadQRHistory() {
  try {
    const res = await api('/api/documents/qr/history');
    const history = safeArr(res.history);
    const el = document.getElementById('qr-history');
    if (!history.length) {
      el.innerHTML = '<p class="text-slate-500 text-sm">No QR documents yet</p>';
      return;
    }
    el.innerHTML = history.map(h => `
      <div class="glass rounded-lg p-3 flex justify-between text-sm">
        <div><p class="text-white">${esc(h.source)}</p>
        <p class="text-xs text-slate-400">${esc(h.position)} · ${h.size}px · ${fmtDate(h.created_at)}</p></div>
        <button class="btn-secondary text-xs" onclick="downloadWithAuth('/api/documents/qr/${esc(h.id)}/download', 'qr.pdf')">
          Download</button>
      </div>`).join('');
  } catch (err) {
    notify(err.message, 'error');
  }
}

/* ── Analytics ─────────────────────────────────────────────────────────────── */
function makeChart(id, type, labels, data, label) {
  const ctx = document.getElementById(id);
  if (!ctx) return;
  if (charts[id]) charts[id].destroy();
  if (!labels.length) {
    charts[id] = new Chart(ctx, {
      type,
      data: { labels: ['No data'], datasets: [{ label, data: [0], backgroundColor: '#e5e7eb' }] },
      options: chartOptions(type),
    });
    return;
  }
  charts[id] = new Chart(ctx, {
    type,
    data: {
      labels,
      datasets: [{
        label,
        data,
        backgroundColor: type === 'line' ? 'rgba(17,24,39,0.08)' : CHART_PALETTE.slice(0, labels.length),
        borderColor: type === 'line' ? '#111827' : undefined,
        borderWidth: type === 'line' ? 2 : 0,
        fill: type === 'line',
        tension: 0.35,
      }],
    },
    options: chartOptions(type),
  });
}

function chartOptions(type) {
  return {
    responsive: true,
    plugins: { legend: { labels: { color: '#374151' } } },
    scales: type === 'line' || type === 'bar' ? {
      x: { ticks: { color: '#6b7280' }, grid: { color: '#eef0f2' } },
      y: { ticks: { color: '#6b7280' }, grid: { color: '#eef0f2' } },
    } : {},
  };
}

async function loadAnalytics() {
  try {
    const res = await api('/api/analytics/overview');
    const leads = safeObj(res.leads);
    const meetings = safeObj(res.meetings);
    const payroll = safeObj(res.payroll_by_month);
    const revenue = safeObj(res.revenue_by_month);

    makeChart('chart-leads-status', 'pie', Object.keys(leads), Object.values(leads), 'Leads');
    makeChart('chart-meetings-status', 'doughnut', Object.keys(meetings), Object.values(meetings), 'Meetings');
    makeChart('chart-payroll', 'bar', Object.keys(payroll).sort(), Object.keys(payroll).sort().map(k => payroll[k]), 'Payroll');
    makeChart('chart-revenue', 'line', Object.keys(revenue).sort(), Object.keys(revenue).sort().map(k => revenue[k]), 'Revenue');

    // KPI cards from dashboard summary
    try {
      const sum = safeObj((await api('/api/dashboard/summary')).data);
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      set('an-leads', sum.total_leads ?? 0);
      set('an-conv', (sum.conversion_rate ?? 0) + '%');
      set('an-rev', fmtMoney(sum.revenue_total));
      set('an-exp', fmtMoney(sum.expense_total));
    } catch { /* KPIs optional */ }
  } catch (err) {
    notify(err.message, 'error');
  }
}

/* ── Companies ─────────────────────────────────────────────────────────────── */
async function loadCompanies(q = '') {
  const params = q ? `?q=${encodeURIComponent(q)}&limit=100` : '?limit=100';
  try {
    const res = await api(`/api/companies${params}`);
    const companies = safeArr(res.companies);
    const tbody = document.getElementById('companies-tbody');
    const countEl = document.getElementById('companies-count');
    if (countEl) countEl.textContent = `${res.total ?? companies.length} companies`;
    if (!companies.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-slate-500 py-4">No companies yet — add one above</td></tr>';
      return;
    }
    tbody.innerHTML = companies.map(c => `
      <tr>
        <td class="font-medium text-white">${esc(c.name)}</td>
        <td>${esc(c.industry || '—')}</td>
        <td>${esc(c.contact_person || '—')}</td>
        <td>${esc(c.phone || '—')}</td>
        <td>${esc(c.city || '—')}</td>
        <td><span class="badge ${badgeClass(c.status)}">${esc(c.status || 'Active')}</span></td>
        <td><button class="btn-secondary text-xs delete-company" data-id="${esc(c.id)}">Delete</button></td>
      </tr>`).join('');
    tbody.querySelectorAll('.delete-company').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this company?')) return;
        try {
          await api(`/api/companies/${btn.dataset.id}`, { method: 'DELETE' });
          notify('Company deleted', 'success');
          loadCompanies();
        } catch (e) { notify(e.message, 'error'); }
      });
    });
  } catch (err) {
    notify(err.message, 'error');
  }
}

async function createCompany(e) {
  e.preventDefault();
  const form = document.getElementById('company-form');
  if (!validateForm(form)) return;
  const data = formToObject(form);
  setLoading(true);
  try {
    await api('/api/companies', { method: 'POST', body: data });
    notify('Company added', 'success');
    form.reset();
    loadCompanies();
  } catch (err) {
    notify(err.message, 'error');
  } finally {
    setLoading(false);
  }
}

/* ── Users ─────────────────────────────────────────────────────────────────── */
async function loadUsers() {
  const tbody = document.getElementById('users-tbody');
  try {
    const res = await api('/api/auth/users');
    const users = safeArr(res.users);
    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-slate-500 py-4">No users</td></tr>';
      return;
    }
    tbody.innerHTML = users.map(u => `
      <tr>
        <td class="text-white">${esc(u.name)}</td>
        <td>${esc(u.email)}</td>
        <td><span class="badge ${u.role === 'Admin' ? 'badge-warn' : 'badge-new'}">${esc(u.role)}</span></td>
        <td>${esc(u.department || '—')}</td>
        <td>${currentUser && currentUser.id !== u.id
          ? `<button class="btn-secondary text-xs delete-user" data-id="${esc(u.id)}">Delete</button>`
          : '<span class="text-slate-500 text-xs">You</span>'}</td>
      </tr>`).join('');
    tbody.querySelectorAll('.delete-user').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this user?')) return;
        try {
          await api(`/api/auth/users/${btn.dataset.id}`, { method: 'DELETE' });
          notify('User deleted', 'success');
          loadUsers();
        } catch (e) { notify(e.message, 'error'); }
      });
    });
  } catch (err) {
    if (err.message?.includes('Admin')) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-slate-500 py-4">Admin access required to manage users</td></tr>';
    } else {
      notify(err.message, 'error');
    }
  }
}

async function createUser(e) {
  e.preventDefault();
  const form = document.getElementById('user-form');
  if (!validateForm(form)) return;
  const data = formToObject(form);
  setLoading(true);
  try {
    await api('/api/auth/register', { method: 'POST', body: data });
    notify('User created', 'success');
    form.reset();
    loadUsers();
  } catch (err) {
    notify(err.message, 'error');
  } finally {
    setLoading(false);
  }
}

/* ── Settings ──────────────────────────────────────────────────────────────── */
async function loadSettings() {
  try {
    const res = await api('/api/settings');
    const s = safeObj(res.settings);
    appSettings = s;
    const form = document.getElementById('settings-form');
    if (!form) return;
    for (const [key, val] of Object.entries(s)) {
      const input = form.elements[key];
      if (input) input.value = val ?? '';
    }
  } catch (err) {
    notify('Could not load settings: ' + err.message, 'error');
  }
}

/* ── WhatsApp helpers (click-to-chat, no API key) ────────────────────────── */
function waNumber(raw) {
  const cc = (appSettings.whatsapp_country_code || '91').replace(/\D/g, '');
  let digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) digits = cc + digits;
  return digits;
}
function waLink(number, text) {
  const num = waNumber(number);
  const base = num ? `https://wa.me/${num}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(text || '')}`;
}
function openWhatsApp(number, text) {
  if (!number && !appSettings.team_whatsapp) {
    notify('Set a Team WhatsApp number in Settings → Integrations first', 'warning');
    navigateTab('settings');
    return;
  }
  window.open(waLink(number || appSettings.team_whatsapp, text), '_blank');
}

async function saveSettings(e) {
  e.preventDefault();
  const form = document.getElementById('settings-form');
  const data = formToObject(form);
  setLoading(true);
  try {
    await api('/api/settings', { method: 'PUT', body: data });
    notify('Settings saved', 'success');
  } catch (err) {
    notify(err.message, 'error');
  } finally {
    setLoading(false);
  }
}

/* ── Folders ─────────────────────────────────────────────────────────────── */
async function loadFolders() {
  try {
    const res = await api('/api/folders');
    foldersCache = safeArr(res.folders);
    renderFolders(res.total_leads ?? 0, res.unfiled ?? 0);
    populateFolderSelects();
  } catch (err) { /* folders optional */ }
}

function renderFolders(total, unfiled) {
  const el = document.getElementById('folders-list');
  if (!el) return;
  const row = (id, icon, label, count) => `
    <div class="folder-item ${currentFolder === id ? 'active' : ''}" data-folder="${esc(id)}">
      <i class="fa-solid ${icon} text-xs w-4"></i><span class="truncate">${esc(label)}</span>
      <span class="folder-count">${count}</span>
      ${id && id !== 'unfiled' ? `<button class="folder-del ml-1 opacity-60 hover:opacity-100" data-id="${esc(id)}" title="Delete folder"><i class="fa-solid fa-xmark"></i></button>` : ''}
    </div>`;
  let html = row('', 'fa-inbox', 'All Leads', total);
  html += row('unfiled', 'fa-folder-open', 'Unfiled', unfiled);
  html += foldersCache.map(f => row(f.id, 'fa-folder', f.name, f.lead_count ?? 0)).join('');
  el.innerHTML = html;
  el.querySelectorAll('.folder-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('.folder-del')) return;
      currentFolder = item.dataset.folder;
      renderFolders(total, unfiled);
      loadLeads(1);
    });
  });
  el.querySelectorAll('.folder-del').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Delete this folder? Leads inside it will become Unfiled.')) return;
      try {
        await api(`/api/folders/${btn.dataset.id}`, { method: 'DELETE' });
        if (currentFolder === btn.dataset.id) currentFolder = '';
        notify('Folder deleted', 'success');
        loadFolders(); loadLeads(1);
      } catch (err) { notify(err.message, 'error'); }
    });
  });
}

function populateFolderSelects() {
  const opts = '<option value="">— None —</option>' +
    foldersCache.map(f => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('');
  const lf = document.getElementById('lead-form-folder');
  if (lf) lf.innerHTML = opts;
  const bf = document.getElementById('bulk-folder-select');
  if (bf) bf.innerHTML = '<option value="">Move to folder…</option><option value="unfiled">— Unfiled —</option>' +
    foldersCache.map(f => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('');
  const sf = document.getElementById('scrape-folder');
  if (sf) {
    const prev = sf.value || ((currentFolder && currentFolder !== 'unfiled') ? currentFolder : '');
    sf.innerHTML = '<option value="">— No folder (Unfiled) —</option>' +
      foldersCache.map(f => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('');
    sf.value = prev;
  }
}

async function createFolder(e) {
  e.preventDefault();
  const form = document.getElementById('folder-form');
  if (!validateForm(form)) return;
  try {
    await api('/api/folders', { method: 'POST', body: formToObject(form) });
    document.getElementById('folder-modal').classList.add('hidden');
    form.reset();
    notify('Folder created', 'success');
    loadFolders();
  } catch (err) { notify(err.message, 'error'); }
}

/* ── Bulk actions & export ───────────────────────────────────────────────── */
async function bulkLeadAction(action, value = '') {
  const ids = [...selectedLeads.keys()];
  if (!ids.length) { notify('No leads selected', 'warning'); return; }
  if (action === 'delete' && !confirm(`Delete ${ids.length} lead(s)? This cannot be undone.`)) return;
  setLoading(true, 'Updating…');
  try {
    const res = await api('/api/leads/bulk', { method: 'POST', body: { ids, action, value } });
    notify(`${res.affected} lead(s) updated`, 'success');
    clearLeadSelection();
    loadFolders();
    loadLeads();
  } catch (err) { notify(err.message, 'error'); }
  finally { setLoading(false); }
}

async function exportLeads() {
  const params = leadFilterParams();
  params.set('limit', 10000);
  setLoading(true, 'Exporting…');
  try {
    const res = await api(`/api/leads/export?${params}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'leads_export.csv';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    notify('CSV downloaded', 'success');
  } catch (err) { notify('Export failed: ' + err.message, 'error'); }
  finally { setLoading(false); }
}

/* ── Lead detail / timeline ──────────────────────────────────────────────── */
const KIND_ICON = { note: 'fa-note-sticky', call: 'fa-phone', email: 'fa-envelope', whatsapp: 'fa-whatsapp', meeting: 'fa-handshake', created: 'fa-plus', updated: 'fa-pen' };

async function openLeadDetail(id) {
  try {
    const res = await api(`/api/leads/${id}`);
    currentDetailLead = res.lead;
    const l = currentDetailLead;
    document.getElementById('ld-name').textContent = l.name || 'Lead';
    document.getElementById('ld-sub').textContent = [l.phone_number, leadLocation(l)].filter(Boolean).join(' · ');
    document.getElementById('ld-status').value = l.status || 'New';
    document.getElementById('ld-followup').value = (l.follow_up_date || '').slice(0, 10);
    const wa = document.getElementById('ld-whatsapp');
    const digits = (l.phone_number || '').replace(/[^\d]/g, '');
    if (digits) { wa.href = `https://wa.me/${digits}`; wa.classList.remove('hidden'); }
    else wa.classList.add('hidden');
    renderTimeline(safeArr(l.activity_history));
    document.getElementById('ld-note-text').value = '';
    document.getElementById('lead-detail-modal').classList.remove('hidden');
  } catch (err) { notify(err.message, 'error'); }
}

function renderTimeline(hist) {
  const el = document.getElementById('ld-timeline');
  if (!hist.length) { el.innerHTML = '<p class="text-slate-500 text-sm py-3 text-center">No activity yet.</p>'; return; }
  el.innerHTML = [...hist].reverse().map(h => {
    const icon = KIND_ICON[(h.kind || h.action || '').toLowerCase()] || 'fa-circle-dot';
    const fa = icon === 'fa-whatsapp' ? 'fa-brands' : 'fa-solid';
    return `<div class="flex gap-2 items-start py-1.5 border-b border-white/5">
      <i class="${fa} ${icon} text-slate-400 text-xs mt-1 w-4 text-center"></i>
      <div class="min-w-0 flex-1">
        <p class="text-slate-200 text-sm">${esc(h.text || h.action || 'Activity')}</p>
        <p class="text-xs text-slate-500">${esc(h.action || '')}${h.by ? ' · ' + esc(h.by) : ''} · ${fmtDate(h.at)}</p>
      </div>
    </div>`;
  }).join('');
}

async function saveLeadDetail() {
  if (!currentDetailLead) return;
  const body = {
    status: document.getElementById('ld-status').value,
    follow_up_date: document.getElementById('ld-followup').value || null,
  };
  try {
    await api(`/api/leads/${currentDetailLead.id}`, { method: 'PUT', body });
    notify('Lead updated', 'success');
    loadLeads(); loadFolders();
    openLeadDetail(currentDetailLead.id);
  } catch (err) { notify(err.message, 'error'); }
}

async function addLeadNote() {
  if (!currentDetailLead) return;
  const text = document.getElementById('ld-note-text').value.trim();
  if (!text) { notify('Enter a note', 'warning'); return; }
  const kind = document.getElementById('ld-note-kind').value;
  try {
    await api(`/api/leads/${currentDetailLead.id}/note`, { method: 'POST', body: { text, kind } });
    document.getElementById('ld-note-text').value = '';
    openLeadDetail(currentDetailLead.id);
  } catch (err) { notify(err.message, 'error'); }
}

/* ── Expenses ────────────────────────────────────────────────────────────── */
async function loadExpenses() {
  const month = document.getElementById('expense-filter-month')?.value?.trim();
  const params = new URLSearchParams();
  if (month) params.set('month', month);
  try {
    const res = await api(`/api/finance/expenses?${params}`);
    const expenses = safeArr(res.expenses);
    document.getElementById('expense-total').textContent = fmtMoney(res.total);
    const tb = document.getElementById('expenses-tbody');
    tb.innerHTML = expenses.length ? expenses.map(e => `
      <tr>
        <td class="text-slate-400 text-xs whitespace-nowrap">${esc((e.date || '').slice(0,10))}</td>
        <td class="font-medium text-white">${esc(e.title)}</td>
        <td><span class="chip">${esc(e.category || 'General')}</span></td>
        <td class="text-slate-300">${esc(e.vendor || '—')}</td>
        <td class="text-slate-300">${esc(e.payment_method || '—')}</td>
        <td class="font-medium">${fmtMoney(e.amount)}</td>
        <td><button class="btn-secondary text-xs del-expense" data-id="${esc(e.id)}"><i class="fa-solid fa-trash"></i></button></td>
      </tr>`).join('') : '<tr><td colspan="7" class="text-slate-500 text-center py-5">No expenses recorded</td></tr>';
    tb.querySelectorAll('.del-expense').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('Delete this expense?')) return;
      try { await api(`/api/finance/expenses/${btn.dataset.id}`, { method: 'DELETE' }); notify('Deleted', 'success'); loadExpenses(); }
      catch (err) { notify(err.message, 'error'); }
    }));
    renderExpenseChart(safeObj(res.by_category));
  } catch (err) { notify(err.message, 'error'); }
}

function renderExpenseChart(byCat) {
  const ctx = document.getElementById('expense-chart');
  if (!ctx) return;
  if (charts.expense) charts.expense.destroy();
  const labels = Object.keys(byCat);
  const values = Object.values(byCat);
  charts.expense = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: labels.length ? labels : ['No data'], datasets: [{ data: values.length ? values : [1], backgroundColor: labels.length ? CHART_PALETTE : ['#e5e7eb'] }] },
    options: { plugins: { legend: { position: 'bottom', labels: { color: '#374151', padding: 10, font: { size: 11 } } } } },
  });
}

async function createExpense(e) {
  e.preventDefault();
  const form = document.getElementById('expense-form');
  if (!validateForm(form)) return;
  const data = formToObject(form);
  data.amount = parseFloat(data.amount) || 0;
  setLoading(true);
  try {
    await api('/api/finance/expenses', { method: 'POST', body: data });
    notify('Expense recorded', 'success');
    form.reset();
    loadExpenses();
  } catch (err) { notify(err.message, 'error'); }
  finally { setLoading(false); }
}

/* ── Quotations ──────────────────────────────────────────────────────────── */
async function loadQuotations() {
  try {
    const res = await api('/api/finance/quotations');
    const quotes = safeArr(res.quotations);
    const tb = document.getElementById('quotations-tbody');
    tb.innerHTML = quotes.length ? quotes.map(q => `
      <tr>
        <td class="font-medium text-white">${esc(q.quote_number)}</td>
        <td>${esc(q.client_name)}</td>
        <td class="font-medium">${fmtMoney(q.total)}</td>
        <td class="text-slate-400 text-xs">${esc(q.valid_until || '—')}</td>
        <td><span class="badge ${badgeClass(q.status)}">${esc(q.status || 'Sent')}</span></td>
        <td><a class="btn-secondary text-xs" href="/api/finance/quotations/${esc(q.id)}/pdf" target="_blank"><i class="fa-solid fa-file-pdf mr-1"></i>PDF</a></td>
      </tr>`).join('') : '<tr><td colspan="6" class="text-slate-500 text-center py-5">No quotations yet</td></tr>';
  } catch (err) { notify(err.message, 'error'); }
}

function addQuoteItem() {
  const wrap = document.getElementById('quote-items');
  const div = document.createElement('div');
  div.className = 'quote-item grid grid-cols-4 gap-2';
  div.innerHTML = `
    <input name="description" class="input-field" placeholder="Description" required />
    <input name="qty" type="number" min="1" class="input-field" value="1" required />
    <input name="price" type="number" min="0" step="0.01" class="input-field" placeholder="Price" required />
    <button type="button" class="btn-secondary remove-quote-item text-xs">Remove</button>`;
  div.querySelector('.remove-quote-item').addEventListener('click', () => div.remove());
  wrap.appendChild(div);
}

async function createQuotation(e) {
  e.preventDefault();
  const form = document.getElementById('quotation-form');
  if (!validateForm(form)) return;
  const items = [...form.querySelectorAll('.quote-item')].map(row => ({
    description: row.querySelector('[name=description]').value,
    qty: parseFloat(row.querySelector('[name=qty]').value) || 1,
    price: parseFloat(row.querySelector('[name=price]').value) || 0,
  }));
  const body = {
    client_name: form.querySelector('[name=client_name]').value,
    client_email: form.querySelector('[name=client_email]').value,
    gst_percent: parseFloat(form.querySelector('[name=gst_percent]').value) || 0,
    valid_until: form.querySelector('[name=valid_until]').value,
    items,
  };
  setLoading(true);
  try {
    const res = await api('/api/finance/quotations', { method: 'POST', body });
    notify(`Quotation ${res.quote_number} created`, 'success');
    form.reset();
    loadQuotations();
  } catch (err) { notify(err.message, 'error'); }
  finally { setLoading(false); }
}

/* ── Global search ───────────────────────────────────────────────────────── */
async function runGlobalSearch() {
  const q = document.getElementById('global-search').value.trim();
  const box = document.getElementById('global-search-results');
  if (q.length < 2) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  try {
    const res = await api(`/api/search?q=${encodeURIComponent(q)}`);
    const results = safeArr(res.results);
    if (!results.length) {
      box.innerHTML = '<p class="text-slate-500 text-sm p-2">No matches</p>';
    } else {
      const icon = { lead: 'fa-user', company: 'fa-building', employee: 'fa-id-badge' };
      box.innerHTML = results.map(r => `
        <button class="gs-result w-full text-left flex items-center gap-2 p-2 rounded-lg hover:bg-slate-900/40" data-tab="${esc(r.tab)}" data-type="${esc(r.type)}" data-id="${esc(r.id)}">
          <i class="fa-solid ${icon[r.type] || 'fa-circle'} text-slate-400 text-xs w-4"></i>
          <span class="min-w-0 flex-1"><span class="text-slate-200 text-sm block truncate">${esc(r.title)}</span><span class="text-xs text-slate-500">${esc(r.type)} · ${esc(r.sub || '')}</span></span>
        </button>`).join('');
      box.querySelectorAll('.gs-result').forEach(btn => btn.addEventListener('click', () => {
        box.classList.add('hidden');
        document.getElementById('global-search').value = '';
        navigateTab(btn.dataset.tab);
        if (btn.dataset.type === 'lead') setTimeout(() => openLeadDetail(btn.dataset.id), 150);
      }));
    }
    box.classList.remove('hidden');
  } catch (err) { /* search optional */ }
}

/* ── Quick Add ───────────────────────────────────────────────────────────── */
function openQuickAdd() { document.getElementById('quick-add-menu').classList.remove('hidden'); }
function closeQuickAdd() { document.getElementById('quick-add-menu').classList.add('hidden'); }
function quickAddGoto(tab) {
  closeQuickAdd();
  navigateTab(tab);
  setTimeout(() => {
    if (tab === 'leads') document.getElementById('lead-add-btn')?.click();
    const firstInput = document.querySelector(`#tab-${tab} form input:not([type=hidden]), #tab-${tab} form select`);
    firstInput?.focus();
  }, 150);
}

/* ── Init ──────────────────────────────────────────────────────────────────── */
function bindEvents() {
  document.getElementById('logout-btn').addEventListener('click', logout);

  document.getElementById('scrape-toggle').addEventListener('click', () => {
    const body = document.getElementById('scrape-collapse');
    const chev = document.getElementById('scrape-chevron');
    body.classList.toggle('hidden');
    if (chev) chev.style.transform = body.classList.contains('hidden') ? '' : 'rotate(180deg)';
  });
  document.getElementById('scrape-form').addEventListener('submit', startScrape);
  document.getElementById('scrape-save-btn').addEventListener('click', saveScrapeResults);
  document.getElementById('lead-filter-btn').addEventListener('click', () => loadLeads(1));
  document.getElementById('lead-filter-reset').addEventListener('click', resetLeadFilters);
  ['lead-filter-status', 'lead-filter-phone', 'lead-filter-website', 'lead-filter-rating'].forEach(id =>
    document.getElementById(id).addEventListener('change', () => loadLeads(1)));
  document.getElementById('lead-filter-followup').addEventListener('change', () => loadLeads(1));
  document.getElementById('leads-prev').addEventListener('click', () => { if (leadsPage > 1) loadLeads(leadsPage - 1); });
  document.getElementById('leads-next').addEventListener('click', () => loadLeads(leadsPage + 1));
  document.getElementById('lead-add-btn').addEventListener('click', openLeadModal);
  document.getElementById('lead-modal-close').addEventListener('click', () => document.getElementById('lead-modal').classList.add('hidden'));
  document.getElementById('lead-form').addEventListener('submit', createLead);
  document.getElementById('lead-filter-q').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); loadLeads(1); } });
  document.getElementById('leads-select-all').addEventListener('change', e => {
    document.querySelectorAll('.lead-check').forEach(cb => {
      cb.checked = e.target.checked;
      if (e.target.checked) selectedLeads.set(cb.dataset.id, { name: cb.dataset.name, phone: cb.dataset.phone });
      else selectedLeads.delete(cb.dataset.id);
    });
    updateSelectionUI();
  });
  document.getElementById('leads-clear-sel').addEventListener('click', clearLeadSelection);
  document.getElementById('leads-to-outreach').addEventListener('click', () => navigateTab('outreach'));
  document.getElementById('lead-export-btn').addEventListener('click', exportLeads);

  // Folders
  document.getElementById('folder-add-btn').addEventListener('click', () => document.getElementById('folder-modal').classList.remove('hidden'));
  document.getElementById('folder-modal-close').addEventListener('click', () => document.getElementById('folder-modal').classList.add('hidden'));
  document.getElementById('folder-form').addEventListener('submit', createFolder);

  // Bulk actions
  document.getElementById('bulk-status-select').addEventListener('change', e => { if (e.target.value) { bulkLeadAction('status', e.target.value); e.target.value = ''; } });
  document.getElementById('bulk-folder-select').addEventListener('change', e => { if (e.target.value) { bulkLeadAction('move_folder', e.target.value); e.target.value = ''; } });
  document.getElementById('bulk-delete-btn').addEventListener('click', () => bulkLeadAction('delete'));

  // Lead detail modal
  document.getElementById('lead-detail-close').addEventListener('click', () => document.getElementById('lead-detail-modal').classList.add('hidden'));
  document.getElementById('ld-save').addEventListener('click', saveLeadDetail);
  document.getElementById('ld-note-add').addEventListener('click', addLeadNote);
  document.getElementById('ld-note-text').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addLeadNote(); } });

  // Expenses
  document.getElementById('expense-form').addEventListener('submit', createExpense);
  document.getElementById('expense-load-btn').addEventListener('click', loadExpenses);

  // Quotations
  document.getElementById('quotation-form').addEventListener('submit', createQuotation);
  document.getElementById('quote-add-item').addEventListener('click', addQuoteItem);
  document.querySelectorAll('.remove-quote-item').forEach(btn => btn.addEventListener('click', () => btn.closest('.quote-item')?.remove()));

  // Global search
  const gs = document.getElementById('global-search');
  gs.addEventListener('input', () => { clearTimeout(searchDebounce); searchDebounce = setTimeout(runGlobalSearch, 250); });
  document.addEventListener('click', e => {
    if (!e.target.closest('#global-search') && !e.target.closest('#global-search-results')) {
      document.getElementById('global-search-results').classList.add('hidden');
    }
  });

  // Quick add
  document.getElementById('quick-add-btn').addEventListener('click', openQuickAdd);
  document.getElementById('quick-add-close').addEventListener('click', closeQuickAdd);
  document.getElementById('quick-add-menu').addEventListener('click', e => { if (e.target.id === 'quick-add-menu') closeQuickAdd(); });
  document.querySelectorAll('.quick-add-item').forEach(btn => btn.addEventListener('click', () => quickAddGoto(btn.dataset.tab)));

  document.getElementById('city-search-btn').addEventListener('click', searchCity);
  document.getElementById('city-search-q').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); searchCity(); } });
  document.getElementById('areas-form').addEventListener('submit', loadAreas);
  document.getElementById('area-api-check-btn').addEventListener('click', checkAreaAPIStatus);

  document.getElementById('template-form').addEventListener('submit', saveTemplate);
  document.getElementById('tpl-reset').addEventListener('click', () => {
    document.getElementById('template-edit-id').value = '';
    document.getElementById('template-form').reset();
  });
  document.getElementById('campaign-form').addEventListener('submit', createCampaign);
  document.getElementById('campaign-lead-search').addEventListener('input', searchCampaignLeads);
  document.getElementById('campaign-clear-recipients').addEventListener('click', () => { selectedLeads.clear(); renderCampaignRecipients(); updateSelectionUI(); });
  document.getElementById('campaign-template').addEventListener('change', updateCampaignPreview);

  document.getElementById('meeting-form').addEventListener('submit', createMeeting);
  document.getElementById('task-form').addEventListener('submit', createTask);
  document.getElementById('employee-form').addEventListener('submit', createEmployee);
  document.getElementById('attendance-form').addEventListener('submit', uploadAttendance);
  document.getElementById('attendance-load-btn').addEventListener('click', loadAttendance);
  document.getElementById('leave-form').addEventListener('submit', applyLeave);
  document.getElementById('payroll-form').addEventListener('submit', runPayroll);
  document.getElementById('payroll-load-btn').addEventListener('click', loadPayroll);
  document.getElementById('holiday-form').addEventListener('submit', addHoliday);
  document.getElementById('invoice-form').addEventListener('submit', createInvoice);
  document.getElementById('invoice-add-item').addEventListener('click', addInvoiceItem);
  document.querySelectorAll('.remove-item').forEach(btn => btn.addEventListener('click', () => btn.closest('.invoice-item')?.remove()));
  document.getElementById('document-form').addEventListener('submit', uploadDocument);
  document.getElementById('doc-search-btn').addEventListener('click', () => loadDocuments(document.getElementById('doc-search').value.trim()));
  document.getElementById('qr-form').addEventListener('submit', generateQR);
  document.getElementById('qr-position').addEventListener('change', updateQRPreview);
  document.getElementById('qr-size').addEventListener('input', updateQRPreview);
  document.getElementById('qr-file').addEventListener('change', showQRFileName);

  document.getElementById('company-form').addEventListener('submit', createCompany);
  document.getElementById('company-search-btn').addEventListener('click', () => loadCompanies(document.getElementById('company-search-q').value.trim()));
  document.getElementById('company-search-q').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); loadCompanies(document.getElementById('company-search-q').value.trim()); } });

  document.getElementById('user-form').addEventListener('submit', createUser);
  document.getElementById('settings-form').addEventListener('submit', saveSettings);
  document.getElementById('analytics-refresh').addEventListener('click', loadAnalytics);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('current-date').textContent = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  if (window.Chart) {
    Chart.defaults.color = '#374151';
    Chart.defaults.borderColor = '#e5e7eb';
    Chart.defaults.font.family = 'inherit';
  }

  initNavigation();
  bindEvents();
  updateQRPreview();

  currentUser = { id: '000000000000000000000000', name: 'Admin', email: 'admin@recruitkr.com', role: 'Admin' };
  showApp();
  loadSettings();          // cache business/integration settings for WhatsApp helpers
  navigateTab('dashboard');
});
