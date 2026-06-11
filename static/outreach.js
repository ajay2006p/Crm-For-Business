/* ── Outreach: templates, campaigns, area API ───────────────────────────── */

let templates = [];
let campaignRunning = false;
let campaignTimer = null;
let activeCampaign = null;
let selectedAreaCity = null;

/* ── Init hooks (called from main.js DOMContentLoaded) ───────────────────── */
function initOutreach() {
  loadTemplates();
  loadSettings();
  bindOutreachEvents();
  bindAreaEvents();
}

function bindOutreachEvents() {
  document.getElementById('btn-new-template')?.addEventListener('click', () => openTemplateModal(null));
  document.getElementById('btn-save-template')?.addEventListener('click', saveTemplateFromModal);
  document.getElementById('btn-save-settings')?.addEventListener('click', saveSettingsForm);
  document.getElementById('btn-preview-campaign')?.addEventListener('click', previewCampaign);
  document.getElementById('btn-start-campaign')?.addEventListener('click', startCampaign);
  document.getElementById('btn-stop-campaign')?.addEventListener('click', stopCampaign);
  document.getElementById('btn-bulk-outreach')?.addEventListener('click', () => {
    document.querySelector('.nav-item[data-tab="outreach"]')?.click();
    document.getElementById('campaign-target').value = 'selected';
  });
}

function bindAreaEvents() {
  document.getElementById('btn-search-city')?.addEventListener('click', searchCityApi);
  document.getElementById('area-search-city')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') searchCityApi();
  });
  document.getElementById('btn-use-city-scrape')?.addEventListener('click', useCityInScrape);
}

/* ── Templates ───────────────────────────────────────────────────────────── */
async function loadTemplates() {
  try {
    const r = await fetch('/api/templates');
    const d = await r.json();
    templates = d.templates || [];
    renderTemplateList();
    updateCampaignTemplateSelect();
  } catch (e) { toast('Could not load templates', 'error'); }
}

function renderTemplateList() {
  const el = document.getElementById('template-list');
  if (!el) return;
  if (!templates.length) {
    el.innerHTML = '<div class="empty-state">No templates yet</div>';
    return;
  }
  el.innerHTML = templates.map(t => `
    <div class="template-card" data-id="${t.id}">
      <div class="template-card-head">
        <strong>${esc(t.name)}</strong>
        <span class="channel-badge ${t.channel}">${t.channel}</span>
      </div>
      <pre class="template-preview">${esc(t.body.slice(0, 120))}${t.body.length > 120 ? '…' : ''}</pre>
      <div class="template-card-actions">
        <button class="btn-icon edit-tpl" data-id="${t.id}" title="Edit"><i class="fa-solid fa-pen"></i></button>
        <button class="btn-icon delete-tpl" data-id="${t.id}" title="Delete" style="color:var(--danger)"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`).join('');

  el.querySelectorAll('.edit-tpl').forEach(b =>
    b.addEventListener('click', () => openTemplateModal(b.dataset.id)));
  el.querySelectorAll('.delete-tpl').forEach(b =>
    b.addEventListener('click', () => deleteTemplate(b.dataset.id)));
}

function updateCampaignTemplateSelect() {
  const sel = document.getElementById('campaign-template');
  if (!sel) return;
  sel.innerHTML = templates.map(t =>
    `<option value="${t.id}">${esc(t.name)} (${t.channel})</option>`).join('');
}

function openTemplateModal(id) {
  const modal = document.getElementById('template-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  if (id) {
    const t = templates.find(x => x.id === id);
    if (!t) return;
    document.getElementById('template-modal-title').innerText = 'Edit Template';
    document.getElementById('template-edit-id').value = t.id;
    document.getElementById('template-edit-name').value = t.name;
    document.getElementById('template-edit-channel').value = t.channel;
    document.getElementById('template-edit-body').value = t.body;
  } else {
    document.getElementById('template-modal-title').innerText = 'New Template';
    document.getElementById('template-edit-id').value = '';
    document.getElementById('template-edit-name').value = '';
    document.getElementById('template-edit-channel').value = 'whatsapp';
    document.getElementById('template-edit-body').value = 'Hi {name},\n\n— {your_name}, {company}';
  }
}

function closeTemplateModal() {
  document.getElementById('template-modal').style.display = 'none';
}

async function saveTemplateFromModal() {
  const id = document.getElementById('template-edit-id').value;
  const entry = {
    id: id || 'tpl-' + Date.now(),
    name: document.getElementById('template-edit-name').value.trim() || 'Untitled',
    channel: document.getElementById('template-edit-channel').value,
    body: document.getElementById('template-edit-body').value,
  };
  if (id) {
    const idx = templates.findIndex(t => t.id === id);
    if (idx >= 0) templates[idx] = entry;
  } else {
    templates.push(entry);
  }
  await fetch('/api/templates', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templates }),
  });
  closeTemplateModal();
  renderTemplateList();
  updateCampaignTemplateSelect();
  toast('Template saved', 'success');
}

async function deleteTemplate(id) {
  if (!confirm('Delete this template?')) return;
  templates = templates.filter(t => t.id !== id);
  await fetch('/api/templates', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templates }),
  });
  renderTemplateList();
  updateCampaignTemplateSelect();
  toast('Template deleted', 'info');
}

/* ── Settings ────────────────────────────────────────────────────────────── */
async function loadSettings() {
  try {
    const r = await fetch('/api/settings');
    const d = await r.json();
    const s = d.settings || {};
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    set('set-your-name', s.your_name);
    set('set-company', s.company);
    set('set-country-code', s.default_country_code);
    set('set-twilio-sid', s.twilio_account_sid);
    set('set-twilio-from', s.twilio_from_number);
    if (s.whatsapp_delay_sec) {
      const delay = document.getElementById('campaign-delay');
      if (delay) delay.value = s.whatsapp_delay_sec;
    }
  } catch (e) {}
}

async function saveSettingsForm() {
  const body = {
    your_name: document.getElementById('set-your-name').value,
    company: document.getElementById('set-company').value,
    default_country_code: document.getElementById('set-country-code').value || '91',
    twilio_account_sid: document.getElementById('set-twilio-sid').value,
    twilio_auth_token: document.getElementById('set-twilio-token').value,
    twilio_from_number: document.getElementById('set-twilio-from').value,
    whatsapp_delay_sec: parseInt(document.getElementById('campaign-delay')?.value) || 3,
  };
  const r = await fetch('/api/settings', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (d.status === 'success') toast('Settings saved', 'success');
  else toast('Save failed', 'error');
}

/* ── Campaign ────────────────────────────────────────────────────────────── */
function getCampaignLeads() {
  const target = document.getElementById('campaign-target')?.value || 'all';
  const filtered = typeof getFilteredLeads === 'function' ? getFilteredLeads() : currentData;
  const withIdx = (row, i) => ({ ...row, _idx: row._idx !== undefined ? row._idx : i });

  if (target === 'selected') {
    const indices = [];
    document.querySelectorAll('#table-body input[type=checkbox]:checked').forEach(cb => {
      indices.push(parseInt(cb.dataset.idx));
    });
    return indices.map(i => withIdx(currentData[i], i)).filter(l => l.name !== undefined);
  }
  if (target === 'filtered') return filtered.map((row, i) => withIdx(row, row._idx ?? i));
  if (target === 'new') return currentData.map((l, i) => withIdx(l, i)).filter(l => (l.status || 'New') === 'New');
  if (target === 'no-website') return currentData.map((l, i) => withIdx(l, i)).filter(l => !l.website);
  return currentData.map((l, i) => withIdx(l, i));
}

async function previewCampaign() {
  const leads = getCampaignLeads();
  const tplId = document.getElementById('campaign-template')?.value;
  const lead = leads.find(l => l.phone_number) || leads[0] || currentData[0];
  if (!lead) { toast('No leads to preview', 'error'); return; }
  const tpl = templates.find(t => t.id === tplId);
  if (!tpl) { toast('Select a template', 'error'); return; }

  const r = await fetch('/api/messages/preview', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ template_body: tpl.body, lead }),
  });
  const d = await r.json();
  if (d.status === 'success') {
    alert('Preview for: ' + (lead.name || 'Lead') + '\n\n' + d.message);
  }
}

async function startCampaign() {
  if (campaignRunning) return;
  const leads = getCampaignLeads().filter(l => l.phone_number);
  if (!leads.length) { toast('No leads with phone numbers', 'error'); return; }

  const tplId = document.getElementById('campaign-template').value;
  const channel = document.getElementById('campaign-channel').value;
  const markContacted = document.getElementById('campaign-mark-contacted').checked;

  const r = await fetch('/api/messages/campaign', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leads, template_id: tplId, channel, mark_contacted: markContacted }),
  });
  const campaign = await r.json();
  if (campaign.status !== 'success') {
    toast(campaign.message || 'Campaign failed', 'error');
    return;
  }

  activeCampaign = campaign;
  campaignRunning = true;
  document.getElementById('btn-start-campaign').style.display = 'none';
  document.getElementById('btn-stop-campaign').style.display = 'inline-flex';
  document.getElementById('campaign-progress').style.display = '';
  logCampaign(`Campaign started: ${campaign.ready} messages via ${channel}`);

  if (channel === 'sms' && campaign.twilio_active) {
    await runTwilioCampaign(campaign);
  } else if (channel === 'whatsapp') {
    await runWhatsAppCampaign(campaign);
  } else {
    runCopyCampaign(campaign);
  }
}

async function runWhatsAppCampaign(campaign) {
  const delay = (parseInt(document.getElementById('campaign-delay').value) || 3) * 1000;
  const msgs = campaign.messages.filter(m => m.url);
  let i = 0;

  const sendNext = () => {
    if (!campaignRunning || i >= msgs.length) {
      finishCampaign(campaign, i);
      return;
    }
    const m = msgs[i];
    logCampaign(`[${i + 1}/${msgs.length}] Opening WhatsApp → ${m.name}`);
    window.open(m.url, '_blank');
    if (campaign.mark_contacted) markLeadContacted(m);
    i++;
    updateCampaignProgress(i, msgs.length);
    campaignTimer = setTimeout(sendNext, delay);
  };
  sendNext();
}

async function runTwilioCampaign(campaign) {
  const msgs = campaign.messages;
  for (let i = 0; i < msgs.length; i++) {
    if (!campaignRunning) break;
    const m = msgs[i];
    if (m.sent) {
      logCampaign(`✓ SMS sent to ${m.name}`);
      if (campaign.mark_contacted) markLeadContacted(m);
    } else {
      logCampaign(`✗ ${m.name}: ${m.error || 'failed'}`);
    }
    updateCampaignProgress(i + 1, msgs.length);
    await new Promise(r => setTimeout(r, 500));
  }
  finishCampaign(campaign, msgs.length);
}

function runCopyCampaign(campaign) {
  const text = campaign.messages.map(m =>
    `--- ${m.name} (${m.phone}) ---\n${m.message}\n`).join('\n');
  navigator.clipboard.writeText(text).then(() => {
    logCampaign(`Copied ${campaign.messages.length} messages to clipboard`);
    toast('All messages copied!', 'success');
  });
  finishCampaign(campaign, campaign.messages.length);
}

function markLeadContacted(msg) {
  const idx = msg._idx ?? currentData.findIndex(
    l => l.phone_number === msg.phone && l.name === msg.name);
  if (idx >= 0 && currentData[idx]) {
    currentData[idx].status = 'Contacted';
    if (typeof applyFilters === 'function') applyFilters();
  }
}

function updateCampaignProgress(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  document.getElementById('campaign-bar').style.width = pct + '%';
  document.getElementById('campaign-status-text').innerText = `${done} / ${total} (${pct}%)`;
}

function logCampaign(msg) {
  const el = document.getElementById('campaign-log');
  if (!el) return;
  const line = document.createElement('div');
  line.className = 'campaign-log-line';
  line.textContent = msg;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}

function stopCampaign() {
  campaignRunning = false;
  if (campaignTimer) clearTimeout(campaignTimer);
  logCampaign('[Stopped by user]');
  document.getElementById('btn-start-campaign').style.display = 'inline-flex';
  document.getElementById('btn-stop-campaign').style.display = 'none';
}

function finishCampaign(campaign, sent) {
  campaignRunning = false;
  document.getElementById('btn-start-campaign').style.display = 'inline-flex';
  document.getElementById('btn-stop-campaign').style.display = 'none';
  logCampaign(`✔ Campaign complete — ${sent} processed`);
  toast('Campaign finished!', 'success');
}

/* ── Area API ────────────────────────────────────────────────────────────── */
async function searchCityApi() {
  const q = document.getElementById('area-search-city').value.trim();
  if (!q) return;
  const resultsEl = document.getElementById('city-search-results');
  resultsEl.innerHTML = '<div class="empty-state">Searching…</div>';

  try {
    const r = await fetch(`/api/locations/search?q=${encodeURIComponent(q)}`);
    const d = await r.json();
    const results = d.results || [];
    if (!results.length) {
      resultsEl.innerHTML = '<div class="empty-state">No cities found. Try another name.</div>';
      return;
    }
    resultsEl.innerHTML = results.map((c, i) => `
      <button class="city-result-btn" data-i="${i}">
        <strong>${esc(c.display)}</strong>
        <small>${c.lat?.toFixed(2)}, ${c.lng?.toFixed(2)}</small>
      </button>`).join('');
    resultsEl._data = results;
    resultsEl.querySelectorAll('.city-result-btn').forEach(btn => {
      btn.addEventListener('click', () => loadAreasForCity(results[parseInt(btn.dataset.i)]));
    });
    if (results.length === 1) loadAreasForCity(results[0]);
  } catch (e) {
    resultsEl.innerHTML = `<div class="empty-state">Error: ${e.message}</div>`;
  }
}

async function loadAreasForCity(cityObj) {
  selectedAreaCity = cityObj;
  const tags = document.getElementById('area-tags');
  tags.innerHTML = '<div class="empty-state">Loading areas…</div>';
  document.getElementById('btn-use-city-scrape').disabled = true;

  try {
    const r = await fetch(
      `/api/locations/areas?city=${encodeURIComponent(cityObj.city)}` +
      `&country=${encodeURIComponent(cityObj.country)}` +
      `&state=${encodeURIComponent(cityObj.state || '')}`
    );
    const d = await r.json();
    const areas = d.areas || [];
    document.getElementById('area-count-badge').innerText = areas.length;

    if (!areas.length) {
      tags.innerHTML = '<div class="empty-state">No areas found for this city</div>';
      return;
    }

    tags.innerHTML = `
      <p class="area-meta">${d.total} areas (${d.local_count} built-in + ${d.api_count} from API)</p>
      <div class="area-tag-grid">${areas.map(a =>
        `<span class="area-tag">${esc(a)}</span>`).join('')}</div>`;
    document.getElementById('btn-use-city-scrape').disabled = false;
  } catch (e) {
    tags.innerHTML = `<div class="empty-state">Error: ${e.message}</div>`;
  }
}

function useCityInScrape() {
  if (!selectedAreaCity) return;
  document.getElementById('q-city').value = selectedAreaCity.city;
  setScope('city');
  document.querySelector('.nav-item[data-tab="new-job"]')?.click();
  toast(`City set to ${selectedAreaCity.city} — start scraping!`, 'success');
}

function goToOutreach() {
  document.querySelector('.nav-item[data-tab="outreach"]')?.click();
}

function goToLeads() {
  document.querySelector('.nav-item[data-tab="leads"]')?.click();
}
