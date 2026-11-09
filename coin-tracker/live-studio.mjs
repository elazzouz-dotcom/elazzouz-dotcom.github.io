const $ = (id) => document.getElementById(id);
const KEY = 'azzouz.live-studio.v1';
const defaults = { title: 'بث مباشر جديد', category: 'دردشة وترفيه', privacy: 'عام', latency: 'قياسية', scene: 'الكاميرا الرئيسية', description: '', duration: 60, status: 'ready', activeStart: null, sessions: [], checklist: {} };
const read = () => { try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...defaults }; } };
const save = (state) => localStorage.setItem(KEY, JSON.stringify(state));

export function initLiveStudio() {
  const root = $('liveStudio');
  if (!root) return;
  const state = read();
  let sessionTimer = null;
  const fields = ['liveTitle', 'liveCategory', 'livePrivacy', 'liveLatency', 'liveScene', 'liveDescription', 'liveDuration'];
  const render = () => {
    const statusLabel = state.status === 'onair' ? 'على الهواء — يدويًا' : state.status === 'ended' ? 'انتهى البث — يدويًا' : 'جاهز للإعداد'; $('liveStudioStatus').textContent = state.title ? `${statusLabel}: ${state.title}` : 'أدخل عنوان البث';
    fields.forEach((id) => { const key = id.replace('live', '').replace(/^./, (c) => c.toLowerCase()); if ($(id)) $(id).value = state[key]; });
    root.querySelectorAll('[data-check]').forEach((box) => { box.checked = Boolean(state.checklist[box.dataset.check]); });
    const done = Object.values(state.checklist).filter(Boolean).length;
    $('liveChecklistProgress').textContent = `${done}/4 مكتملة`; const elapsed = state.activeStart ? Math.max(0, Date.now() - Number(state.activeStart)) : 0; const fmt = (ms) => { const total = Math.floor(ms / 1000); return `${String(Math.floor(total / 3600)).padStart(2, '0')}:${String(Math.floor((total % 3600) / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`; }; $('liveSessionTimer').textContent = fmt(elapsed); $('liveSessionHistory').innerHTML = state.sessions?.length ? state.sessions.slice(0, 5).map((item) => `<div class="live-session-item">${item.date} · ${item.duration} · ${item.scene}</div>`).join('') : 'لا توجد جلسات محفوظة.'; $('liveReadiness').textContent = `الجاهزية: ${done}/4 — ${done === 4 ? 'كل العناصر جاهزة للمراجعة النهائية' : 'أكمل قائمة الفحص قبل البدء'}`; root.querySelectorAll('[data-live-status]').forEach((button) => button.classList.toggle('active', button.dataset.liveStatus === state.status)); root.querySelectorAll('[data-scene]').forEach((button) => button.classList.toggle('active', button.dataset.scene === state.scene));
  };
  $('liveStudioToggle').onclick = () => root.classList.toggle('hidden');
  fields.forEach((id) => { $(id).onchange = () => { const key = id.replace('live', '').replace(/^./, (c) => c.toLowerCase()); state[key] = $(id).value; save(state); render(); }; });
  root.querySelectorAll('[data-check]').forEach((box) => { box.onchange = () => { state.checklist[box.dataset.check] = box.checked; save(state); render(); }; });
  root.querySelectorAll('[data-live-status]').forEach((button) => { button.onclick = () => { state.status = button.dataset.liveStatus; save(state); render(); }; });
  root.querySelectorAll('[data-scene]').forEach((button) => { button.onclick = () => { state.scene = button.dataset.scene; save(state); render(); }; });
  $('liveStudioCopy').onclick = async () => { const text = `إعداد بث TikTok LIVE\nالحالة اليدوية: ${state.status}\nالعنوان: ${state.title}\nالوصف: ${state.description || '—'}\nالتصنيف: ${state.category}\nالخصوصية: ${state.privacy}\nزمن الاستجابة: ${state.latency}\nالمشهد: ${state.scene}\nالمدة المستهدفة: ${state.duration} دقيقة`; try { await navigator.clipboard.writeText(text); $('liveStudioStatus').textContent = 'تم نسخ إعدادات البث'; } catch { $('liveStudioStatus').textContent = 'حدّد النص وانسخه يدويًا'; } };
  $('liveSessionStart').onclick = () => { if (state.activeStart) return; state.activeStart = Date.now(); state.status = 'onair'; save(state); render(); sessionTimer = setInterval(render, 1000); };
  $('liveSessionEnd').onclick = () => { if (!state.activeStart) return; const durationMs = Math.max(0, Date.now() - Number(state.activeStart)); const total = Math.floor(durationMs / 1000); const duration = `${String(Math.floor(total / 3600)).padStart(2, '0')}:${String(Math.floor((total % 3600) / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`; state.sessions = [{ date: new Date().toLocaleString('ar-MA'), duration, scene: state.scene }, ...(state.sessions || [])].slice(0, 10); state.activeStart = null; state.status = 'ended'; save(state); if (sessionTimer) clearInterval(sessionTimer); sessionTimer = null; render(); };
  $('liveStudioReset').onclick = () => { if (sessionTimer) clearInterval(sessionTimer); sessionTimer = null; Object.assign(state, defaults); save(state); render(); };
  render();
  if (state.activeStart) sessionTimer = setInterval(render, 1000);
}
