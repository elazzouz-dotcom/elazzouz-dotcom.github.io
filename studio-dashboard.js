(() => {
  const panels = [...document.querySelectorAll('[data-studio-panel]')];
  const links = [...document.querySelectorAll('[data-studio-page]')];
  const show = (page, scroll = false) => {
    panels.forEach(panel => panel.classList.toggle('is-active', panel.dataset.studioPanel === page));
    links.forEach(link => link.classList.toggle('is-active', link.dataset.studioPage === page));
    if (scroll) document.querySelector('.studio-app-shell')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  links.forEach(link => link.addEventListener('click', () => show(link.dataset.studioPage)));
  document.querySelectorAll('[data-jump]').forEach(button => button.addEventListener('click', () => show(button.dataset.jump, true)));
  document.querySelectorAll('[data-scroll-target]').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.scrollTarget)?.scrollIntoView({ behavior: 'smooth', block: 'start' })));
  document.getElementById('studio-top-connect')?.addEventListener('click', () => document.getElementById('ghw-connect')?.click());
  document.getElementById('studio-connection-github')?.addEventListener('click', () => document.getElementById('studio-top-connect')?.click());
  const status = document.getElementById('ghw-status'), topStatus = document.getElementById('studio-top-status'), topButton = document.getElementById('studio-top-connect');
  if (status && topStatus) {
    const sync = () => { topStatus.textContent = status.textContent || 'غير متصل'; if (/متصل|تم ربط|connected/i.test(status.textContent)) { topStatus.style.color = '#6ee7a5'; if (topButton) topButton.textContent = 'حساب GitHub متصل'; } };
    new MutationObserver(sync).observe(status, { childList: true, characterData: true, subtree: true }); sync();
  }
})();

// Gmail OTP admin gate: active only after Cloudflare secrets are configured.
(() => {
  const API = 'https://github-oauth-proxy.elazzouz4.workers.dev';
  const gate = document.getElementById('studio-otp-gate');
  const config = document.getElementById('studio-otp-config');
  const requestButton = document.getElementById('studio-otp-request');
  const verifyButton = document.getElementById('studio-otp-verify');
  const copyButton = document.getElementById('studio-otp-copy');
  const codeRow = document.getElementById('studio-otp-code-row');
  const codeInput = document.getElementById('studio-otp-code');
  const status = document.getElementById('studio-otp-status');
  if (!gate || !requestButton) return;
  let codeCopied = false;
  const setVerifyState = (enabled) => {
    codeCopied = enabled;
    if (verifyButton) verifyButton.disabled = !enabled;
    if (copyButton) copyButton.textContent = enabled ? 'تم النسخ ✓' : 'نسخ الرمز';
  };
  const setStatus = (text, kind = '') => { status.textContent = text; status.className = `studio-otp-status ${kind}`; };
  const json = async (url, options = {}) => {
    const response = await fetch(`${API}${url}`, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  };
  const init = async () => {
    try {
      const session = await json('/otp/session', { method: 'GET' });
      if (!session.configured) { config?.classList.add('visible'); return; }
      if (!session.authenticated) gate.classList.remove('hidden');
    } catch { config?.classList.add('visible'); }
  };
  requestButton.addEventListener('click', async () => {
    requestButton.disabled = true; setStatus('جاري إرسال الرمز إلى Gmail...');
    try { await json('/otp/request', { method: 'POST', body: JSON.stringify({ email: 'elazzouz4@gmail.com' }) }); codeRow.hidden = false; setVerifyState(false); codeInput.focus(); setStatus('تم إرسال الرمز. انسخه أولًا ثم اضغط تحقق للمتابعة.', 'good'); }
    catch (error) { setStatus(error.message === 'gmail_otp_not_configured' ? 'أضف أسرار Google OAuth إلى Cloudflare أولًا.' : `تعذر إرسال الرمز: ${error.message}`, 'bad'); }
    finally { requestButton.disabled = false; }
  });
  verifyButton.addEventListener('click', async () => {
    const code = codeInput.value.trim(); if (!codeCopied) return setStatus('اضغط «نسخ الرمز» أولًا ثم تابع.', 'bad'); if (!/^\d{6}$/.test(code)) return setStatus('أدخل رمزًا من 6 أرقام.', 'bad');
    verifyButton.disabled = true; setStatus('جاري التحقق...');
    try { await json('/otp/verify', { method: 'POST', body: JSON.stringify({ code }) }); gate.classList.add('hidden'); setStatus('تم التحقق.', 'good'); }
    catch (error) { setStatus(`تعذر التحقق: ${error.message}`, 'bad'); }
    finally { verifyButton.disabled = false; }
  });
  copyButton.addEventListener('click', async () => {
    const value = codeInput.value.trim();
    if (!/^\d{6}$/.test(value)) return setStatus('أدخل رمزًا من 6 أرقام أولًا.', 'bad');
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
      else { codeInput.focus(); codeInput.select(); document.execCommand('copy'); }
      setVerifyState(true);
      setStatus('تم نسخ الرمز. يمكنك الآن الضغط على تحقق للمتابعة.', 'good');
    } catch { setStatus('تعذر النسخ تلقائيًا. حدّد الرمز وانسخه يدويًا ثم اضغط تحقق.', 'bad'); }
  });
  setVerifyState(false);
  init();
})();
