const STORAGE_KEY = 'azzouz.coin-tracker.v1';

const DEFAULT_STATE = {
  interval: 20 * 60,
  remaining: 20 * 60,
  running: false,
  selectedDay: 'today',
  target: 1000,
  sessions: [],
  settings: { notifications: false }
};

const $ = (id) => document.getElementById(id);
const todayKey = () => new Date().toISOString().slice(0, 10);
const formatDate = (key) => {
  if (key === 'today' || key === todayKey()) return 'اليوم';
  try { return new Date(`${key}T12:00:00`).toLocaleDateString('ar-MA', { day: 'numeric', month: 'short' }); }
  catch { return key; }
};
const formatTime = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
const escapeHtml = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const icon = (name) => {
  const paths = {
    check: '<path d="M19.3 5.9 10 15.2l-4.3-4.3-1.4 1.4 5.7 5.7L20.7 7.3z"/>',
    history: '<path d="M12 5a7 7 0 1 1-6.2 3.8H3.5A9 9 0 1 0 12 3c-2.3 0-4.4.9-6 2.4V3H4v6h6V7.2H7.4A7 7 0 0 1 12 5Z"/><path d="M11.1 7.2h1.8v5l3.1 1.8-.9 1.5-4-2.4z"/>',
    play: '<path d="M7.7 3.1a1.5 1.5 0 0 1 1.6.1l8.6 7.3a1.9 1.9 0 0 1 0 3l-8.6 7.3A1.5 1.5 0 0 1 6.8 19V5a1.5 1.5 0 0 1 .9-1.9Z"/>',
    pause: '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>',
    empty: '<rect x="4" y="4" width="16" height="16" rx="3"/>',
    selected: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 2.5 2.5L16.5 8.5"/>'
  };
  return `<svg class="coin-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[name] || paths.empty}</svg>`;
};

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { ...DEFAULT_STATE, ...saved, settings: { ...DEFAULT_STATE.settings, ...(saved.settings || {}) }, sessions: Array.isArray(saved.sessions) ? saved.sessions : [] };
  } catch { return { ...DEFAULT_STATE, settings: { ...DEFAULT_STATE.settings }, sessions: [] }; }
}

export function initCoinWidget() {
  const root = $('coinWidget');
  if (!root) return;
  let state = loadState();
  let timer = null;

  const persist = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  const daySessions = () => state.sessions.filter((item) => item.day === (state.selectedDay === 'today' ? todayKey() : state.selectedDay));
  const allToday = () => state.sessions.filter((item) => item.day === todayKey());
  const totalCoins = (items) => items.reduce((sum, item) => sum + Number(item.coins || 0), 0);
  const totalMinutes = (items) => items.reduce((sum, item) => sum + Number(item.minutes || 0), 0);
  const dateKeyOffset = (offset) => { const date = new Date(); date.setHours(12, 0, 0, 0); date.setDate(date.getDate() - offset); return date.toISOString().slice(0, 10); };
  const sevenDayKeys = () => Array.from({ length: 7 }, (_, index) => dateKeyOffset(6 - index));

  function exportJson() {
    const backup = {
      app: 'azzouz-coin-tracker',
      version: 1,
      exportedAt: new Date().toISOString(),
      target: state.target,
      interval: state.interval,
      settings: { notifications: Boolean(state.settings.notifications) },
      sessions: state.sessions
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `azzouz-coin-log-${todayKey()}.json`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportCsv() {
    const escapeCsv = (value) => { const text = String(value ?? ''); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
    const rows = [['day', 'time', 'coins', 'minutes', 'note'], ...state.sessions.map(item => [item.day, item.time, item.coins, item.minutes, item.note || ''])];
    const csv = '\ufeff' + rows.map(row => row.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = `azzouz-coin-log-${todayKey()}.csv`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function validateBackup(data) {
    if (!data || typeof data !== 'object' || (data.app && data.app !== 'azzouz-coin-tracker') || (data.version && data.version !== 1) || !Array.isArray(data.sessions) || data.sessions.length > 5000) return null;
    const sessions = data.sessions.map((item, index) => {
      if (!item || typeof item !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(String(item.day || ''))) throw new Error(`سجل غير صالح رقم ${index + 1}`);
      const coins = Number(item.coins), minutes = Number(item.minutes);
      if (!Number.isFinite(coins) || coins < 0 || !Number.isFinite(minutes) || minutes < 0) throw new Error(`قيم غير صالحة في السجل رقم ${index + 1}`);
      return { id: String(item.id || `${Date.now()}-${index}`), day: String(item.day), time: String(item.time || '--:--').slice(0, 20), coins, minutes, note: String(item.note || '').slice(0, 60), createdAt: Number.isFinite(Number(item.createdAt)) ? Number(item.createdAt) : Date.now() + index };
    });
    const target = Math.max(0, Number(data.target ?? 1000));
    const interval = [600, 1200, 1800, 3600].includes(Number(data.interval)) ? Number(data.interval) : 1200;
    if (!Number.isFinite(target)) throw new Error('الهدف اليومي غير صالح');
    return { sessions, target, interval, settings: { notifications: Boolean(data.settings?.notifications) } };
  }

  async function importJson(file) {
    try {
      const data = JSON.parse(await file.text());
      const imported = validateBackup(data);
      if (!imported) throw new Error('هذا الملف ليس نسخة صالحة من سجل العملات.');
      if (!confirm(`سيتم استبدال السجل الحالي بـ ${imported.sessions.length} دورة. هل تريد المتابعة؟`)) return;
      state.running = false; stopTimer(); state.sessions = imported.sessions; state.target = imported.target; state.interval = imported.interval; state.remaining = imported.interval; state.selectedDay = 'today'; state.settings = imported.settings;
      persist(); render();
    } catch (error) { alert(`تعذر استيراد الملف: ${error.message || 'ملف غير صالح'}`); }
  }

  function renderDays() {
    const days = ['today', ...[...new Set(state.sessions.map((item) => item.day))].filter((day) => day !== todayKey()).sort().reverse().slice(0, 6)];
    $('coinDays').innerHTML = days.map((day) => `<button class="coin-day ${state.selectedDay === day ? 'on' : ''}" data-day="${day}">${icon(state.selectedDay === day ? 'selected' : 'empty')}${formatDate(day)}</button>`).join('');
    $('coinDays').querySelectorAll('[data-day]').forEach((button) => button.onclick = () => { state.selectedDay = button.dataset.day; persist(); render(); });
  }

  function renderStats() {
    const today = allToday();
    $('coinToday').textContent = totalCoins(today).toLocaleString('ar-MA');
    $('coinSessions').textContent = today.length.toLocaleString('ar-MA');
    $('coinMinutes').textContent = totalMinutes(today).toLocaleString('ar-MA');
    $('coinTargetText').textContent = `${totalCoins(today).toLocaleString('ar-MA')} / ${Number(state.target || 0).toLocaleString('ar-MA')}`;
    $('coinProgress').style.width = `${Math.min(100, state.target ? (totalCoins(today) / state.target) * 100 : 0)}%`;
  }

  function renderList() {
    const items = daySessions().sort((a, b) => b.createdAt - a.createdAt);
    $('coinList').innerHTML = items.length ? items.map((item) => `<article class="coin-entry"><div class="coin-entry-main"><b>+${Number(item.coins || 0).toLocaleString('ar-MA')} عملة</b><span>${item.time} · ${item.minutes} دقيقة${item.note ? ` · ${escapeHtml(item.note)}` : ''}</span></div><button class="coin-delete" data-delete="${item.id}" aria-label="حذف السجل">×</button></article>`).join('') : '<div class="coin-empty">لا توجد دورات مسجلة لهذا اليوم. ابدأ المؤقت وسجّل ما جمعته يدويًا.</div>';
    $('coinList').querySelectorAll('[data-delete]').forEach((button) => button.onclick = () => { state.sessions = state.sessions.filter((item) => item.id !== button.dataset.delete); persist(); render(); });
  }

  function renderAnalytics() {
    const keys = sevenDayKeys();
    const daily = keys.map(day => ({ day, items: state.sessions.filter(item => item.day === day) }));
    const totals = daily.map(row => totalCoins(row.items));
    const weekCoins = totals.reduce((sum, value) => sum + value, 0);
    const weekSessions = daily.reduce((sum, row) => sum + row.items.length, 0);
    const bestIndex = totals.indexOf(Math.max(...totals));
    let streak = 0;
    for (let index = keys.length - 1; index >= 0 && totals[index] > 0; index -= 1) streak += 1;
    const max = Math.max(1, ...totals);
    $('coinAnalyticsBody').innerHTML = `<div class="analytics-cards"><div class="analytics-card"><b>${weekCoins.toLocaleString('ar-MA')}</b><span>عملات الأسبوع</span></div><div class="analytics-card"><b>${weekSessions.toLocaleString('ar-MA')}</b><span>دورات الأسبوع</span></div><div class="analytics-card"><b>${Math.round(weekCoins / 7).toLocaleString('ar-MA')}</b><span>متوسط يومي</span></div><div class="analytics-card"><b>${streak.toLocaleString('ar-MA')}</b><span>سلسلة أيام</span></div></div><div class="analytics-bars">${daily.map((row, index) => `<div class="analytics-bar" title="${formatDate(row.day)}: ${totals[index]} عملة"><span>${totals[index] ? totals[index].toLocaleString('ar-MA') : ''}</span><i style="height:${Math.max(4, Math.round((totals[index] / max) * 52))}px"></i><b>${index === 6 ? 'اليوم' : formatDate(row.day)}</b></div>`).join('')}</div><div class="analytics-empty">أفضل يوم: ${totals[bestIndex] ? `${formatDate(daily[bestIndex].day)} · ${totals[bestIndex].toLocaleString('ar-MA')} عملة` : 'لا توجد بيانات بعد'}</div>`;
  }

  function render() {
    $('coinCd').textContent = formatTime(state.remaining);
    $('coinState').textContent = state.running ? 'المؤقت يعمل · اجمع يدويًا' : (state.remaining === 0 ? 'انتهت الدورة · سجّل ما جمعت' : 'جاهز للتجميع اليدوي');
    $('coinPlay').innerHTML = `${icon(state.running ? 'pause' : 'play')}${state.running ? 'إيقاف مؤقت' : 'بدء الدورة'}`;
    $('coinReset').innerHTML = `${icon('history')}إعادة`;
    $('coinDone').innerHTML = `${icon('check')}تمّت`;
    $('coinListTitle').innerHTML = `${icon('history')}السجل اليدوي`;
    $('coinPlay').classList.toggle('active', state.running);
    $('coinTimerCard').classList.toggle('running', state.running);
    $('coinInterval').querySelectorAll('[data-seconds]').forEach((button) => { const selected = Number(button.dataset.seconds) === state.interval; button.classList.toggle('on', selected); button.innerHTML = `${icon(selected ? 'selected' : 'empty')}${button.dataset.label}`; });
    $('coinTarget').value = state.target || 1000;
    $('coinNotify').checked = Boolean(state.settings.notifications);
    renderDays(); renderStats(); renderAnalytics(); renderList();
  }

  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
  function startTimer() {
    stopTimer(); state.running = true;
    timer = setInterval(() => {
      if (state.remaining > 0) state.remaining -= 1;
      if (state.remaining === 0) { state.running = false; stopTimer(); if (state.settings.notifications && 'Notification' in window && Notification.permission === 'granted') new Notification('انتهت دورة العملات', { body: 'سجّل العملات التي جمعتها يدويًا.' }); }
      persist(); render();
    }, 1000);
    persist(); render();
  }

  $('coinPlay').onclick = () => state.running ? (state.running = false, stopTimer(), persist(), render()) : startTimer();
  $('coinReset').onclick = () => { state.running = false; stopTimer(); state.remaining = state.interval; persist(); render(); };
  $('coinDone').onclick = () => {
    const coins = Number($('coinAmount').value || 0);
    if (!coins || coins < 0) { $('coinAmount').focus(); $('coinAmount').setCustomValidity('أدخل عدد العملات'); $('coinAmount').reportValidity(); $('coinAmount').setCustomValidity(''); return; }
    const minutes = Math.max(1, Math.round((state.interval - state.remaining) / 60));
    state.sessions.push({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, day: todayKey(), time: new Date().toLocaleTimeString('ar-MA', { hour: '2-digit', minute: '2-digit' }), coins, minutes, note: $('coinNote').value.trim(), createdAt: Date.now() });
    state.running = false; stopTimer(); state.remaining = state.interval; $('coinAmount').value = ''; $('coinNote').value = ''; persist(); render();
  };
  $('coinInterval').querySelectorAll('[data-seconds]').forEach((button) => button.onclick = () => { state.interval = Number(button.dataset.seconds); state.remaining = state.interval; state.running = false; stopTimer(); persist(); render(); });
  $('coinTarget').onchange = () => { state.target = Math.max(0, Number($('coinTarget').value || 0)); persist(); renderStats(); };
  $('coinNotify').onchange = async () => { state.settings.notifications = $('coinNotify').checked; if (state.settings.notifications && 'Notification' in window && Notification.permission === 'default') { const permission = await Notification.requestPermission(); state.settings.notifications = permission === 'granted'; } persist(); render(); };
  $('coinExport').onclick = exportJson;
  $('coinExportCsv').onclick = exportCsv;
  $('coinAnalyticsToggle').onclick = () => { const panel = $('coinAnalytics'); const collapsed = panel.classList.toggle('collapsed'); $('coinAnalyticsToggle').textContent = collapsed ? '⌄ فتح' : '⌃ إخفاء'; };
  $('coinImport').onclick = () => $('coinImportInput').click();
  $('coinImportInput').onchange = async (event) => { const file = event.target.files?.[0]; if (file) await importJson(file); event.target.value = ''; };
  $('coinClear').onclick = () => { if (state.sessions.length && confirm('حذف كل سجل العملات؟')) { state.sessions = []; persist(); render(); } };
  $('coinToggle').onclick = () => { root.classList.toggle('collapsed'); $('coinToggle').setAttribute('aria-expanded', String(!root.classList.contains('collapsed'))); };

  window.addEventListener('floating-manual-entry', (event) => { const coins = Number(event.detail?.coins || 0); if (!coins) return; $('coinAmount').value = coins; $('coinNote').value = String(event.detail?.note || 'تسجيل من الأداة العائمة').slice(0, 60); $('coinAmount').focus(); document.getElementById('coinWidget')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  window.addEventListener('beforeunload', stopTimer);
  render();
}
