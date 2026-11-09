const $ = (id) => document.getElementById(id);
const KEY = 'azzouz.floating-helper.v1';
const read = () => { try { return { target: Number(JSON.parse(localStorage.getItem(KEY) || '{}').target) || 1133, seconds: Number(JSON.parse(localStorage.getItem(KEY) || '{}').seconds) || 1200 }; } catch { return { target: 1133, seconds: 1200 }; } };
const format = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

export function initFloatingHelper() {
  const root = $('floatingHelper');
  if (!root) return;
  let state = read();
  let remaining = state.seconds;
  let running = false;
  let timer = null;
  const persist = () => localStorage.setItem(KEY, JSON.stringify({ target: state.target, seconds: state.seconds }));
  const render = () => {
    $('floatingCountdown').textContent = format(remaining);
    $('floatingState').textContent = running ? 'المؤقت يعمل · المتابعة يدوية' : (remaining === 0 ? 'انتهت الدورة · سجّل يدويًا' : 'جاهز');
    $('floatingStart').textContent = running ? 'إيقاف' : 'بدء';
    $('floatingTarget').value = state.target;
  };
  const stop = () => { if (timer) clearInterval(timer); timer = null; };
  $('floatingOpen').onclick = () => { root.classList.toggle('open'); $('floatingOpen').setAttribute('aria-expanded', String(root.classList.contains('open'))); };
  $('floatingClose').onclick = () => { root.classList.remove('open'); $('floatingOpen').setAttribute('aria-expanded', 'false'); };
  $('floatingStart').onclick = () => {
    if (running) { running = false; stop(); render(); return; }
    running = true; stop();
    timer = setInterval(() => { remaining = Math.max(0, remaining - 1); if (!remaining) { running = false; stop(); if ('Notification' in window && Notification.permission === 'granted') new Notification('انتهت دورة المتابعة', { body: 'ارجع إلى الأداة وسجّل العملات أو الصندوق يدويًا.' }); } render(); }, 1000);
    render();
  };
  $('floatingReset').onclick = () => { running = false; stop(); remaining = state.seconds; render(); };
  $('floatingTarget').onchange = () => { state.target = Math.max(0, Number($('floatingTarget').value || 1133)); persist(); render(); };
  $('floatingNotify').onclick = async () => { if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission(); render(); };
  $('floatingDone').onclick = () => { const coins = Number($('floatingCoins').value || 0); if (!coins || coins < 0) { $('floatingCoins').focus(); return; } const note = $('floatingNote').value.trim() || 'تسجيل من الأداة العائمة'; window.location.href = `#coinWidget`; window.dispatchEvent(new CustomEvent('floating-manual-entry', { detail: { coins, note } })); $('floatingCoins').value = ''; $('floatingNote').value = ''; $('floatingNotice').textContent = `تم حفظ ${coins.toLocaleString('ar-MA')} عملة في نموذج الإدخال أدناه.`; };
  window.addEventListener('beforeunload', stop);
  render();
}
