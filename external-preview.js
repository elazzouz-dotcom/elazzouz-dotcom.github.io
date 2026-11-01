(() => {
  const input = document.querySelector('#external-preview-url');
  const add = document.querySelector('#external-preview-add');
  const empty = document.querySelector('#external-preview-empty');
  const stage = document.querySelector('#external-preview-stage');
  const frame = document.querySelector('#external-preview-frame');
  const title = document.querySelector('#external-preview-title');
  const open = document.querySelector('#external-preview-open');
  const summary = document.querySelector('#external-preview-summary');
  const PREVIEW_WORKER = 'https://github-oauth-proxy.elazzouz4.workers.dev/preview';
  let previewRun = 0;

  if (!input || !add || !frame || !summary) return;

  const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));
  const row = (label, value) => `<div><dt class="font-bold text-[var(--color-text)]">${escape(label)}</dt><dd>${escape(value)}</dd></div>`;
  const setStatus = (message) => {
    const status = summary.querySelector('[data-preview-status]');
    if (status) status.textContent = message;
  };
  const describe = (url, metadata = {}) => {
    const parsed = new URL(url);
    title.textContent = metadata.title || parsed.hostname;
    open.href = url;
    summary.innerHTML = [
      row('الرابط', url),
      row('النطاق', parsed.hostname),
      `<div><dt class="font-bold text-[var(--color-text)]">الحالة</dt><dd data-preview-status>${escape(metadata.status || 'جارٍ تحميل المعاينة…')}</dd></div>`,
      row('الملخص', metadata.description || 'تظهر الصفحة مباشرة داخل إطار المعاينة. إذا منع الموقع التضمين، ستبقى نسخة القراءة الآمنة أو رابط الفتح المباشر متاحًا.')
    ].join('');
  };
  const inspect = async (url, run) => {
    try {
      const response = await fetch(`${PREVIEW_WORKER}?url=${encodeURIComponent(url)}`, {
        headers: { Accept: 'application/json' }
      });
      const payload = await response.json();
      if (run !== previewRun || !response.ok || !payload.html) return false;
      frame.removeAttribute('src');
      frame.srcdoc = payload.html;
      describe(url, {
        title: payload.title,
        description: payload.description,
        status: `تم تجهيز نسخة المعاينة · استجابة ${payload.status}`
      });
      return true;
    } catch {
      // The Worker is an enhancement, not a requirement. Keep the direct preview visible.
      return false;
    }
  };

  frame.addEventListener('load', () => {
    if (!frame.srcdoc && frame.src && frame.src !== 'about:blank') {
      setStatus('تم تحميل الموقع مباشرة داخل المعاينة.');
    }
  });
  frame.addEventListener('error', () => {
    setStatus('تعذر تضمين الموقع مباشرة؛ جارٍ إبقاء رابط الفتح الخارجي متاحًا.');
  });

  add.addEventListener('click', async () => {
    let url;
    try {
      const raw = input.value.trim();
      url = new URL(/^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`);
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw new Error();
    } catch {
      summary.innerHTML = row('الحالة', 'أدخل أي رابط ويب صالح، مثل example.com أو https://example.com.');
      return;
    }

    const run = ++previewRun;
    add.disabled = true;
    add.textContent = 'جاري فتح المعاينة…';
    empty.hidden = true;
    stage.classList.remove('hidden');
    frame.removeAttribute('srcdoc');
    frame.src = url.href;
    describe(url.href);

    // Show the real page immediately. If the proxy is healthy, replace it with
    // a sanitized snapshot so sites that block iframes can still be previewed.
    const usedProxy = await inspect(url.href, run);
    if (run === previewRun && !usedProxy) {
      setStatus('تم فتح الرابط مباشرة داخل المعاينة.');
    }
    window.dispatchEvent(new CustomEvent('external-preview-added', {
      detail: { url: url.href, title: title.textContent || url.hostname }
    }));
    add.disabled = false;
    add.textContent = '+ إضافة إلى عقدة';
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') add.click();
  });
})();
