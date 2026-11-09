const $ = (id) => document.getElementById(id);
const KEY = 'azzouz.live-studio.v1';
const defaults = { title: 'بث مباشر جديد', category: 'دردشة وترفيه', privacy: 'عام', latency: 'قياسية', scene: 'الكاميرا الرئيسية', duration: 60, checklist: {} };
const read = () => { try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...defaults }; } };
const save = (state) => localStorage.setItem(KEY, JSON.stringify(state));

export function initLiveStudio() {
  const root = $('liveStudio');
  if (!root) return;
  const state = read();
  const fields = ['liveTitle', 'liveCategory', 'livePrivacy', 'liveLatency', 'liveScene', 'liveDuration'];
  const render = () => {
    $('liveStudioStatus').textContent = state.title ? `جاهز: ${state.title}` : 'أدخل عنوان البث';
    fields.forEach((id) => { const key = id.replace('live', '').replace(/^./, (c) => c.toLowerCase()); if ($(id)) $(id).value = state[key]; });
    root.querySelectorAll('[data-check]').forEach((box) => { box.checked = Boolean(state.checklist[box.dataset.check]); });
    const done = Object.values(state.checklist).filter(Boolean).length;
    $('liveChecklistProgress').textContent = `${done}/4 مكتملة`;
  };
  $('liveStudioToggle').onclick = () => root.classList.toggle('hidden');
  fields.forEach((id) => { $(id).onchange = () => { const key = id.replace('live', '').replace(/^./, (c) => c.toLowerCase()); state[key] = $(id).value; save(state); render(); }; });
  root.querySelectorAll('[data-check]').forEach((box) => { box.onchange = () => { state.checklist[box.dataset.check] = box.checked; save(state); render(); }; });
  $('liveStudioCopy').onclick = async () => { const text = `إعداد بث TikTok LIVE\nالعنوان: ${state.title}\nالتصنيف: ${state.category}\nالخصوصية: ${state.privacy}\nزمن الاستجابة: ${state.latency}\nالمشهد: ${state.scene}\nالمدة المستهدفة: ${state.duration} دقيقة`; try { await navigator.clipboard.writeText(text); $('liveStudioStatus').textContent = 'تم نسخ إعدادات البث'; } catch { $('liveStudioStatus').textContent = 'حدّد النص وانسخه يدويًا'; } };
  $('liveStudioReset').onclick = () => { Object.assign(state, defaults); save(state); render(); };
  render();
}
