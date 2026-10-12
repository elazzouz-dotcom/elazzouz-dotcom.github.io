(() => {
  const input = document.querySelector('#external-preview-url');
  const add = document.querySelector('#external-preview-add');
  const empty = document.querySelector('#external-preview-empty');
  const stage = document.querySelector('#external-preview-stage');
  const frame = document.querySelector('#external-preview-frame');
  const title = document.querySelector('#external-preview-title');
  const open = document.querySelector('#external-preview-open');
  const summary = document.querySelector('#external-preview-summary');
  if (!input || !add) return;
  const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  const row = (label, value) => `<div><dt class="font-bold text-[var(--color-text)]">${escape(label)}</dt><dd>${escape(value)}</dd></div>`;
  const describe = (url, metadata = {}) => {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    title.textContent = metadata.title || hostname;
    open.href = url;
    summary.innerHTML = [row('الرابط', url), row('النطاق', hostname), row('الحالة', metadata.status || 'تم تجهيز المعاينة'), row('الملخص', metadata.description || 'تم عرض الموقع داخل المعاينة. إذا منع الموقع القراءة الخارجية، تبقى المعاينة المباشرة متاحة ويمكن فتح الرابط في تبويب جديد.')].join('');
  };
  const inspect = async (url) => {
    try {
      const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      return { title: doc.querySelector('meta[property="og:title"]')?.content || doc.title, description: doc.querySelector('meta[name="description"]')?.content || doc.querySelector('meta[property="og:description"]')?.content, status: `استجابة ${response.status}` };
    } catch {
      return { status: 'المعاينة تعمل؛ قراءة العنوان محجوبة بسياسة CORS الخاصة بالموقع الخارجي' };
    }
  };
  add.addEventListener('click', async () => {
    let url;
    try { url = new URL(input.value.trim()); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); } catch { summary.innerHTML = row('الحالة', 'أدخل رابط HTTP أو HTTPS صالحًا.'); return; }
    add.disabled = true; add.textContent = 'جاري تجهيز العقدة…'; empty.hidden = true; stage.classList.remove('hidden'); frame.src = url.href; describe(url.href); const metadata = await inspect(url.href); describe(url.href, metadata); window.dispatchEvent(new CustomEvent('external-preview-added', { detail: { url: url.href, title: metadata.title || url.hostname, description: metadata.description || '' } })); add.disabled = false; add.textContent = '+ إضافة إلى عقدة';
  });
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') add.click(); });
})();
