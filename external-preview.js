(() => {
  const input = document.querySelector('#external-preview-url');
  const engine = document.querySelector('#external-preview-engine');
  const add = document.querySelector('#external-preview-add');
  const empty = document.querySelector('#external-preview-empty');
  const stage = document.querySelector('#external-preview-stage');
  const frame = document.querySelector('#external-preview-frame');
  const title = document.querySelector('#external-preview-title');
  const open = document.querySelector('#external-preview-open');
  const summary = document.querySelector('#external-preview-summary');
  const PREVIEW_WORKER = 'https://github-oauth-proxy.elazzouz4.workers.dev/preview';
  const SEARCH_ENGINES = Object.freeze({
    google: 'https://www.google.com/search?q=',
    bing: 'https://www.bing.com/search?q=',
    duckduckgo: 'https://duckduckgo.com/?q=',
    brave: 'https://search.brave.com/search?q=',
    yahoo: 'https://search.yahoo.com/search?p=',
    ecosia: 'https://www.ecosia.org/search?q=',
    startpage: 'https://www.startpage.com/sp/search?query=',
    qwant: 'https://www.qwant.com/?q=',
    kagi: 'https://kagi.com/search?q=',
    yandex: 'https://yandex.com/search/?text=',
    baidu: 'https://www.baidu.com/s?wd='
  });
  let previewRun = 0;

  if (!input || !engine || !add || !frame || !summary) return;

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
      row('الرابط أو البحث', url),
      row('النطاق', parsed.hostname),
      `<div><dt class="font-bold text-[var(--color-text)]">الحالة</dt><dd data-preview-status>${escape(metadata.status || 'جارٍ تحميل المعاينة…')}</dd></div>`,
      row('الملخص', metadata.description || 'تظهر الصفحة أو نتائج البحث مباشرة داخل إطار المعاينة. يمكنك فتحها أيضًا في تبويب جديد.')
    ].join('');
  };
  const isUrl = (value) => {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(value)) return true;
    return /^(?:www\.)?[^\s/]+\.[^\s/]+(?:\/[^\s]*)?$/i.test(value);
  };
  const normalizeUrl = (value) => new URL(/^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`);
  const selectedEngineName = () => engine.options[engine.selectedIndex]?.text || 'محرك البحث';
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
      setStatus('تم تحميل الصفحة أو نتائج البحث داخل المعاينة.');
    }
  });
  frame.addEventListener('error', () => {
    setStatus('تعذر تضمين الصفحة مباشرة؛ استخدم زر الفتح في تبويب جديد.');
  });

  add.addEventListener('click', async () => {
    const raw = input.value.trim();
    if (!raw) {
      summary.innerHTML = row('الحالة', 'اكتب رابطًا أو عبارة بحث أولًا.');
      input.focus();
      return;
    }

    let url;
    let mode = 'url';
    try {
      if (isUrl(raw)) {
        url = normalizeUrl(raw);
        if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw new Error();
      } else {
        mode = 'search';
        const base = SEARCH_ENGINES[engine.value] || SEARCH_ENGINES.google;
        url = new URL(`${base}${encodeURIComponent(raw)}`);
      }
    } catch {
      summary.innerHTML = row('الحالة', 'أدخل رابطًا صالحًا أو اكتب كلمات البحث التي تريدها.');
      return;
    }

    const run = ++previewRun;
    add.disabled = true;
    add.textContent = mode === 'search' ? 'جاري البحث…' : 'جاري فتح المعاينة…';
    empty.hidden = true;
    stage.classList.remove('hidden');
    frame.removeAttribute('srcdoc');
    frame.src = url.href;
    describe(url.href, {
      title: mode === 'search' ? `نتائج البحث · ${selectedEngineName()}` : url.hostname,
      status: mode === 'search' ? `جاري فتح نتائج ${selectedEngineName()}…` : 'جاري فتح الموقع داخل المعاينة…',
      description: mode === 'search' ? `بحث مباشر عبر ${selectedEngineName()}.` : undefined
    });

    // For URLs, the proxy may provide a sanitized snapshot when the site blocks iframes.
    // For search pages, keep the selected engine URL visible in the same preview area.
    const usedProxy = mode === 'url' ? await inspect(url.href, run) : false;
    if (run === previewRun && !usedProxy) {
      setStatus(mode === 'search' ? `تم فتح نتائج ${selectedEngineName()} داخل المعاينة.` : 'تم فتح الرابط مباشرة داخل المعاينة.');
    }
    window.dispatchEvent(new CustomEvent('external-preview-added', {
      detail: { url: url.href, title: title.textContent || url.hostname, mode, engine: engine.value }
    }));
    add.disabled = false;
    add.textContent = 'بحث / معاينة';
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') add.click();
  });
})();
