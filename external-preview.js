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
  const localFallback = (url, reason = 'تعذر جلب الصفحة عبر Worker') => {
    const parsed = new URL(url);
    const topic = decodeURIComponent(`${parsed.hostname} ${parsed.pathname}`).replace(/[/?#_=-]+/g, ' ').replace(/\s+/g, ' ').trim();
    const query = topic || parsed.hostname;
    const links = Object.entries(SEARCH_ENGINES).map(([key, base]) => { const target = `${base}${encodeURIComponent(query)}`; return `<a href="${escape(target)}" data-preview-url="${escape(target)}">${escape(engine.querySelector(`option[value="${key}"]`)?.text || key)} ↗</a>`; }).join('');
    const safeReason = escape(reason);
    return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>body{font-family:system-ui,Arial,sans-serif;margin:0;padding:24px;background:#071014;color:#e7f2f0;line-height:1.8}main{max-width:760px;margin:auto}h1{font-size:1.35rem;margin:0 0 8px}h2{font-size:1rem;color:#f4ce72;margin:22px 0 6px}.badge{display:inline-block;border:1px solid #4a806f;border-radius:999px;padding:4px 10px;color:#59e0a3;font-size:.78rem}p{color:#b3c4c4}.card{border:1px solid #25443f;border-radius:16px;padding:16px;background:#102127}.links{display:flex;flex-wrap:wrap;gap:8px}.links a{border:1px solid #315d57;border-radius:999px;color:#59e0a3;text-decoration:none;padding:6px 10px;font-size:.82rem}.muted{font-size:.82rem;color:#8da4a5}.url{overflow-wrap:anywhere;color:#b6d8d0}</style></head><body><main><span class="badge">Fallback ذكاء اصطناعي محلي</span><h1>لم نتمكن من جلب الصفحة الأصلية</h1><p class="muted">${safeReason}. بقيت داخل الموقع، وهذه بطاقة بديلة آمنة بدل عرض صفحة فارغة أو رسالة not found.</p><section class="card"><h2>التحليل المحلي للطلب</h2><p>الموضوع المستنتج من الرابط: <strong>${escape(query)}</strong></p><p class="url">${escape(url)}</p><p>هذا تحليل مساعد مبني على عنوان الرابط ومساره فقط. لا ندّعي أنه نقل محتوى الصفحة الأصلية، ولا نختلق نصًا غير متاح.</p></section><h2>تابع البحث داخل الموقع</h2><p>استخدم الروابط التالية للعثور على مقال أو شرح أو كود متعلق بالموضوع دون مغادرة صفحة المعاينة:</p><nav class="links">${links}</nav></main><script>document.addEventListener('click',function(event){var link=event.target.closest('a[data-preview-url]');if(!link)return;event.preventDefault();parent.postMessage({type:'preview-in-site',url:link.getAttribute('data-preview-url')},'*');});</script></body></html>`;
  };
  const showLocalFallback = (url, reason) => {
    frame.removeAttribute('src');
    frame.srcdoc = localFallback(url, reason);
    describe(url, { title: 'مساعد البحث المحلي', status: 'تم عرض fallback محلي داخل المعاينة', description: 'تعذر جلب الصفحة الأصلية؛ تم إبقاء المستخدم داخل الموقع مع اقتراحات بحث بديلة.' });
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
  const searchSources = Object.freeze([
    ['Wikipedia', (query) => fetchSearchJson(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=5&format=json&origin=*`, data => (data.query?.search || []).map(item => ({ title: item.title, url: `https://en.wikipedia.org/?curid=${item.pageid}`, text: item.snippet?.replace(/<[^>]+>/g, '') || 'مقالة Wikipedia', kind: 'مقالة' })))],
    ['Stack Overflow', (query) => fetchSearchJson(`https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(query)}&site=stackoverflow&pagesize=5&filter=default`, data => (data.items || []).map(item => ({ title: item.title, url: item.link, text: `إجابات برمجية · ${item.answer_count || 0} إجابة`, kind: 'Stack Overflow' })))],
    ['MDN', (query) => fetchSearchJson(`https://developer.mozilla.org/api/v1/search?q=${encodeURIComponent(query)}&size=5`, data => (data.documents || data.results || []).slice(0, 5).map(item => ({ title: item.title || item.name, url: item.mdn_url || item.url || item.slug, text: item.summary || item.description || 'مرجع تقني', kind: 'MDN' })).filter(item => item.url))],
    ['GitHub', (query) => fetchSearchJson(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=5`, data => (data.items || []).map(item => ({ title: item.full_name, url: item.html_url, text: item.description || 'مستودع برمجي', kind: 'GitHub' })))],
    ['npm', (query) => fetchSearchJson(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=5`, data => (data.objects || []).map(item => ({ title: item.package?.name, url: item.package?.links?.npm, text: item.package?.description || 'حزمة JavaScript', kind: 'npm' })).filter(item => item.url))]
  ]);
  const fetchSearchJson = async (url, transform) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 4200);
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return transform(await response.json());
    } finally {
      window.clearTimeout(timer);
    }
  };
  const renderSearchDashboard = (query, reports) => {
    const engines = Object.entries(SEARCH_ENGINES).map(([key, base]) => { const url = `${base}${encodeURIComponent(query)}`; return `<a href="${escape(url)}" data-preview-url="${escape(url)}">${escape(engine.querySelector(`option[value="${key}"]`)?.text || key)} ↗</a>`; }).join('');
    const cards = reports.flatMap(report => (report.items || []).map(item => `<article><small>${escape(item.kind)}</small><h3><a href="${escape(item.url)}" data-preview-url="${escape(item.url)}">${escape(item.title || 'نتيجة بلا عنوان')}</a></h3><p>${escape(item.text || '')}</p></article>`)).join('');
    const fallback = cards ? '' : '<section class="fallback"><strong>لم يظهر موقع مباشر بعد.</strong><p>يمكنك فتح أحد المحركات أعلاه، أو استخدام هذه العبارة للبحث عن مقال أو مرجع أو شفرة برمجية. لا نعرض إجابة ذكاء اصطناعي مزيفة؛ يمكن تفعيلها لاحقًا عبر نقطة خلفية آمنة دون كشف مفاتيح API.</p></section>';
    return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>body{font-family:system-ui,Arial,sans-serif;margin:0;padding:22px;color:#e7f2f0;background:#071014;line-height:1.7}h1{font-size:1.3rem;margin:0 0 8px}p{color:#9cb0b2}.engines{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}.engines a{padding:7px 10px;border:1px solid #315d57;border-radius:999px;color:#59e0a3;text-decoration:none;font-size:.82rem}.results{display:grid;gap:10px}.results article,.fallback{border:1px solid #25443f;border-radius:14px;padding:13px;background:#102127}.results small{color:#f4ce72;font-weight:700}.results h3{font-size:1rem;margin:3px 0}.results h3 a{color:#e8f7f2}.results p{margin:0;font-size:.86rem}.fallback strong{color:#f4ce72}</style></head><body><h1>بحث شامل: ${escape(query)}</h1><p>تظهر النتائج من مصادر المقالات والتقنية والبرمجة تدريجيًا، مع روابط كل محركات البحث.</p><nav class="engines">${engines}</nav><section class="results">${cards}</section>${fallback}<script>document.addEventListener('click',function(event){var link=event.target.closest('a[data-preview-url]');if(!link)return;event.preventDefault();parent.postMessage({type:'preview-in-site',url:link.getAttribute('data-preview-url')},'*');});</script></body></html>`;
  };
  const federatedSearch = async (query, run) => {
    const reports = [];
    frame.removeAttribute('src');
    frame.srcdoc = renderSearchDashboard(query, reports);
    title.textContent = `بحث شامل · ${query}`;
    open.href = `${SEARCH_ENGINES.google}${encodeURIComponent(query)}`;
    summary.innerHTML = [row('البحث', query), row('المصادر', 'محركات البحث + Wikipedia + MDN + GitHub + Stack Overflow + npm'), `<div><dt class="font-bold text-[var(--color-text)]">الحالة</dt><dd data-preview-status>بدأ البحث المتوازي وتظهر النتائج تدريجيًا…</dd></div>`].join('');
    for (const [name, search] of searchSources) {
      search(query).then(items => {
        if (run !== previewRun) return;
        reports.push({ source: name, items });
        frame.srcdoc = renderSearchDashboard(query, reports);
        setStatus(`وصلت نتائج ${reports.length} من ${searchSources.length} مصادر…`);
      }).catch(() => {
        if (run !== previewRun) return;
        reports.push({ source: name, items: [] });
        frame.srcdoc = renderSearchDashboard(query, reports);
        setStatus(`اكتمل مصدر ${reports.length} من ${searchSources.length}؛ البحث مستمر…`);
      });
    }
  };
  const inspect = async (url, run) => {
    try {
      const response = await fetch(`${PREVIEW_WORKER}?url=${encodeURIComponent(url)}`, {
        headers: { Accept: 'application/json' }
      });
      const payload = await response.json();
      if (run !== previewRun) return false;
      if (!response.ok || !payload.html) {
        showLocalFallback(url, payload.error || `استجابة Worker: ${response.status}`);
        return true;
      }
      frame.removeAttribute('src');
      frame.srcdoc = payload.html;
      describe(url, {
        title: payload.title,
        description: payload.description,
        status: `تم تجهيز نسخة المعاينة · استجابة ${payload.status}`
      });
      return true;
    } catch (error) {
      if (run === previewRun) showLocalFallback(url, error?.message || 'تعذر الاتصال بخدمة المعاينة');
      return true;
    }
  };
  const previewInsideSite = async (url) => {
    let parsed;
    try { parsed = new URL(url); } catch { return; }
    if (!['http:', 'https:'].includes(parsed.protocol)) return;
    const run = ++previewRun;
    frame.removeAttribute('srcdoc');
    frame.src = parsed.href;
    describe(parsed.href, { title: parsed.hostname, status: 'جاري تجهيز المقال أو الموقع داخل المعاينة…' });
    const usedProxy = await inspect(parsed.href, run);
    if (run === previewRun && !usedProxy) setStatus('تم تحميل المحتوى داخل المعاينة.');
  };
  window.addEventListener('message', (event) => {
    if (event.source !== frame.contentWindow || event.data?.type !== 'preview-in-site') return;
    previewInsideSite(event.data.url);
  });

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
    if (mode === 'search') {
      await federatedSearch(raw, run);
      if (run === previewRun) setStatus('البحث الشامل يعمل؛ ستظهر المواقع والمقالات والبرمجيات تدريجيًا.');
    } else {
      frame.removeAttribute('srcdoc');
      frame.src = url.href;
      describe(url.href, {
        title: url.hostname,
        status: 'جاري فتح الموقع داخل المعاينة…'
      });
    }

    // For URLs, the proxy may provide a sanitized snapshot when the site blocks iframes.
    // For search pages, keep the selected engine URL visible in the same preview area.
    const usedProxy = mode === 'url' ? await inspect(url.href, run) : false;
    if (run === previewRun && !usedProxy && mode === 'url') {
      setStatus('تم فتح الرابط مباشرة داخل المعاينة.');
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
