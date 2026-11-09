const $ = (id) => document.getElementById(id);
const KEY = 'azzouz.live-studio.v1';
const defaults = { title: 'بث مباشر جديد', category: 'دردشة وترفيه', privacy: 'عام', latency: 'قياسية', scene: 'الكاميرا الرئيسية', description: '', duration: 60, status: 'ready', checklist: {} };
const read = () => { try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...defaults }; } };
const save = (state) => localStorage.setItem(KEY, JSON.stringify(state));

export function initLiveStudio() {
  const root = $('liveStudio');
  if (!root) return;
  const state = read();
  const fields = ['liveTitle', 'liveCategory', 'livePrivacy', 'liveLatency', 'liveScene', 'liveDescription', 'liveDuration'];
  const render = () => {
    const statusLabel = state.status === 'onair' ? 'على الهواء — يدويًا' : state.status === 'ended' ? 'انتهى البث — يدويًا' : 'جاهز للإعداد'; $('liveStudioStatus').textContent = state.title ? `${statusLabel}: ${state.title}` : 'أدخل عنوان البث';
    fields.forEach((id) => { const key = id.replace('live', '').replace(/^./, (c) => c.toLowerCase()); if ($(id)) $(id).value = state[key]; });
    root.querySelectorAll('[data-check]').forEach((box) => { box.checked = Boolean(state.checklist[box.dataset.check]); });
    const done = Object.values(state.checklist).filter(Boolean).length;
    $('liveChecklistProgress').textContent = `${done}/4 مكتملة`; $('liveReadiness').textContent = `الجاهزية: ${done}/4 — ${done === 4 ? 'كل العناصر جاهزة للمراجعة النهائية' : 'أكمل قائمة الفحص قبل البدء'}`; root.querySelectorAll('[data-live-status]').forEach((button) => button.classList.toggle('active', button.dataset.liveStatus === state.status)); root.querySelectorAll('[data-scene]').forEach((button) => button.classList.toggle('active', button.dataset.scene === state.scene));
  };
  $('liveStudioToggle').onclick = () => root.classList.toggle('hidden');
  fields.forEach((id) => { $(id).onchange = () => { const key = id.replace('live', '').replace(/^./, (c) => c.toLowerCase()); state[key] = $(id).value; save(state); render(); }; });
  root.querySelectorAll('[data-check]').forEach((box) => { box.onchange = () => { state.checklist[box.dataset.check] = box.checked; save(state); render(); }; });
  root.querySelectorAll('[data-live-status]').forEach((button) => { button.onclick = () => { state.status = button.dataset.liveStatus; save(state); render(); }; });
  root.querySelectorAll('[data-scene]').forEach((button) => { button.onclick = () => { state.scene = button.dataset.scene; save(state); render(); }; });
  $('liveStudioCopy').onclick = async () => { const text = `إعداد بث TikTok LIVE\nالحالة اليدوية: ${state.status}\nالعنوان: ${state.title}\nالوصف: ${state.description || '—'}\nالتصنيف: ${state.category}\nالخصوصية: ${state.privacy}\nزمن الاستجابة: ${state.latency}\nالمشهد: ${state.scene}\nالمدة المستهدفة: ${state.duration} دقيقة`; try { await navigator.clipboard.writeText(text); $('liveStudioStatus').textContent = 'تم نسخ إعدادات البث'; } catch { $('liveStudioStatus').textContent = 'حدّد النص وانسخه يدويًا'; } };
  $('liveStudioReset').onclick = () => { Object.assign(state, defaults); save(state); render(); };
  render();
}
