/* =========================================================
   AGENT CALENDAR — CLIENT APPLICATION LOGIC
========================================================= */

const $ = id => document.getElementById(id);

const esc = s =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const pad = n => String(n).padStart(2, '0');
const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const userTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

// Safe markdown: raw HTML is escaped, images dropped, only http(s)/mailto links kept.
function renderMarkdown(text) {
  if (typeof marked === 'undefined') return esc(text);
  try {
    marked.use({
      renderer: {
        html(token) {
          return esc(typeof token === 'string' ? token : token.text);
        },
        image() {
          return '';
        },
        link(a, b, c) {
          const href = typeof a === 'object' ? a.href : a;
          const label = typeof a === 'object' ? this.parser.parseInline(a.tokens) : c;
          if (!/^(https?:|mailto:)/i.test(href || '')) return label;
          return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
        }
      }
    });
    return marked.parse(text);
  } catch {
    return esc(text);
  }
}

const SVG_ICONS = {
  meeting: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  gym: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 5v14M18 5v14M2 9v6M22 9v6M6 12h12"/></svg>`,
  travel: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>`,
  review: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
  work: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  default: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`
};

function pickIconSvg(title) {
  const lower = title.toLowerCase();
  if (lower.includes('gym') || lower.includes('workout')) return SVG_ICONS.gym;
  if (lower.includes('sync') || lower.includes('meeting') || lower.includes('college')) return SVG_ICONS.meeting;
  if (lower.includes('flight') || lower.includes('travel') || lower.includes('call')) return SVG_ICONS.travel;
  if (lower.includes('review') || lower.includes('report') || lower.includes('demo')) return SVG_ICONS.review;
  if (lower.includes('deep') || lower.includes('work')) return SVG_ICONS.work;
  return SVG_ICONS.default;
}

function pickColor(title) {
  const lower = title.toLowerCase();
  if (lower.includes('gym') || lower.includes('workout')) return 'pill-green';
  if (lower.includes('college') || lower.includes('sync') || lower.includes('meeting')) return 'pill-blue';
  if (lower.includes('flight') || lower.includes('call') || lower.includes('travel')) return 'pill-coral';
  if (lower.includes('report') || lower.includes('event')) return 'pill-purple';
  return 'pill-orange';
}

function fmtTime(dt) {
  return new Date(dt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
}

function fmtTimeRange(start, end) {
  return `${fmtTime(start)} – ${fmtTime(end)}`;
}

let currentDate = new Date();
let allEvents = [];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/* Group events by local day. Multi-day events appear on every day they cover. */
function eventsByDay(events) {
  const map = {};
  events.forEach(ev => {
    const s = new Date(ev.startTime);
    const e = new Date(ev.endTime);
    const last = e > s ? new Date(e.getTime() - 1) : s; // an event ending exactly at midnight stays on its last day
    const cursor = new Date(s.getFullYear(), s.getMonth(), s.getDate());
    let first = true;
    let guard = 0;
    while (cursor <= last && guard++ < 62) {
      const key = dayKey(cursor);
      (map[key] = map[key] || []).push({ ev, first });
      first = false;
      cursor.setDate(cursor.getDate() + 1);
    }
  });
  Object.values(map).forEach(list => list.sort((a, b) => new Date(a.ev.startTime) - new Date(b.ev.startTime)));
  return map;
}

/* =========================================================
   1. LIVE DESK TICKER CLOCK
========================================================= */
function startDeskTicker() {
  const dateEl = $('ticker-date');
  const timeEl = $('ticker-time');

  function update() {
    const now = new Date();
    if (dateEl) {
      dateEl.textContent = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    }
    if (timeEl) {
      timeEl.textContent = now.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    }
  }

  update();
  setInterval(update, 1000);
}

/* =========================================================
   2. CALENDAR RENDERING
========================================================= */
function renderCalendar(events) {
  const grid = $('calendar-grid');
  if (!grid) return;

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  $('cal-month-label').textContent = `${MONTHS[month]} ${year}`;

  const byDay = eventsByDay(events);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const todayStr = dayKey(new Date());

  const rows = Math.ceil((firstDay + daysInMonth) / 7);
  grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

  let html = '';

  for (let i = firstDay - 1; i >= 0; i--) {
    html += `<div class="cell other-month"><div class="cell-top-bar"><div class="cell-num">${daysInPrevMonth - i}</div></div></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${pad(month + 1)}-${pad(d)}`;
    const isToday = key === todayStr;
    const dayEvents = byDay[key] || [];
    const maxVisible = 2;

    let evHtml = '';
    dayEvents.slice(0, maxVisible).forEach(({ ev, first }) => {
      evHtml += `
        <div class="event-pill ${pickColor(ev.title)}" title="${esc(ev.title)} (${esc(fmtTimeRange(ev.startTime, ev.endTime))})">
          <div class="pill-title-row">
            <span class="pill-icon">${pickIconSvg(ev.title)}</span>
            <span>${esc(ev.title)}</span>
          </div>
          <span class="pill-time-label">${first ? esc(fmtTime(ev.startTime)) : 'continues'}</span>
        </div>
      `;
    });

    if (dayEvents.length > maxVisible) {
      evHtml += `<div class="more-badge">+${dayEvents.length - maxVisible} more</div>`;
    }

    html += `
      <div class="cell${isToday ? ' today-cell' : ''}" data-date="${key}">
        <div class="cell-top-bar"><div class="cell-num">${d}</div></div>
        ${evHtml}
      </div>
    `;
  }

  const totalCells = firstDay + daysInMonth;
  const trailing = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let d = 1; d <= trailing; d++) {
    html += `<div class="cell other-month"><div class="cell-top-bar"><div class="cell-num">${d}</div></div></div>`;
  }

  grid.innerHTML = html;
}

$('calendar-grid').addEventListener('click', e => {
  const cell = e.target.closest('[data-date]');
  if (cell) openDayDrawer(cell.dataset.date);
});

$('prev-month-btn').addEventListener('click', () => {
  currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
  renderCalendar(allEvents);
});

$('next-month-btn').addEventListener('click', () => {
  currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
  renderCalendar(allEvents);
});

$('today-btn').addEventListener('click', () => {
  currentDate = new Date();
  renderCalendar(allEvents);
});

/* =========================================================
   3. DAY AGENDA DRAWER
========================================================= */
const dayDrawer = $('day-drawer');

function openDayDrawer(dateKey) {
  const parts = dateKey.split('-');
  const dObj = new Date(parts[0], parts[1] - 1, parts[2]);
  $('drawer-date-title').textContent = dObj.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  const dayEvents = (eventsByDay(allEvents)[dateKey] || []).map(x => x.ev);
  $('drawer-event-count').textContent = `${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'} scheduled`;

  const listEl = $('drawer-events-list');
  if (dayEvents.length === 0) {
    listEl.innerHTML = `<p style="font-size: 13.5px; color: var(--text-muted); text-align: center; margin-top: 28px;">No events on this day. You are free!</p>`;
  } else {
    listEl.innerHTML = dayEvents.map(ev => `
      <div class="drawer-event-card">
        <div>
          <div class="drawer-event-title">
            <span class="pill-icon" style="width:14px;height:14px;">${pickIconSvg(ev.title)}</span>
            <span>${esc(ev.title)}</span>
          </div>
          <div class="drawer-event-time">${esc(fmtTime(ev.startTime))} – ${esc(fmtTime(ev.endTime))}</div>
          ${ev.location ? `<div class="drawer-event-time">Where: ${esc(ev.location)}</div>` : ''}
          ${ev.notes ? `<div class="drawer-event-time">Notes: ${esc(ev.notes)}</div>` : ''}
        </div>
        <button class="btn-del" data-del-id="${esc(ev.id)}">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
          Delete
        </button>
      </div>
    `).join('');
  }

  dayDrawer.style.display = 'flex';
}

$('drawer-events-list').addEventListener('click', e => {
  const btn = e.target.closest('[data-del-id]');
  if (btn) deleteEventDirect(btn.dataset.delId);
});

$('drawer-close-btn').addEventListener('click', () => (dayDrawer.style.display = 'none'));
dayDrawer.addEventListener('click', e => {
  if (e.target === dayDrawer) dayDrawer.style.display = 'none';
});

async function deleteEventDirect(id) {
  const title = (allEvents.find(e => e.id === id) || {}).title;
  try {
    const res = await fetch(`/api/events/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok && data.success) {
      allEvents = data.events;
      renderCalendar(allEvents);
      dayDrawer.style.display = 'none';
      addMessage('assistant', title ? `Deleted **${title}** from your calendar.` : 'Deleted that event from your calendar.');
    } else {
      alert(data.error || 'Failed to delete event');
    }
  } catch (err) {
    alert('Failed to delete event');
  }
}

/* =========================================================
   4. CHAT WITH CONFIRMATION RECEIPT CARDS
========================================================= */
const chatBox = $('chat-box');
const userInput = $('user-input');
const sendBtn = $('send-btn');
const clearChatBtn = $('clear-chat-btn');

if (clearChatBtn) {
  clearChatBtn.addEventListener('click', async () => {
    clearChatBtn.disabled = true;
    try {
      const response = await fetch('/api/chat/clear', { method: 'POST' });
      if (!response.ok) throw new Error(`Failed to clear chat history (${response.status})`);

      const welcomeCard = chatBox.querySelector('.bot-welcome-card');
      chatBox.replaceChildren();
      if (welcomeCard) chatBox.appendChild(welcomeCard);
      addMessage('assistant', 'Conversation memory cleared. What would you like to schedule today?');
    } catch (error) {
      alert('Failed to clear chat');
    } finally {
      clearChatBtn.disabled = false;
    }
  });
}

function addMessage(sender, text) {
  const row = document.createElement('div');
  row.className = `message-row ${sender === 'user' ? 'user-row' : ''}`;

  if (sender === 'assistant') {
    const iconWrap = document.createElement('div');
    iconWrap.className = 'msg-badge-icon';
    iconWrap.innerHTML = `<img src="/calendar-agent-assets/calendar-agent-pfp.png" class="msg-avatar-pfp" alt="Copilot">`;
    row.appendChild(iconWrap);
  }

  const bubble = document.createElement('div');
  bubble.className = `message ${sender === 'user' ? 'user-bubble' : 'assistant-bubble'}`;

  if (sender === 'assistant') {
    bubble.innerHTML = renderMarkdown(text);
  } else {
    bubble.textContent = text;
  }

  row.appendChild(bubble);
  chatBox.appendChild(row);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function addConfirmationCard(text) {
  const card = document.createElement('div');
  card.className = 'confirmation-card';
  card.innerHTML = `
    <div class="receipt-header">
      <span class="receipt-badge">
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        CALENDAR RECEIPT
      </span>
      <span class="receipt-stamp">SAVED TO DISK</span>
    </div>
    <div class="receipt-divider"></div>
    <div class="conf-body">${renderMarkdown(text)}</div>
  `;
  chatBox.appendChild(card);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function showTyping() {
  const t = document.createElement('div');
  t.id = 'typing-indicator';
  t.className = 'typing-dots';
  t.innerHTML = '<div class="t-dot"></div><div class="t-dot"></div><div class="t-dot"></div>';
  chatBox.appendChild(t);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function hideTyping() {
  const el = $('typing-indicator');
  if (el) el.remove();
}

async function sendMessage(text) {
  text = text || userInput.value.trim();
  if (!text) return;

  addMessage('user', text);
  userInput.value = '';
  userInput.disabled = true;
  sendBtn.disabled = true;
  showTyping();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, timeZone: userTimeZone() })
    });
    const data = await res.json();
    hideTyping();

    if (!res.ok) {
      addMessage('assistant', data.error || 'Server error');
      return;
    }

    // Green card only when the server confirms something was really saved.
    if (Array.isArray(data.actions) && data.actions.length > 0) {
      addConfirmationCard(data.reply || '');
    } else {
      addMessage('assistant', data.reply || '');
    }

    if (data.events) {
      allEvents = data.events;
      renderCalendar(allEvents);
    }
  } catch (err) {
    hideTyping();
    addMessage('assistant', 'Could not reach the server.');
  } finally {
    userInput.disabled = false;
    sendBtn.disabled = false;
    userInput.focus();
  }
}

function quickAction(text) {
  userInput.value = text;
  sendMessage(text);
}

sendBtn.addEventListener('click', () => sendMessage());
userInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.isComposing) sendMessage();
});

/* =========================================================
   5. EXPORT .ICS
========================================================= */
const icsEscape = s =>
  String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

$('export-btn').addEventListener('click', async () => {
  try {
    const res = await fetch('/api/events');
    const events = await res.json();
    if (!events.length) {
      alert('No events to export.');
      return;
    }

    const fmt = dt => new Date(dt).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const stamp = fmt(Date.now());

    let ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Agent Calendar//EN\r\nCALSCALE:GREGORIAN\r\n`;
    events.forEach(ev => {
      ics += `BEGIN:VEVENT\r\nUID:${ev.id}@agentcal\r\nDTSTAMP:${stamp}\r\nSUMMARY:${icsEscape(ev.title)}\r\nDTSTART:${fmt(ev.startTime)}\r\nDTEND:${fmt(ev.endTime)}\r\n`;
      if (ev.location) ics += `LOCATION:${icsEscape(ev.location)}\r\n`;
      if (ev.notes) ics += `DESCRIPTION:${icsEscape(ev.notes)}\r\n`;
      ics += `END:VEVENT\r\n`;
    });
    ics += `END:VCALENDAR\r\n`;

    const blob = new Blob([ics], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'agent-calendar.ics';
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    alert('Failed to export events.');
  }
});

/* =========================================================
   6. SETTINGS MODAL & PRESETS
========================================================= */
const setupModal = $('setup-modal');
const modalProvider = $('modal-provider');
const modalApiKey = $('modal-api-key');
const modalBaseUrl = $('modal-base-url');
const modalModelSelect = $('modal-model-select');
const modalCustomModel = $('modal-custom-model');
const providerKeyHint = $('provider-key-hint');
const testConnectionBtn = $('test-connection-btn');
const testStatusBanner = $('test-status-banner');
const saveConfigBtn = $('save-config-btn');
let isAlreadyConfigured = false;

// NOTE: model IDs change often. Verify them against each provider's model list.
const PROVIDER_PRESETS = {
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    placeholder: 'gsk_...',
    hint: 'Get a free Groq key at <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" style="color: var(--orange)">console.groq.com/keys</a>',
    models: [
      { id: 'qwen/qwen-2.5-coder-32b', name: 'Qwen 2.5 Coder 32B (Recommended)' },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant (Fast)' },
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile' },
      { id: 'custom', name: 'Custom Model ID…' }
    ]
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    placeholder: 'sk-or-v1-...',
    hint: 'Get an OpenRouter key at <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" style="color: var(--orange)">openrouter.ai/keys</a>',
    models: [
      { id: 'openrouter/free', name: 'OpenRouter Free (Auto-router)' },
      { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (Free)' },
      { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (Free)' },
      { id: 'custom', name: 'Custom Model ID…' }
    ]
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    placeholder: 'AIzaSy...',
    hint: 'Get a Gemini API key at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style="color: var(--orange)">aistudio.google.com</a>',
    models: [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Recommended)' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
      { id: 'custom', name: 'Custom Model ID…' }
    ]
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    placeholder: 'sk-...',
    hint: 'Get an OpenAI key at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" style="color: var(--orange)">platform.openai.com</a>',
    models: [
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Fast & Cheap)' },
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'custom', name: 'Custom Model ID…' }
    ]
  },
  custom: {
    baseUrl: 'http://localhost:11434/v1',
    placeholder: 'ollama',
    hint: 'Local Ollama or custom endpoint',
    models: [
      { id: 'qwen2.5:7b', name: 'Qwen 2.5 7B' },
      { id: 'llama3.2', name: 'Llama 3.2' },
      { id: 'custom', name: 'Custom Model ID…' }
    ]
  }
};

function applyProviderPreset(pKey) {
  const preset = PROVIDER_PRESETS[pKey] || PROVIDER_PRESETS.groq;
  modalBaseUrl.value = preset.baseUrl;
  modalApiKey.placeholder = isAlreadyConfigured ? '•••••••• (Leave blank to keep key)' : preset.placeholder;
  providerKeyHint.innerHTML = preset.hint;
  modalModelSelect.innerHTML = preset.models.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
  modalCustomModel.style.display = 'none';
  modalCustomModel.value = '';
}

modalProvider.addEventListener('change', () => applyProviderPreset(modalProvider.value));

modalModelSelect.addEventListener('change', () => {
  if (modalModelSelect.value === 'custom') {
    modalCustomModel.style.display = 'block';
    modalCustomModel.focus();
  } else {
    modalCustomModel.style.display = 'none';
  }
});

function getSelectedModel() {
  return modalModelSelect.value === 'custom' ? modalCustomModel.value.trim() : modalModelSelect.value;
}

$('open-settings-btn').addEventListener('click', () => (setupModal.style.display = 'flex'));
$('close-modal-btn').addEventListener('click', () => (setupModal.style.display = 'none'));

async function checkConfigStatus() {
  try {
    const res = await fetch('/api/config/status');
    const data = await res.json();
    isAlreadyConfigured = Boolean(data.configured);

    if (data.baseUrl) {
      if (data.baseUrl.includes('openrouter')) modalProvider.value = 'openrouter';
      else if (data.baseUrl.includes('googleapis')) modalProvider.value = 'gemini';
      else if (data.baseUrl.includes('openai.com')) modalProvider.value = 'openai';
      else if (data.baseUrl.includes('11434')) modalProvider.value = 'custom';
      else modalProvider.value = 'groq';
    }
    applyProviderPreset(modalProvider.value);
    if (data.baseUrl) modalBaseUrl.value = data.baseUrl;

    if (data.model) {
      const hasOption = Array.from(modalModelSelect.options).some(o => o.value === data.model);
      if (hasOption) {
        modalModelSelect.value = data.model;
      } else {
        modalModelSelect.value = 'custom';
        modalCustomModel.style.display = 'block';
        modalCustomModel.value = data.model;
      }
    }
    if (!isAlreadyConfigured) setupModal.style.display = 'flex';
  } catch (err) {
    console.error('Config check failed', err);
  }
}

testConnectionBtn.addEventListener('click', async () => {
  const apiKey = modalApiKey.value.trim();
  const model = getSelectedModel();
  const baseUrl = modalBaseUrl.value.trim();

  testConnectionBtn.disabled = true;
  testConnectionBtn.textContent = 'Testing connection…';
  testStatusBanner.style.display = 'block';
  testStatusBanner.style.background = '#fef3c7';
  testStatusBanner.style.color = '#92400e';
  testStatusBanner.textContent = `Connecting to ${modalProvider.value.toUpperCase()}…`;

  try {
    const res = await fetch('/api/config/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, model, baseUrl })
    });
    const data = await res.json();
    testStatusBanner.style.background = data.success ? '#dcfce7' : '#fee2e2';
    testStatusBanner.style.color = data.success ? '#166534' : '#991b1b';
    testStatusBanner.textContent = data.message;
  } catch (err) {
    testStatusBanner.style.background = '#fee2e2';
    testStatusBanner.style.color = '#991b1b';
    testStatusBanner.textContent = 'Could not reach local server.';
  } finally {
    testConnectionBtn.disabled = false;
    testConnectionBtn.textContent = '⚡ Test Connection';
  }
});

saveConfigBtn.addEventListener('click', async () => {
  const apiKey = modalApiKey.value.trim();
  const model = getSelectedModel();
  const baseUrl = modalBaseUrl.value.trim();

  saveConfigBtn.disabled = true;
  saveConfigBtn.textContent = 'Saving…';

  try {
    const res = await fetch('/api/config/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, model, baseUrl })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save');

    isAlreadyConfigured = true;
    modalApiKey.value = '';
    setupModal.style.display = 'none';
    addMessage('assistant', `Connected with ${model}. Ready to schedule.`);
  } catch (err) {
    testStatusBanner.style.display = 'block';
    testStatusBanner.style.background = '#fee2e2';
    testStatusBanner.style.color = '#991b1b';
    testStatusBanner.textContent = err.message;
  } finally {
    saveConfigBtn.disabled = false;
    saveConfigBtn.textContent = 'Save & Connect';
  }
});

/* =========================================================
   7. INITIALIZATION
========================================================= */
async function init() {
  startDeskTicker();
  checkConfigStatus();
  try {
    const res = await fetch('/api/events');
    allEvents = await res.json();
  } catch {
    allEvents = [];
  }
  renderCalendar(allEvents);
}

init();