const $ = (id) => document.getElementById(id);
const KEY = 'azzouz.floating-helper.v1';
const ACCOUNT_KEY = 'azzouz.manual-tiktok-account.v1';
const read = () => { try { const value = JSON.parse(localStorage.getItem(KEY) || '{}'); return { target: Number(value.target) || 1133, seconds: Number(value.seconds) || 1200 }; } catch { return { target: 1133, seconds: 1200 }; } };
const readAccount = () => { try { return String(localStorage.getItem(ACCOUNT_KEY) || 'g_live8').replace(/^@+/, '').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 40) || 'g_live8'; } catch { return 'g_live8'; } };
const format = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

export function initFloatingHelper() {
  const root = $('floatingHelper');
  if (!root) return;
  let state = read();
  let account = readAccount();
  let remaining = state.seconds;
  let running = false;
  let timer = null;
  const persist = () => localStorage.setItem(KEY, JSON.stringify({ target: state.target, seconds: state.seconds }));
  const renderAccount = () => { const profile = `https://www.tiktok.com/@${account}`; const live = `${profile}/live`; const text = `متابعة TikTok LIVE @${account}`; $('floatingAccount').value = account; $('floatingAccountStatus').textContent = `مرتبط بـ @${account} · بدون تسجيل دخول`; $('floatingLiveLink').href = live; $('floatingProfileLink').href = profile; $('floatingProfileLink').textContent = `@${account}`; $('floatingWhatsAppLink').href = `https://wa.me/?text=${encodeURIComponent(`${text} ${profile}`)}`; $('floatingXLink').href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(profile)}`; $('floatingTelegramLink').href = `https://t.me/share/url?url=${encodeURIComponent(profile)}&text=${encodeURIComponent(text)}`; };
  const render = () => {
    $('floatingCountdown').textContent = format(remaining);
    $('floatingState').textContent = running ? 'المؤقت يعمل · المتابعة يدوية' : (remaining === 0 ? 'انتهت الدورة · سجّل يدويًا' : 'جاهز');
    $('floatingStart').textContent = running ? 'إيقاف' : 'بدء';
    $('floatingTarget').value = state.target;
    renderAccount();
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
  $('floatingSaveAccount').onclick = () => { const value = String($('floatingAccount').value || '').replace(/^@+/, '').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 40); if (!value) return; account = value; localStorage.setItem(ACCOUNT_KEY, account); render(); };
  $('floatingDone').onclick = () => { const coins = Number($('floatingCoins').value || 0); if (!coins || coins < 0) { $('floatingCoins').focus(); return; } const note = $('floatingNote').value.trim() || 'تسجيل من الأداة العائمة'; window.location.href = `#coinWidget`; window.dispatchEvent(new CustomEvent('floating-manual-entry', { detail: { coins, note } })); $('floatingCoins').value = ''; $('floatingNote').value = ''; $('floatingNotice').textContent = `تم حفظ ${coins.toLocaleString('ar-MA')} عملة في نموذج الإدخال أدناه.`; };
  window.addEventListener('beforeunload', stop);
  render();
}
