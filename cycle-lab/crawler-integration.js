(() => {
  const panel = document.getElementById('crawler-panel');
  const toggle = document.getElementById('crawler-toggle');
  const refresh = document.getElementById('crawler-refresh');
  const status = document.getElementById('crawler-status');
  const pageCount = document.getElementById('crawler-page-count');
  const externalCount = document.getElementById('crawler-external-count');
  const pageList = document.getElementById('crawler-pages');
  const keywordList = document.getElementById('crawler-keywords');
  const localUrl = document.getElementById('crawler-url');
  const localHtml = document.getElementById('crawler-html');
  const localFile = document.getElementById('crawler-file');
  const analyzeButton = document.getElementById('crawler-analyze');
  const clearButton = document.getElementById('crawler-clear');
  const analyzerStatus = document.getElementById('crawler-analyzer-status');
  const localKeywords = document.getElementById('crawler-local-keywords');
  const localLinks = document.getElementById('crawler-local-links');
  if (!panel || !toggle) return;

  const STOPWORDS = new Set(`من في على الى إلى عن مع هذا هذه ذلك تلك الذي التي الذين هو هي هم هن أنا نحن أنت انتم أنتم كان كانت يكون تكون تم قد لقد ما ماذا متى كيف لم لن لا نعم أو و ف ب ك ل ثم لكن بل حتى أي كل بعض غير مثل عند بعد قبل بين ضمن حول هناك هنا حيث أثناء عبر بدون أيضا the and for with this that from are was were will have has had not but you your our their into about over under then than also can may all any some more www com http https اضغط اختبار فحص الفحص مسح انتظار بانتظار جاهز تحديث فتح تنزيل صفحة الصفحة الموقع button click open download refresh home menu login copyright azzouz full cycle lab bridge book مختبر html`.split(/\s+/));
  const TOKEN_RE = /[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9_-]{2,}|[\u0600-\u06FF]{2,}/g;

  toggle.addEventListener('click', () => {
    const open = panel.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
    if (open) loadReport();
  });
  refresh?.addEventListener('click', loadReport);
  analyzeButton?.addEventListener('click', analyzeInput);
  clearButton?.addEventListener('click', clearAnalyzer);
  localFile?.addEventListener('change', () => { if (localFile.files[0]) { localUrl.value = ''; localHtml.value = ''; analyzeInput(); } });

  function addItem(list, text) {
    const li = document.createElement('li');
    li.textContent = text;
    list.append(li);
  }

  async function loadReport() {
    status.textContent = 'جارٍ تحميل تقرير الزاحف المنشور…';
    pageList.textContent = '';
    keywordList.textContent = '';
    try {
      const response = await fetch('./authorized_crawl_report.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const report = await response.json();
      const pages = Array.isArray(report.pages) ? report.pages : [];
      pageCount.textContent = pages.length;
      externalCount.textContent = report.analysis?.external_links_checked_locally ?? 0;
      pages.forEach((page) => addItem(pageList, `${page.status_code || '—'} · ${page.title || page.url}`));
      const keywords = pages.flatMap((page) => page.keywords || []).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 12);
      keywords.forEach((item) => addItem(keywordList, `${item.word} · درجة الصلة ${item.score}`));
      status.textContent = `تم تحميل التقرير المحلي المنشور · ${report.timestamp || 'بدون وقت'}. لم يتم تشغيل Python داخل المتصفح.`;
    } catch (error) {
      status.textContent = `تعذر تحميل التقرير: ${error.message}. يمكنك تنزيله أو تشغيل الزاحف محليًا.`;
    }
  }

  function normalizeToken(token) {
    return token.toLowerCase().replace(/[ً-ٰٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي');
  }

  function extractKeywords(text) {
    const counts = new Map();
    const add = (value, weight) => (value.match(TOKEN_RE) || []).forEach((raw) => {
      const word = normalizeToken(raw);
      if (word.length < 3 || STOPWORDS.has(word) || /^\d+$/.test(word)) return;
      const current = counts.get(word) || { word: raw, score: 0 };
      current.score += weight;
      counts.set(word, current);
    });
    add(text, 1);
    return [...counts.values()].filter((item) => item.score >= 2).sort((a, b) => b.score - a.score).slice(0, 15);
  }

  function isSafeExternal(url) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      return parsed.protocol === 'https:' && host !== location.hostname && host !== 'localhost'
        && !/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)
        && !/\.(exe|bat|sh|scr|dll|zip|js|json|py|mp4|png|jpg|jpeg|gif)$/i.test(parsed.pathname);
    } catch { return false; }
  }

  function analyzeDocument(source, sourceUrl = location.href) {
    const looksLikeHtml = /<\s*(html|body|head|title|h1|p|a)\b/i.test(source);
    const doc = new DOMParser().parseFromString(looksLikeHtml ? source : `<body>${source.replace(/[<>]/g, ' ')}</body>`, 'text/html');
    doc.querySelectorAll('script,style,noscript,svg,nav,footer').forEach((node) => node.remove());
    const weighted = [
      [doc.title?.textContent || '', 4],
      [...doc.querySelectorAll('h1,h2,h3')].map((n) => [n.textContent, 3]),
      [doc.querySelector('meta[name="description"]')?.content || '', 2],
      [doc.body?.textContent || '', 1],
    ];
    const keywords = new Map();
    weighted.flat(Infinity).forEach((value, index, arr) => {
      if (typeof value !== 'string') return;
      const weight = index === 0 ? 4 : index < arr.length - 2 ? 3 : 1;
      extractKeywords(value).forEach((item) => {
        const current = keywords.get(item.word) || { word: item.word, score: 0 };
        current.score += item.score * weight;
        keywords.set(item.word, current);
      });
    });
    const links = [...doc.querySelectorAll('a[href]')].map((anchor) => {
      try { return { url: new URL(anchor.getAttribute('href'), sourceUrl).href, text: anchor.textContent.trim() }; } catch { return null; }
    }).filter(Boolean).filter((item, index, all) => all.findIndex((x) => x.url === item.url) === index).slice(0, 30);
    return { keywords: [...keywords.values()].sort((a, b) => b.score - a.score).slice(0, 15), links };
  }

  async function analyzeInput() {
    analyzerStatus.textContent = 'جارٍ التحليل محليًا…';
    try {
      let source = localHtml.value;
      let sourceUrl = location.href;
      if (localFile.files[0]) source = await localFile.files[0].text();
      if (!source && localUrl.value.trim()) {
        const target = new URL(localUrl.value.trim(), location.href);
        if (target.origin !== location.origin) throw new Error('لأسباب أمنية، جلب الرابط يعمل من نفس الموقع فقط. الصق HTML أو اختر ملفًا محليًا.');
        const response = await fetch(target.href, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        source = await response.text(); sourceUrl = target.href;
      }
      if (!source) throw new Error('أدخل HTML أو نصًا أو اختر ملفًا.');
      const result = analyzeDocument(source, sourceUrl);
      localKeywords.textContent = ''; localLinks.textContent = '';
      result.keywords.forEach((item) => addItem(localKeywords, `${item.word} · ${item.score}`));
      result.links.forEach((item) => addItem(localLinks, `${isSafeExternal(item.url) ? 'خارجي آمن مبدئيًا' : 'داخلي/يحتاج مراجعة'} · ${item.text || item.url}`));
      analyzerStatus.textContent = `اكتمل التحليل محليًا: ${result.keywords.length} كلمة و${result.links.length} رابطًا. لم يتم تشغيل أو رفع المحتوى.`;
    } catch (error) { analyzerStatus.textContent = `تعذر التحليل: ${error.message}`; }
  }

  function clearAnalyzer() {
    localUrl.value = ''; localHtml.value = ''; localFile.value = '';
    localKeywords.textContent = ''; localLinks.textContent = '';
    analyzerStatus.textContent = 'تم المسح. لم يتم تنفيذ أي محتوى.';
  }
})();
