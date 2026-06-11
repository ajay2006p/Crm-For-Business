/* RecruitKr Business OS — SPA Application Logic */

const API_BASE = '';
const TOKEN_KEY = 'rk_jwt';
const USER_KEY = 'rk_user';

let currentUser = null;
let leadsPage = 1;
let scrapeJobId = null;
let scrapePollTimer = null;
let charts = {};
let templatesCache = {};

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
  document.getElementById('login-page').classList.remove('hidden');
  document.getElementById('main-app').classList.add('hidden');
}

function showApp() {
  document.getElementById('login-page').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
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
    leads: loadLeads,
    'area-api': checkAreaAPIStatus,
    outreach: () => { loadTemplates(); loadCampaigns(); },
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
    document.getElementById('stat-leads').textContent = data.total_leads ?? 0;
    document.getElementById('stat-contacted').textContent = data.contacted_leads ?? 0;
    document.getElementById('stat-meetings').textContent = data.meetings ?? 0;
    document.getElementById('stat-employees').textContent = data.employees ?? 0;
    document.getElementById('stat-payroll').textContent = fmtMoney(data.payroll_total);
    document.getElementById('stat-revenue').textContent = fmtMoney(data.revenue_total);

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
    ['stat-leads','stat-contacted','stat-meetings','stat-employees','stat-payroll','stat-revenue'].forEach(id => {
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
        data: { labels: ['No data'], datasets: [{ data: [1], backgroundColor: ['#334155'] }] },
        options: { plugins: { legend: { labels: { color: '#94a3b8' } } } },
      });
      return;
    }
    dashChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'] }],
      },
      options: { plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', padding: 12 } } } },
    });
  } catch { /* chart optional on dashboard */ }
}

/* ── Leads ─────────────────────────────────────────────────────────────────── */
async function loadLeads(page = leadsPage) {
  leadsPage = page;
  const params = new URLSearchParams({ page, limit: 50 });
  const q = document.getElementById('lead-filter-q')?.value?.trim();
  const status = document.getElementById('lead-filter-status')?.value;
  const city = document.getElementById('lead-filter-city')?.value?.trim();
  if (q) params.set('q', q);
  if (status) params.set('status', status);
  if (city) params.set('city', city);

  try {
    const res = await api(`/api/leads?${params}`);
    const leads = safeArr(res.leads);
    const total = res.total ?? leads.length;
    document.getElementById('leads-count').textContent = `${total} leads (page ${page})`;

    const tbody = document.getElementById('leads-tbody');
    if (!leads.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-slate-500 text-center py-6">No leads found</td></tr>';
      return;
    }
    tbody.innerHTML = leads.map(l => `
      <tr>
        <td class="font-medium text-white">${esc(l.name)}</td>
        <td>${esc(l.phone_number || '—')}</td>
        <td>${esc(l.city || '—')}</td>
        <td>${esc(l.area || '—')}</td>
        <td><span class="badge ${badgeClass(l.status)}">${esc(l.status || 'New')}</span></td>
        <td>${l.reviews_average != null ? esc(l.reviews_average) : '—'}</td>
        <td>
          <button class="btn-secondary text-xs copy-lead-id" data-id="${esc(l.id)}">Copy ID</button>
          <button class="btn-secondary text-xs delete-lead ml-1" data-id="${esc(l.id)}">Delete</button>
        </td>
      </tr>`).join('');

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

  setLoading(true, 'Starting scrape…');
  try {
    const res = await api('/api/leads/scrape', { method: 'POST', body });
    scrapeJobId = res.job_id;
    document.getElementById('scrape-status').classList.remove('hidden');
    document.getElementById('scrape-save-btn').classList.add('hidden');
    notify('Scrape job started', 'success');
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
      document.getElementById('scrape-progress-text').textContent =
        status === 'error'
          ? (lastLog || 'Scrape failed — check Playwright installation')
          : `${found} / ${target} found · ${res.current_area || ''}`;
      const pct = target ? Math.min(100, (found / target) * 100) : 0;
      document.getElementById('scrape-progress-bar').style.width = pct + '%';

      if (status === 'done' || status === 'completed' || status === 'error') {
        clearInterval(scrapePollTimer);
        if (found > 0) document.getElementById('scrape-save-btn').classList.remove('hidden');
        if (status === 'error') notify('Scrape finished with errors', 'warning');
        else notify(`Scrape complete: ${found} leads found`, 'success');
      }
    } catch { /* keep polling */ }
  }, 2500);
}

async function saveScrapeResults() {
  if (!scrapeJobId) return;
  setLoading(true, 'Saving leads…');
  try {
    const res = await api(`/api/leads/scrape/${scrapeJobId}/save`, { method: 'POST' });
    notify(`Saved ${res.inserted || 0} leads to database`, 'success');
    loadLeads();
  } catch (err) {
    notify(err.message, 'error');
  } finally {
    setLoading(false);
  }
}

async function createLead(e) {
  e.preventDefault();
  const form = document.getElementById('lead-form');
  if (!validateForm(form)) return;
  const data = formToObject(form);
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

async function createCampaign(e) {
  e.preventDefault();
  const form = document.getElementById('campaign-form');
  if (!validateForm(form)) return;

  const leadIds = document.getElementById('campaign-leads').value.split(',').map(s => s.trim()).filter(Boolean);
  if (!leadIds.length) {
    notify('Enter at least one lead ID', 'error');
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
    resultEl.innerHTML = `
      <p class="text-emerald-400 font-medium mb-2">Campaign ready: ${camp.ready || messages.length} messages</p>
      <div class="space-y-2 max-h-48 overflow-y-auto">${messages.slice(0, 10).map(m => `
        <div class="text-xs glass rounded p-2">
          <strong>${esc(m.name)}</strong> · ${esc(m.phone || '—')}
          ${m.url ? `<a href="${esc(m.url)}" target="_blank" class="text-indigo-400 ml-2">Open WhatsApp</a>` : ''}
        </div>`).join('')}</div>`;
    notify('Campaign created', 'success');
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
      tbody.innerHTML = '<tr><td colspan="4" class="text-center text-slate-500 py-4">No meetings</td></tr>';
      return;
    }
    tbody.innerHTML = meetings.map(m => `
      <tr>
        <td class="text-white">${esc(m.title)}</td>
        <td>${fmtDate(m.scheduled_at)}</td>
        <td><span class="badge ${badgeClass(m.status)}">${esc(m.status)}</span></td>
        <td class="text-slate-400">${esc(m.notes || '—')}</td>
      </tr>`).join('');
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
    tbody.innerHTML = tasks.map(t => `
      <tr>
        <td class="text-white">${esc(t.title)}</td>
        <td><span class="badge ${badgeClass(t.priority)}">${esc(t.priority)}</span></td>
        <td>${esc(t.due_date || '—')}</td>
        <td><span class="badge ${badgeClass(t.status)}">${esc(t.status || 'Open')}</span></td>
        <td><button class="btn-secondary text-xs complete-task" data-id="${esc(t.id)}">Complete</button></td>
      </tr>`).join('');

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
  const pad = 8;
  const positions = {
    'top-left': { top: pad, left: pad },
    'top-right': { top: pad, right: pad },
    'bottom-left': { bottom: pad, left: pad },
    'bottom-right': { bottom: pad, right: pad },
    center: { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
  };
  const pos = positions[position] || positions['bottom-right'];
  Object.assign(marker.style, pos);
  if (position === 'center') marker.style.transform = 'translate(-50%, -50%)';
  else marker.style.transform = '';
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
      data: { labels: ['No data'], datasets: [{ label, data: [0], backgroundColor: '#334155' }] },
      options: chartOptions(type),
    });
    return;
  }
  const colors = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];
  charts[id] = new Chart(ctx, {
    type,
    data: {
      labels,
      datasets: [{
        label,
        data,
        backgroundColor: type === 'line' ? 'rgba(99,102,241,0.2)' : colors.slice(0, labels.length),
        borderColor: type === 'line' ? '#6366f1' : undefined,
        fill: type === 'line',
        tension: 0.3,
      }],
    },
    options: chartOptions(type),
  });
}

function chartOptions(type) {
  return {
    responsive: true,
    plugins: { legend: { labels: { color: '#94a3b8' } } },
    scales: type === 'line' || type === 'bar' ? {
      x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } },
      y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } },
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

/* ── Init ──────────────────────────────────────────────────────────────────── */
function bindEvents() {
  document.getElementById('logout-btn').addEventListener('click', logout);

  document.getElementById('scrape-form').addEventListener('submit', startScrape);
  document.getElementById('scrape-save-btn').addEventListener('click', saveScrapeResults);
  document.getElementById('lead-filter-btn').addEventListener('click', () => loadLeads(1));
  document.getElementById('leads-prev').addEventListener('click', () => { if (leadsPage > 1) loadLeads(leadsPage - 1); });
  document.getElementById('leads-next').addEventListener('click', () => loadLeads(leadsPage + 1));
  document.getElementById('lead-add-btn').addEventListener('click', () => document.getElementById('lead-modal').classList.remove('hidden'));
  document.getElementById('lead-modal-close').addEventListener('click', () => document.getElementById('lead-modal').classList.add('hidden'));
  document.getElementById('lead-form').addEventListener('submit', createLead);

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

  document.getElementById('company-form').addEventListener('submit', createCompany);
  document.getElementById('company-search-btn').addEventListener('click', () => loadCompanies(document.getElementById('company-search-q').value.trim()));
  document.getElementById('company-search-q').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); loadCompanies(document.getElementById('company-search-q').value.trim()); } });

  document.getElementById('user-form').addEventListener('submit', createUser);
  document.getElementById('settings-form').addEventListener('submit', saveSettings);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('current-date').textContent = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  initNavigation();
  bindEvents();
  updateQRPreview();

  currentUser = { id: '000000000000000000000000', name: 'Admin', email: 'admin@recruitkr.com', role: 'Admin' };
  showApp();
  navigateTab('dashboard');
});
