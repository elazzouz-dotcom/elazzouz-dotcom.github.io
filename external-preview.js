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
      const response = await fetch(`${PREVIEW_WORKER}?url=${encodeURIComponent(url)}`, { headers: { Accept: 'application/json' } });
      const payload = await response.json();
      if (!response.ok || !payload.html) throw new Error(payload.error || 'Cloudflare Preview failed');
      frame.removeAttribute('src');
      frame.srcdoc = payload.html;
      return { title: payload.title, description: payload.description, status: `استضافة وسيطة Cloudflare · استجابة ${payload.status}` };
    } catch {
      return { status: 'تعذر جلب الواجهة عبر Cloudflare؛ استخدم رابط الفتح المباشر.' };
    }
  };
  frame.addEventListener('load', () => {
    const current = new URL(frame.src);
    const existing = summary.innerHTML;
    summary.innerHTML = existing.replace(/(الحالة[\s\S]*?<dd>)[^<]*/, '$1تم تحميل المعاينة من ' + escape(current.hostname));
  });
  frame.addEventListener('error', () => {
    summary.innerHTML = summary.innerHTML.replace(/(الحالة[\s\S]*?<dd>)[^<]*/, '$1تعذر تضمين الموقع؛ استخدم رابط الفتح المباشر أدناه.');
  });
  add.addEventListener('click', async () => {
    let url;
    try {
      const raw = input.value.trim();
      url = new URL(/^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`);
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw new Error();
    } catch { summary.innerHTML = row('الحالة', 'أدخل أي رابط ويب صالح، مثل example.com أو https://example.com.'); return; }
    add.disabled = true; add.textContent = 'جاري استضافة الواجهة…'; empty.hidden = true; stage.classList.remove('hidden'); frame.removeAttribute('srcdoc'); frame.src = 'about:blank'; describe(url.href); const metadata = await inspect(url.href); describe(url.href, metadata); window.dispatchEvent(new CustomEvent('external-preview-added', { detail: { url: url.href, title: metadata.title || url.hostname, description: metadata.description || '' } })); add.disabled = false; add.textContent = '+ إضافة إلى عقدة';
  });
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') add.click(); });
})();
