(() => {
  const API = 'https://github-oauth-proxy.elazzouz4.workers.dev';
  const CLIENT_ID = 'Ov23liCSQUsIFcULd37T';
  const $ = (id) => document.getElementById(id);
  const connect = $('ghw-connect');
  if (!connect) return;
  const status = $('ghw-status'), copyCodeButton = $('ghw-copy-code'), topCopyCodeButton = $('studio-top-copy-code'), topAuthButton = $('studio-top-auth'), topLogoutButton = $('studio-top-logout'), logoutButton = $('ghw-logout'), panel = $('ghw-panel'), editor = $('ghw-editor');
  const loadButton = $('ghw-load'), saveButton = $('ghw-save'), publishButton = $('ghw-publish');
  const createRepoButton = $('ghw-create-repo'), branchButton = $('ghw-branch-create'), branchRefreshButton = $('ghw-branches-refresh'), branchList = $('ghw-branch-list'), newBranchInput = $('ghw-new-branch'), visibleBranchCreateButton = $('ghw-branch-create-visible'), branchStatus = $('ghw-branch-status'), mergeSource = $('ghw-merge-source'), mergeTarget = $('ghw-merge-target'), mergeCheckButton = $('ghw-merge-check'), autoMergeButton = $('ghw-auto-merge'), mergeReport = $('ghw-merge-report'), mergeState = $('ghw-merge-state'), terminalForm = $('ghw-terminal-form'), terminalInput = $('ghw-terminal-input'), terminalOutput = $('ghw-terminal-output'), terminalClear = $('ghw-terminal-clear');
  const tokenInput = $('ghw-token'), tokenButton = $('ghw-token-use');
  let token = null, currentSha = null, currentDevice = null, activeClientId = CLIENT_ID;
  let currentUserCode = '';
  let currentVerificationUrl = '';
  const STORAGE_KEY = 'hosting-studio.github.access-token';
  const setStatus = (message, good = false) => {
    status.textContent = message; window.studioLog?.(message, good ? 'success' : 'info');
    status.style.color = good ? '#16a34a' : 'var(--color-icon)';
    const match = String(message).match(/الكود:\s*([A-Z0-9-]+)/i);
    if (match) currentUserCode = match[1];
    if (currentUserCode) {
      if (topAuthButton) topAuthButton.hidden = !currentVerificationUrl;
      if (copyCodeButton) { copyCodeButton.hidden = false; copyCodeButton.textContent = 'نسخ كود GitHub'; }
      if (topCopyCodeButton) { topCopyCodeButton.hidden = false; topCopyCodeButton.textContent = 'نسخ الكود'; }
    }
  };
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const request = async (path, options = {}) => {
    const headers = { Accept: 'application/vnd.github+json', ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body && typeof options.body !== 'string') { headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(options.body); }
    const response = await fetch(`${API}${path}`, { ...options, credentials: 'include', headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok && !(['/token'].includes(path) && ['authorization_pending','slow_down'].includes(data.error))) throw new Error(data.message || data.error_description || data.error || `HTTP ${response.status}`);
    return data;
  };
  const base64Encode = (value) => { const bytes = new TextEncoder().encode(value); let binary = ''; bytes.forEach(byte => binary += String.fromCharCode(byte)); return btoa(binary); };
  const base64Decode = (value) => { const binary = atob(value.replace(/\n/g, '')); const bytes = Uint8Array.from(binary, char => char.charCodeAt(0)); return new TextDecoder().decode(bytes); };
  const repoPath = () => `/repos/${encodeURIComponent($('ghw-owner').value.trim())}/${encodeURIComponent($('ghw-repo').value.trim())}`;
  const filePath = () => `${repoPath()}/contents/${$('ghw-path').value.trim().split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent($('ghw-branch').value.trim())}`;
  const setEnabled = (enabled) => [loadButton, saveButton, publishButton, createRepoButton, branchButton, branchRefreshButton, visibleBranchCreateButton, mergeCheckButton, autoMergeButton].forEach(button => { if (button) button.disabled = !enabled; });
  const setLogoutVisible = (visible) => [logoutButton, topLogoutButton].forEach(button => { if (button) { button.hidden = false; button.disabled = !visible; } });
  const saveToken = (value) => { try { localStorage.setItem(STORAGE_KEY, value); } catch {} };
  const readToken = () => { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } };
  const clearToken = () => { try { localStorage.removeItem(STORAGE_KEY); } catch {} };
  const activateSession = (user, message) => { panel.classList.remove('hidden'); setEnabled(true); setLogoutVisible(true); connect.disabled = false; connect.textContent = 'تسجيل الدخول إلى GitHub'; setStatus(message, true); loadBranches(); };

  async function connectGitHub() {
    connect.disabled = true; setStatus('جاري طلب رمز آمن من GitHub...');
    try {
      const health = await fetch(`${API}/health`, { cache: 'no-store' }).then(response => response.json()).catch(() => ({}));
      const candidates = [...new Set([...(health.client_ids || []), health.client_id, CLIENT_ID].filter(Boolean))];
      let lastError = null;
      for (const candidate of candidates) {
        try { currentDevice = await request('/device/code', { method: 'POST', body: { client_id: candidate, clientId: candidate, scope: 'repo workflow admin:repo_hook read:user user:email' } }); activeClientId = candidate; break; }
        catch (error) { lastError = error; }
      }
      if (!currentDevice) throw lastError || new Error('لم يتوفر أي OAuth client صالح.');
      if (!currentDevice || !currentDevice.device_code) throw new Error('لم يصل device_code صالح من GitHub Worker');
      const verify = currentDevice.verification_uri_complete || currentDevice.verification_uri;
      currentVerificationUrl = verify;
      if (topAuthButton) { topAuthButton.hidden = false; topAuthButton.textContent = 'فتح GitHub لإدخال الكود'; }
      window.open(verify, '_blank', 'noopener,noreferrer');
      setStatus(`افتح GitHub وأدخل الكود: ${currentDevice.user_code}`);
      const deadline = Date.now() + Number(currentDevice.expires_in || 900) * 1000;
      let interval = Math.max(Number(currentDevice.interval || 5), 5) * 1000;
      while (Date.now() < deadline) {
        await wait(interval);
        const result = await request('/token', { method: 'POST', body: { client_id: activeClientId, clientId: activeClientId, device_code: currentDevice.device_code, deviceCode: currentDevice.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' } });
        if (result.access_token) { token = result.access_token; saveToken(token); const user = await request('/user'); activateSession(user, 'تم تسجيل الدخول إلى GitHub. ستبقى الجلسة حتى تضغط تسجيل الخروج.'); return; }
        if (result.error === 'slow_down') interval += 5000;
        if (!['authorization_pending', 'slow_down'].includes(result.error)) throw new Error(result.error_description || result.error);
      }
      throw new Error('انتهت صلاحية رمز الدخول.');
    } catch (error) { setStatus(`تعذر الربط: ${error.message}`); connect.disabled = false; }
  }
  async function usePersonalToken() {
    const value = tokenInput?.value.trim();
    if (!value) return setStatus('أدخل Token في الحقل المحلي أولًا.');
    tokenButton.disabled = true; setStatus('جاري التحقق من Token داخل جلسة المتصفح...');
    try { token = value; saveToken(token); const user = await request('/user'); activateSession(user, 'تم تسجيل الدخول وحفظ الجلسة على هذا المتصفح.'); tokenInput.value = ''; }
    catch (error) { token = null; setStatus(`تعذر التحقق من Token: ${error.message}`); }
    finally { tokenButton.disabled = false; }
  }

  async function restoreSession() {
    const stored = readToken();
    token = stored || null; setStatus('جاري التحقق من جلسة GitHub المحفوظة...');
    try { const user = await request('/user'); activateSession(user, 'تم استعادة جلسة GitHub. اضغط تسجيل الخروج لإنهائها.'); }
    catch { token = null; clearToken(); setLogoutVisible(false); setEnabled(false); setStatus('انتهت جلسة GitHub؛ سجّل الدخول من جديد.'); }
  }
  function logout() {
    const tokenToRevoke = token;
    token = null; currentSha = null; currentUserCode = ''; currentVerificationUrl = ''; clearToken();
    if (tokenToRevoke) request('/token/revoke', { method: 'POST', body: { access_token: tokenToRevoke } }).catch(() => {});
    panel.classList.add('hidden'); setEnabled(false); setLogoutVisible(false); connect.disabled = false; connect.textContent = 'تسجيل الدخول إلى GitHub';
    if (topAuthButton) topAuthButton.hidden = true;
    if (copyCodeButton) copyCodeButton.hidden = true;
    if (topCopyCodeButton) topCopyCodeButton.hidden = true;
    setStatus('تم تسجيل الخروج يدويًا.');
  }

  async function copyGitHubCode() {
    if (!currentUserCode) return;
    const buttons = [copyCodeButton, topCopyCodeButton].filter(Boolean);
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(currentUserCode);
      else { const helper = document.createElement('textarea'); helper.value = currentUserCode; helper.style.position = 'fixed'; helper.style.opacity = '0'; document.body.appendChild(helper); helper.select(); document.execCommand('copy'); helper.remove(); }
      buttons.forEach(button => { button.textContent = 'تم نسخ الكود ✓'; });
    } catch { buttons.forEach(button => { button.textContent = 'حدده وانسخه يدويًا'; }); }
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
      currentSha = result.content?.sha || currentSha; setStatus('تم حفظ الكود كـ commit على GitHub.', true); window.studioLog?.('Commit saved to GitHub successfully','success'); window.studioRefreshPreview?.();
      if (openPublish) window.open(`https://github.com/${$('ghw-owner').value}/${$('ghw-repo').value}/settings/pages`, '_blank', 'noopener,noreferrer');
    } catch (error) { setStatus(`تعذر الحفظ: ${error.message}`); }
  }
  async function createRepo() {
    const name = $('ghw-repo').value.trim(); if (!name) return setStatus('أدخل اسم المستودع.');
    try { setStatus('جاري إنشاء المستودع...'); const result = await request('/repos/create', { method: 'POST', body: { name, description: 'Created from Hosting Studio', private: false } }); $('ghw-owner').value = result.owner?.login || $('ghw-owner').value; setStatus(`تم إنشاء المستودع ${result.full_name}.`, true); }
    catch (error) { setStatus(`تعذر إنشاء المستودع: ${error.message}`); }
  }
  async function loadBranches() {
    if (!branchList) return;
    try {
      branchStatus && (branchStatus.textContent = 'جاري تحميل فروع المستودع...');
      const data = await request(`${repoPath()}/branches?per_page=100`);
      const branches = Array.isArray(data) ? data : (data.branches || []);
      branchList.innerHTML = '';
      if (!branches.length) { branchList.innerHTML = '<option value="">لا توجد فروع</option>'; branchStatus && (branchStatus.textContent = 'لم يتم العثور على فروع.'); return; }
      branches.forEach(item => { const option = document.createElement('option'); option.value = item.name; option.textContent = `${item.name}${item.protected ? ' · محمي' : ''}`; option.dataset.sha = item.commit?.sha || ''; branchList.appendChild(option); });
      [mergeSource, mergeTarget].forEach(select => { if (!select) return; select.innerHTML = ''; branches.forEach(item => { const option = document.createElement('option'); option.value = item.name; option.textContent = `${item.name}${item.protected ? ' · محمي' : ''}`; select.appendChild(option); }); });
      const active = $('ghw-branch').value.trim(); branchList.value = branches.some(item => item.name === active) ? active : branches[0].name;
      if (mergeTarget) mergeTarget.value = branches.some(item => item.name === active) ? active : branches[0].name;
      if (mergeSource) mergeSource.value = branches.find(item => item.name !== mergeTarget?.value)?.name || branches[0].name;
      if (!$('ghw-branch').value.trim()) $('ghw-branch').value = branchList.value;
      branchStatus && (branchStatus.textContent = `تم تحميل ${branches.length} فرعًا. الفرع النشط: ${branchList.value}`); if (mergeCheckButton) mergeCheckButton.disabled = branches.length < 2; if (autoMergeButton) autoMergeButton.disabled = branches.length < 2;
      window.studioLog?.(`تم تحميل ${branches.length} فرعًا من GitHub`, 'success');
    } catch (error) { branchStatus && (branchStatus.textContent = `تعذر تحميل الفروع: ${error.message}`); window.studioLog?.(`تعذر تحميل الفروع: ${error.message}`, 'error'); }
  }
  function terminalPrint(text, kind = '') {
    if (!terminalOutput) return;
    const line = document.createElement('div'); line.className = `terminal-line ${kind}`; line.textContent = text; terminalOutput.appendChild(line); terminalOutput.scrollTop = terminalOutput.scrollHeight;
  }
  function terminalList() { return ['help                 عرض الأوامر الآمنة', 'status               حالة المستودع الحالي', 'whoami               حساب GitHub المتصل', 'branches             عرض فروع المستودع', 'branch               عرض الفرع النشط', 'compare SRC TARGET   عرض الملفات بين فرعين', 'load PATH            تحميل ملف إلى المحرر', 'preview              تحديث المعاينة الحية', 'clear                مسح الطرفية']; }
  async function runTerminalCommand(raw) {
    const command = raw.trim(); if (!command) return;
    terminalPrint(`studio@github:~$ ${command}`, 'terminal-command');
    const [name, ...args] = command.split(/\s+/); const lower = name.toLowerCase();
    try {
      if (lower === 'help') terminalList().forEach(line => terminalPrint(line, 'terminal-info'));
      else if (lower === 'clear') terminalOutput.innerHTML = '';
      else if (lower === 'branch') terminalPrint(`الفرع النشط: ${$('ghw-branch').value.trim() || 'غير محدد'}`, 'terminal-success');
      else if (lower === 'branches') { await loadBranches(); terminalPrint('تم تحديث قائمة الفروع أعلى اللوحة.', 'terminal-success'); }
      else if (lower === 'whoami') { const user = await request('/user'); terminalPrint(`متصل باسم @${user.login || user.name || 'unknown'}`, 'terminal-success'); }
      else if (lower === 'status') { const data = await request(repoPath()); terminalPrint(`${data.full_name || 'المستودع'} · default: ${data.default_branch || 'غير معروف'} · visibility: ${data.visibility || 'unknown'}`, 'terminal-success'); }
      else if (lower === 'compare') { if (args.length < 2) throw new Error('الاستخدام: compare SRC TARGET'); const data = await request(`${repoPath()}/compare/${encodeURIComponent(args[1])}...${encodeURIComponent(args[0])}`); terminalPrint(`${data.status || 'unknown'} · ${data.ahead_by || 0} commits ahead · ${data.files?.length || 0} files changed`, 'terminal-success'); }
      else if (lower === 'load') { if (!args[0]) throw new Error('الاستخدام: load PATH'); $('ghw-path').value = args.join(' '); await loadFile(); terminalPrint(`تم تحميل ${$('ghw-path').value}`, 'terminal-success'); }
      else if (lower === 'preview') { window.studioRefreshPreview?.(); terminalPrint('تم طلب تحديث المعاينة الحية.', 'terminal-success'); }
      else terminalPrint(`أمر غير معروف: ${name}. اكتب help.`, 'terminal-error');
    } catch (error) { terminalPrint(`خطأ: ${error.message}`, 'terminal-error'); }
  }
  function renderMergeReport(title, details = [], kind = 'info') {
    if (!mergeReport) return;
    mergeReport.innerHTML = `<div class="studio-merge-report-title ${kind}">${title}</div>` + (details.length ? `<ul>${details.map(item => `<li>${item}</li>`).join('')}</ul>` : '');
    if (mergeState) { mergeState.textContent = kind === 'success' ? 'تم الدمج' : kind === 'danger' ? 'تعارضات' : 'تم الفحص'; mergeState.className = `studio-merge-badge ${kind}`; }
  }
  function mergePair() { return { owner: $('ghw-owner').value.trim(), repo: $('ghw-repo').value.trim(), source: mergeSource?.value.trim(), target: mergeTarget?.value.trim() }; }
  async function checkMergeConflicts() {
    const { owner, repo, source, target } = mergePair();
    if (!source || !target || source === target) return renderMergeReport('اختر فرعين مختلفين لفحص الدمج.', [], 'danger');
    try {
      mergeCheckButton && (mergeCheckButton.disabled = true); renderMergeReport(`جاري فحص ${source} ← ${target}...`);
      const comparison = await request(`/repos/${owner}/${repo}/compare/${encodeURIComponent(target)}...${encodeURIComponent(source)}`);
      const files = comparison.files || []; const conflicts = comparison.mergeable === false ? files : [];
      const details = [`الحالة: ${comparison.status || 'غير محددة'}`, `التقدم: ${comparison.ahead_by || 0} commit أمام الهدف · ${comparison.behind_by || 0} خلفه`, `الملفات المتأثرة: ${files.length}`];
      files.slice(0, 30).forEach(file => details.push(`${file.status || 'modified'} · ${file.filename} · +${file.additions || 0}/-${file.deletions || 0}`));
      renderMergeReport(conflicts.length ? `يوجد ${conflicts.length} ملف يحتاج مراجعة قبل الدمج.` : 'لم يظهر تعارض في المقارنة الأولية. الدمج جاهز للتجربة.', details, conflicts.length ? 'danger' : 'success');
      window.studioLog?.(`فحص الدمج ${source} إلى ${target}: ${conflicts.length ? 'تعارضات محتملة' : 'جاهز'}`, conflicts.length ? 'info' : 'success');
    } catch (error) { renderMergeReport(`تعذر فحص الدمج: ${error.message}`, [], 'danger'); window.studioLog?.(`تعذر فحص الدمج: ${error.message}`, 'error'); }
    finally { if (mergeCheckButton) mergeCheckButton.disabled = false; }
  }
  async function autoMerge() {
    const { owner, repo, source, target } = mergePair();
    if (!source || !target || source === target) return renderMergeReport('اختر فرعين مختلفين للدمج.', [], 'danger');
    try {
      autoMergeButton && (autoMergeButton.disabled = true); renderMergeReport(`جاري دمج ${source} في ${target}...`);
      const result = await request(`/repos/${owner}/${repo}/merges`, { method: 'POST', body: { base: target, head: source, commit_message: `Merge ${source} into ${target} from Hosting Studio` } });
      renderMergeReport(`تم الدمج تلقائيًا بنجاح: ${source} → ${target}`, [`SHA: ${result.sha || 'غير متاح'}`, `الرسالة: ${result.message || 'Merge completed'}`], 'success');
      window.studioLog?.(`تم دمج ${source} في ${target} بنجاح`, 'success'); await loadBranches();
    } catch (error) { renderMergeReport(`تعذر الدمج التلقائي: ${error.message}`, ['قد يكون السبب تعارضًا، فرعًا محميًا، أو عدم كفاية صلاحيات GitHub.', 'افحص الملفات المتأثرة ثم حل التعارضات من GitHub أو أنشئ فرعًا جديدًا.'], 'danger'); window.studioLog?.(`فشل الدمج ${source} في ${target}: ${error.message}`, 'error'); }
    finally { if (autoMergeButton) autoMergeButton.disabled = false; }
  }
  async function createBranch(name = '') {
    try {
      const owner = $('ghw-owner').value.trim(), repo = $('ghw-repo').value.trim(), baseName = $('ghw-branch').value.trim() || 'main', branch = (name || newBranchInput?.value || '').trim();
      if (!branch) throw new Error('أدخل اسم الفرع الجديد.');
      if (branch === baseName) throw new Error('اختر اسمًا مختلفًا عن الفرع الأساسي.');
      setStatus(`جاري إنشاء الفرع ${branch} من ${baseName}...`);
      const base = await request(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(baseName)}`);
      await request(`/repos/${owner}/${repo}/git/refs`, { method: 'POST', body: { ref: `refs/heads/${branch}`, sha: base.object.sha } });
      $('ghw-branch').value = branch; if (newBranchInput) newBranchInput.value = ''; setStatus(`تم إنشاء الفرع ${branch} من ${baseName}.`, true); await loadBranches(); if (branchList) branchList.value = branch;
    } catch (error) { setStatus(`تعذر إنشاء الفرع: ${error.message}`); }
  }
  branchRefreshButton?.addEventListener('click', loadBranches); mergeCheckButton?.addEventListener('click', checkMergeConflicts); autoMergeButton?.addEventListener('click', autoMerge); terminalForm?.addEventListener('submit', event => { event.preventDefault(); const value = terminalInput?.value || ''; if (terminalInput) terminalInput.value = ''; runTerminalCommand(value); }); terminalClear?.addEventListener('click', () => { if (terminalOutput) terminalOutput.innerHTML = '<div class="terminal-line terminal-muted">تم مسح الطرفية.</div>'; }); branchList?.addEventListener('change', () => { if (branchList.value) { $('ghw-branch').value = branchList.value; branchStatus && (branchStatus.textContent = `تم اختيار الفرع: ${branchList.value}`); window.studioLog?.(`تم اختيار الفرع ${branchList.value}`,'success'); currentSha = null; } }); visibleBranchCreateButton?.addEventListener('click', () => createBranch()); newBranchInput?.addEventListener('keydown', event => { if (event.key === 'Enter') createBranch(); });
  logoutButton?.addEventListener('click', logout);
  topLogoutButton?.addEventListener('click', logout);
  topAuthButton?.addEventListener('click', () => {
    if (currentVerificationUrl) window.open(currentVerificationUrl, '_blank', 'noopener,noreferrer');
  });
  copyCodeButton?.addEventListener('click', copyGitHubCode);
  topCopyCodeButton?.addEventListener('click', copyGitHubCode);
  connect.addEventListener('click', connectGitHub);
  tokenButton?.addEventListener('click', usePersonalToken); loadButton.addEventListener('click', loadFile); saveButton.addEventListener('click', () => saveFile(false)); publishButton.addEventListener('click', () => saveFile(true)); createRepoButton.addEventListener('click', createRepo); branchButton.addEventListener('click', createBranch);
  restoreSession();
})();
