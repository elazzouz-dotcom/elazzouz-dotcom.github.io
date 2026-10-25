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
  document.getElementById('studio-preview-reload')?.addEventListener('click', () => { const frame = document.getElementById('studio-preview-frame'); if (frame) frame.src = frame.src.split('?')[0] + '?preview=' + Date.now(); });
  document.getElementById('studio-top-connect')?.addEventListener('click', () => document.getElementById('ghw-connect')?.click());
  document.getElementById('studio-hero-login')?.addEventListener('click', () => document.getElementById('ghw-connect')?.click());
  document.getElementById('studio-connection-github')?.addEventListener('click', () => document.getElementById('studio-top-connect')?.click());
  const status = document.getElementById('ghw-status'), topStatus = document.getElementById('studio-top-status'), topButton = document.getElementById('studio-top-connect');
  if (status && topStatus) {
    const sync = () => { topStatus.textContent = status.textContent || 'غير متصل'; if (/متصل|تم ربط|جلسة GitHub|تسجيل الدخول|استعادة جلسة|connected/i.test(status.textContent)) { topStatus.style.color = '#6ee7a5'; if (topButton) { topButton.textContent = 'جلسة GitHub نشطة'; topButton.disabled = true; } } else if (topButton) { topButton.textContent = 'تسجيل الدخول إلى GitHub'; topButton.disabled = false; } };
    new MutationObserver(sync).observe(status, { childList: true, characterData: true, subtree: true });
    window.addEventListener('slaks-github-session', sync);
    sync();
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

// Role management uses the same GitHub session as the workbench.
(() => {
  const API = 'https://github-oauth-proxy.elazzouz4.workers.dev';
  const key = 'slaks.github.access-token';
  const form = document.getElementById('studio-permission-form');
  const login = document.getElementById('studio-permission-login');
  const role = document.getElementById('studio-permission-role');
  const status = document.getElementById('studio-permission-status');
  const list = document.getElementById('studio-permission-list');
  if (!form || !status || !list) return;
  const token = () => { try { return sessionStorage.getItem(key); } catch { return null; } };
  const request = async (path, options = {}) => {
    const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
    if (token()) headers.Authorization = `Bearer ${token()}`;
    const response = await fetch(`${API}${path}`, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
    return data;
  };
  const setStatus = (message, good = false) => { status.textContent = message; status.style.color = good ? '#8af0bf' : ''; };
  const render = data => {
    list.replaceChildren();
    const rows = [[data.owner, 'owner'], ...Object.entries(data.roles || {})];
    const seen = new Set();
    rows.forEach(([user, access]) => {
      if (!user || seen.has(user)) return; seen.add(user);
      const row = document.createElement('div'); row.className = 'studio-permission-row';
      const name = document.createElement('b'); name.textContent = `@${user}`;
      const badge = document.createElement('span'); badge.textContent = access === 'owner' ? 'مالك' : access === 'admin' ? 'مدير' : access === 'editor' ? 'محرر' : 'مشاهد';
      row.append(name, badge); list.appendChild(row);
    });
    setStatus(`الدور الحالي: ${data.currentRole === 'owner' ? 'مالك' : data.currentRole === 'admin' ? 'مدير' : data.currentRole === 'editor' ? 'محرر' : 'مشاهد'}`, true);
    form.hidden = !['owner', 'admin'].includes(data.currentRole);
  };
  const refresh = async () => {
    if (!token()) return setStatus('سجّل الدخول إلى GitHub أولًا.');
    try { render(await request('/permissions')); } catch (error) { list.replaceChildren(); setStatus(error.message); form.hidden = true; }
  };
  form.addEventListener('submit', async event => {
    event.preventDefault(); const username = login.value.trim(); if (!username) return;
    try { form.querySelector('button').disabled = true; setStatus('جاري حفظ الصلاحية...'); const data = await request('/permissions', { method: 'PUT', body: JSON.stringify({ login: username, role: role.value }) }); login.value = ''; render(data); }
    catch (error) { setStatus(`تعذر حفظ الصلاحية: ${error.message}`); } finally { form.querySelector('button').disabled = false; }
  });
  window.addEventListener('slaks-github-session', refresh); refresh();
})();
