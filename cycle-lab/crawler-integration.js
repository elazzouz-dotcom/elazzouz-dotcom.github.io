(() => {
  const panel = document.getElementById('crawler-panel');
  const toggle = document.getElementById('crawler-toggle');
  const refresh = document.getElementById('crawler-refresh');
  const status = document.getElementById('crawler-status');
  const pageCount = document.getElementById('crawler-page-count');
  const externalCount = document.getElementById('crawler-external-count');
  const pageList = document.getElementById('crawler-pages');
  const keywordList = document.getElementById('crawler-keywords');
  if (!panel || !toggle) return;

  toggle.addEventListener('click', () => {
    const open = panel.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
    if (open) loadReport();
  });
  refresh?.addEventListener('click', loadReport);

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
      const keywords = pages.flatMap((page) => page.keywords || []).sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 12);
      keywords.forEach((item) => addItem(keywordList, `${item.word} · ${item.count}`));
      status.textContent = `تم تحميل التقرير المحلي المنشور · ${report.timestamp || 'بدون وقت'}. لم يتم تشغيل Python داخل المتصفح.`;
    } catch (error) {
      status.textContent = `تعذر تحميل التقرير: ${error.message}. يمكنك تنزيله أو تشغيل الزاحف محليًا.`;
    }
  }
})();
