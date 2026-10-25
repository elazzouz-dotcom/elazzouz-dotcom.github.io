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
  if ('IntersectionObserver' in window) {
    const motionObserver = new IntersectionObserver(([entry]) => {
      widget.dataset.offscreen = String(!entry.isIntersecting);
    }, { rootMargin: '120px 0px' });
    motionObserver.observe(widget);
  }
  send.addEventListener('click', async () => {
    send.disabled = true;
    nodes.forEach((node) => node.classList.remove('is-active'));
    links.forEach((link) => link.classList.remove('is-moving'));
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (let index = 0; index < nodes.length; index += 1) {
      nodes[index].classList.add('is-active');
      status.textContent = `تنتقل ${payload} إلى العقدة ${index + 1} من ${nodes.length}...`;
      await sleep(reducedMotion ? 0 : 500);
      if (links[index] && !reducedMotion) { links[index].classList.add('is-moving'); await sleep(1100); links[index].classList.remove('is-moving'); }
    }
    status.textContent = `اكتمل المسار: وصلت ${payload} إلى عقدة GitHub النهائية.`;
    send.disabled = false;
  });

  const API = 'https://github-oauth-proxy.elazzouz4.workers.dev';
  const CLIENT_ID = 'Ov23liCSQUsIFcULd37T';
  const STORAGE_KEY = 'hosting-studio.github.access-token';
  const login = widget.querySelector('#home-github-login');
  const authStatus = widget.querySelector('#home-github-status');
  const code = widget.querySelector('#home-github-code');
  const codeRow = widget.querySelector('.github-code-row');
  const copy = widget.querySelector('#home-github-copy');
  const open = widget.querySelector('#home-github-open');
  let token = sessionStorage.getItem(STORAGE_KEY);
  let pollInterval = 5000;

  const setAuthStatus = (message, good = false) => { authStatus.textContent = message; authStatus.style.color = good ? '#9bf7cb' : ''; };
  const api = async (path, options = {}) => {
    const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${API}${path}`, { ...options, credentials: 'include', headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok && !['authorization_pending', 'slow_down'].includes(data.error)) throw new Error(data.message || data.error || `HTTP ${response.status}`);
    return data;
  };
  copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(code.textContent); copy.textContent = 'تم النسخ ✓'; } catch { copy.textContent = 'انسخه يدويًا'; } });
  const restore = async () => { if (!token) return; try { await api('/user'); setAuthStatus('جلسة GitHub مستعادة على هذا المتصفح.', true); login.textContent = 'جلسة GitHub نشطة'; } catch { token = null; sessionStorage.removeItem(STORAGE_KEY); } };
  login.addEventListener('click', async () => {
    login.disabled = true;
    setAuthStatus('جاري طلب كود آمن من GitHub...');
    try {
      const health = await fetch(`${API}/health`, { cache: 'no-store' }).then((response) => response.json()).catch(() => ({}));
      const clientId = health.client_id || CLIENT_ID;
      const device = await api('/device/code', { method: 'POST', body: JSON.stringify({ client_id: clientId, clientId, scope: 'repo workflow read:user user:email' }) });
      const verificationUrl = device.verification_uri_complete || device.verification_uri;
      code.textContent = device.user_code;
      codeRow.hidden = false;
      open.href = verificationUrl;
      open.hidden = false;
      window.open(verificationUrl, '_blank', 'noopener,noreferrer');
      setAuthStatus('انسخ الكود، افتح GitHub، ثم وافق على الوصول.');
      const deadline = Date.now() + Number(device.expires_in || 900) * 1000;
      while (Date.now() < deadline) {
        await sleep(pollInterval);
        const result = await api('/token', { method: 'POST', body: JSON.stringify({ client_id: clientId, clientId, device_code: device.device_code, deviceCode: device.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }) });
        if (result.access_token) { token = result.access_token; sessionStorage.setItem(STORAGE_KEY, token); await api('/user'); setAuthStatus('تم تسجيل الدخول وحفظ الجلسة محليًا حتى تسجيل الخروج أو انتهاء صلاحية GitHub.', true); login.textContent = 'جلسة GitHub نشطة'; break; }
        if (result.error === 'slow_down') pollInterval += 5000;
      }
    } catch (error) { setAuthStatus(`تعذر تسجيل الدخول: ${error.message}`); }
    finally { login.disabled = false; }
  });
  restore();
})();
