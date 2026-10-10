(() => {
  const API = 'https://github-oauth-proxy.elazzouz4.workers.dev';
  const CLIENT_ID = 'Ov23li9xlu3kRKACL6Tz';
  const $ = (id) => document.getElementById(id);
  const connect = $('ghw-connect');
  if (!connect) return;
  const status = $('ghw-status'), panel = $('ghw-panel'), editor = $('ghw-editor');
  const loadButton = $('ghw-load'), saveButton = $('ghw-save'), publishButton = $('ghw-publish');
  const createRepoButton = $('ghw-create-repo'), branchButton = $('ghw-branch-create');
  let token = null, currentSha = null, currentDevice = null;
  const setStatus = (message, good = false) => { status.textContent = message; status.style.color = good ? '#16a34a' : 'var(--color-icon)'; };
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const request = async (path, options = {}) => {
    const headers = { Accept: 'application/vnd.github+json', ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body && typeof options.body !== 'string') { headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(options.body); }
    const response = await fetch(`${API}${path}`, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error_description || data.error || `HTTP ${response.status}`);
    return data;
  };
  const base64Encode = (value) => { const bytes = new TextEncoder().encode(value); let binary = ''; bytes.forEach(byte => binary += String.fromCharCode(byte)); return btoa(binary); };
  const base64Decode = (value) => { const binary = atob(value.replace(/\n/g, '')); const bytes = Uint8Array.from(binary, char => char.charCodeAt(0)); return new TextDecoder().decode(bytes); };
  const repoPath = () => `/repos/${encodeURIComponent($('ghw-owner').value.trim())}/${encodeURIComponent($('ghw-repo').value.trim())}`;
  const filePath = () => `${repoPath()}/contents/${$('ghw-path').value.trim().split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent($('ghw-branch').value.trim())}`;
  const setEnabled = (enabled) => [loadButton, saveButton, publishButton, createRepoButton, branchButton].forEach(button => button.disabled = !enabled);

  async function connectGitHub() {
    connect.disabled = true; setStatus('جاري طلب رمز آمن من GitHub...');
    try {
      currentDevice = await request('/device/code', { method: 'POST', body: { client_id: CLIENT_ID, scope: 'repo read:user user:email' } });
      const verify = currentDevice.verification_uri_complete || currentDevice.verification_uri;
      window.open(verify, '_blank', 'noopener,noreferrer');
      setStatus(`افتح GitHub وأدخل الكود: ${currentDevice.user_code}`);
      const deadline = Date.now() + Number(currentDevice.expires_in || 900) * 1000;
      let interval = Math.max(Number(currentDevice.interval || 5), 5) * 1000;
      while (Date.now() < deadline) {
        await wait(interval);
        const result = await request('/token', { method: 'POST', body: { client_id: CLIENT_ID, device_code: currentDevice.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' } });
        if (result.access_token) { token = result.access_token; const user = await request('/user'); panel.classList.remove('hidden'); setEnabled(true); connect.textContent = `متصل: @${user.login}`; setStatus('تم ربط GitHub بهذه الجلسة.', true); return; }
        if (result.error === 'slow_down') interval += 5000;
        if (!['authorization_pending', 'slow_down'].includes(result.error)) throw new Error(result.error_description || result.error);
      }
      throw new Error('انتهت صلاحية رمز الدخول.');
    } catch (error) { setStatus(`تعذر الربط: ${error.message}`); connect.disabled = false; }
  }
  async function loadFile() {
    try { setStatus('جاري تحميل الملف...'); const data = await request(filePath()); currentSha = data.sha; editor.value = base64Decode(data.content); setStatus(`تم تحميل ${$('ghw-path').value}.`, true); }
    catch (error) { currentSha = null; setStatus(`تعذر تحميل الملف: ${error.message}`); }
  }
  async function saveFile(openPublish = false) {
    try {
      if (!editor.value.trim()) throw new Error('اكتب محتوى الملف أولًا.');
      setStatus('جاري حفظ التعديل كـ commit...');
      const body = { message: $('ghw-message').value.trim() || 'Update from Hosting Studio', content: base64Encode(editor.value), branch: $('ghw-branch').value.trim() };
      if (currentSha) body.sha = currentSha;
      const result = await request(filePath().split('?')[0], { method: 'PUT', body });
      currentSha = result.content?.sha || currentSha; setStatus('تم حفظ الكود كـ commit على GitHub.', true);
      if (openPublish) window.open(`https://github.com/${$('ghw-owner').value}/${$('ghw-repo').value}/settings/pages`, '_blank', 'noopener,noreferrer');
    } catch (error) { setStatus(`تعذر الحفظ: ${error.message}`); }
  }
  async function createRepo() {
    const name = $('ghw-repo').value.trim(); if (!name) return setStatus('أدخل اسم المستودع.');
    try { setStatus('جاري إنشاء المستودع...'); const result = await request('/repos/create', { method: 'POST', body: { name, description: 'Created from Hosting Studio', private: false } }); $('ghw-owner').value = result.owner?.login || $('ghw-owner').value; setStatus(`تم إنشاء المستودع ${result.full_name}.`, true); }
    catch (error) { setStatus(`تعذر إنشاء المستودع: ${error.message}`); }
  }
  async function createBranch() {
    try { const owner = $('ghw-owner').value.trim(), repo = $('ghw-repo').value.trim(), branch = $('ghw-branch').value.trim(); const base = await request(`/repos/${owner}/${repo}/git/ref/heads/main`); await request(`/repos/${owner}/${repo}/git/refs`, { method: 'POST', body: { ref: `refs/heads/${branch}`, sha: base.object.sha } }); setStatus(`تم إنشاء الفرع ${branch}.`, true); }
    catch (error) { setStatus(`تعذر إنشاء الفرع: ${error.message}`); }
  }
  connect.addEventListener('click', connectGitHub); loadButton.addEventListener('click', loadFile); saveButton.addEventListener('click', () => saveFile(false)); publishButton.addEventListener('click', () => saveFile(true)); createRepoButton.addEventListener('click', createRepo); branchButton.addEventListener('click', createBranch);
})();
