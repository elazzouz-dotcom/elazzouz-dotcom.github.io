(() => {
  const widget = document.querySelector('[data-flow-widget]');
  if (!widget) return;
  const track = widget.querySelector('.data-flow-track');
  const nodes = [...widget.querySelectorAll('[data-node]')];
  const links = [...widget.querySelectorAll('[data-link]')].slice(0, nodes.length - 1);
  const send = widget.querySelector('#data-flow-send');
  const status = widget.querySelector('#data-flow-status');
  let payload = 'حمولة تجريبية';
  window.addEventListener('external-preview-added', (event) => {
    payload = `بيانات ${event.detail.title || event.detail.url}`;
    status.textContent = `تم ربط ${event.detail.url}. اضغط لنقل معلوماته عبر الأنابيب.`;
  });
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const draw = () => links.forEach((svg, index) => {
    const a = nodes[index].getBoundingClientRect();
    const b = nodes[index + 1].getBoundingClientRect();
    const t = track.getBoundingClientRect();
    const x = a.right - t.left;
    const y = a.top + a.height / 2 - t.top;
    const width = Math.max(b.left - a.right, 1);
    svg.style.left = `${x}px`;
    svg.style.top = `${y - 9}px`;
    svg.setAttribute('width', width);
    svg.setAttribute('height', 18);
    ['tube-shadow', 'tube', 'core'].forEach((name) => svg.querySelector(`.${name}`).setAttribute('d', `M 0 9 H ${width}`));
    svg.querySelector('.data-flow-particle').style.offsetPath = `path('M 0 9 H ${width}')`;
  });
  window.addEventListener('resize', draw);
  draw();
  send.addEventListener('click', async () => {
    send.disabled = true;
    nodes.forEach((node) => node.classList.remove('is-active'));
    links.forEach((link) => link.classList.remove('is-moving'));
    for (let index = 0; index < nodes.length; index += 1) {
      nodes[index].classList.add('is-active');
      status.textContent = `تنتقل ${payload} إلى العقدة ${index + 1} من ${nodes.length}...`;
      await sleep(500);
      if (links[index]) { links[index].classList.add('is-moving'); await sleep(1100); links[index].classList.remove('is-moving'); }
    }
    status.textContent = `اكتمل المسار: وصلت ${payload} إلى عقدة GitHub النهائية.`;
    send.disabled = false;
  });

  const API = 'https://github-oauth-proxy.elazzouz4.workers.dev';
  const login = widget.querySelector('#home-github-login');
  const logout = widget.querySelector('#home-github-logout');
  const authStatus = widget.querySelector('#home-github-status');
  const code = widget.querySelector('#home-github-code');
  const codeRow = widget.querySelector('.github-code-row');
  const copy = widget.querySelector('#home-github-copy');
  const open = widget.querySelector('#home-github-open');
  let session = null;
  let pollInterval = 5000;

  const setAuthStatus = (message, good = false) => { authStatus.textContent = message; authStatus.style.color = good ? '#9bf7cb' : ''; };
  const api = async (path, options = {}) => {
    const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
    if (session) headers.Authorization = `Bearer ${session}`;
    const response = await fetch(`${API}${path}`, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok && !['authorization_pending', 'slow_down'].includes(data.error)) throw new Error(data.message || data.error_description || data.error || `HTTP ${response.status}`);
    return data;
  };
  copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(code.textContent); copy.textContent = 'تم النسخ ✓'; } catch { copy.textContent = 'انسخه يدويًا'; } });
  const showSignedIn = (user) => { setAuthStatus(`تم تسجيل الدخول باسم ${user.login}. الجلسة مؤقتة ولا يُحفظ الرمز في المتصفح.`, true); login.textContent = `متصل: ${user.login}`; login.disabled = true; logout.hidden = false; codeRow.hidden = true; open.hidden = true; };
  const clearSession = () => { session = null; login.disabled = false; login.textContent = 'تسجيل الدخول إلى GitHub'; logout.hidden = true; };
  login.addEventListener('click', async () => {
    login.disabled = true;
    setAuthStatus('جاري طلب كود آمن من GitHub...');
    try {
      const device = await api('/auth/device/code', { method: 'POST', body: JSON.stringify({}) });
      pollInterval = Math.max(Number(device.interval || 5), 5) * 1000;
      const verificationUrl = device.verification_uri_complete || device.verification_uri;
      if (!device.device_code || !device.user_code || !verificationUrl) throw new Error('لم يُرجع GitHub بيانات تدفق الدخول المطلوبة.');
      code.textContent = device.user_code;
      codeRow.hidden = false;
      open.href = verificationUrl;
      open.hidden = false;
      setAuthStatus('افتح رابط GitHub، أدخل الكود، ثم ارجع إلى هذه الصفحة لإتمام تسجيل الدخول.');
      const deadline = Date.now() + Number(device.expires_in || 900) * 1000;
      while (Date.now() < deadline) {
        await sleep(pollInterval);
        const result = await api('/auth/device/token', { method: 'POST', body: JSON.stringify({ device_code: device.device_code }) });
        if (result.session) { session = result.session; showSignedIn(result.user); break; }
        if (!['authorization_pending', 'slow_down'].includes(result.error)) throw new Error(result.error_description || result.error || 'تعذر إتمام موافقة GitHub.');
        if (result.error === 'slow_down') pollInterval += 5000;
      }
      if (!session) throw new Error('انتهت صلاحية رمز الدخول؛ ابدأ محاولة جديدة.');
    } catch (error) { setAuthStatus(`تعذر تسجيل الدخول: ${error.message}`); }
    finally { if (!session) login.disabled = false; }
  });
  logout.addEventListener('click', async () => {
    logout.disabled = true;
    try { const result = await api('/auth/logout', { method: 'POST', body: JSON.stringify({}) }); setAuthStatus(result.revoked ? 'تم تسجيل الخروج وإلغاء تفويض GitHub.' : 'تم مسح الجلسة من هذه الصفحة؛ تنتهي الجلسة المشفرة تلقائيًا خلال أربع ساعات.', true); }
    catch (error) { setAuthStatus(`تعذر تأكيد الإلغاء لدى GitHub: ${error.message}`); }
    finally { clearSession(); logout.disabled = false; }
  });
})();
