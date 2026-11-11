(() => {
  const canvas = document.getElementById('https-layer');
  const panel = document.getElementById('https-panel');
  const query = document.getElementById('https-query');
  const urlInput = document.getElementById('https-url');
  const result = document.getElementById('https-result');
  const close = document.getElementById('https-close');
  const sourcesInput = document.getElementById('https-sources-input');
  const sourceList = document.getElementById('https-source-list');
  const sourceQuery = document.getElementById('https-source-query');
  if (!canvas || !panel) return;
  const ctx = canvas.getContext('2d');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const node = { x: 0, y: 0, tx: 0, ty: 0, r: 39, pulse: 0, hover: false };
  const ripples = [];
  let lastTime = performance.now();
  let elapsed = 0;
  let pointer = { x: -9999, y: -9999 };
  const satellites = [
    { label: 'بحث', color: '#65d6ff', phase: 0 },
    { label: 'تحقق', color: '#8ff7bd', phase: 2.1 },
    { label: 'حماية', color: '#ffd477', phase: 4.2 },
  ];
  const sourceNodes = JSON.parse(localStorage.getItem('cycleLabHttpsSources') || '[]').slice(0, 18);
  const trail = [];
  let mobileMode = innerWidth < 600;
  const viewport = { width: innerWidth, height: innerHeight, dpr: 1 };

  function resize() {
    viewport.width = visualViewport?.width || innerWidth;
    viewport.height = visualViewport?.height || innerHeight;
    mobileMode = viewport.width < 600;
    viewport.dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
    canvas.width = Math.round(viewport.width * viewport.dpr); canvas.height = Math.round(viewport.height * viewport.dpr);
    ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
    node.r = mobileMode ? 34 : 39;
  }
  addEventListener('resize', resize); visualViewport?.addEventListener('resize', resize); resize();

  function setTarget() {
    const radius = mobileMode ? Math.min(viewport.width * .27, viewport.height * .22) : Math.min(viewport.width, viewport.height) * .29;
    const angle = -Math.PI / 4 + Math.sin(elapsed * (reducedMotion ? .08 : .22)) * .11;
    const centerY = mobileMode ? viewport.height * .55 : viewport.height / 2;
    node.tx = viewport.width / 2 + Math.cos(angle) * radius;
    node.ty = centerY + Math.sin(angle) * radius;
  }

  function drawSatellite(satellite, index) {
    const orbit = node.r + (mobileMode ? 21 : 27) + index * (mobileMode ? 5 : 8);
    const angle = elapsed * (reducedMotion ? .1 : .42) + satellite.phase;
    const x = node.x + Math.cos(angle) * orbit;
    const y = node.y + Math.sin(angle) * orbit;
    ctx.beginPath(); ctx.moveTo(node.x, node.y); ctx.lineTo(x, y);
    ctx.strokeStyle = `${satellite.color}44`; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 5 + (node.hover ? 2 : 0), 0, Math.PI * 2);
    ctx.fillStyle = satellite.color; ctx.shadowColor = satellite.color; ctx.shadowBlur = node.hover ? 14 : 7; ctx.fill(); ctx.shadowBlur = 0;
    ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = satellite.color; ctx.fillText(satellite.label, x, y - 10);
  }

  function drawSourceNode(source, index) {
    const orbit = node.r + (mobileMode ? 58 : 78) + (index % (mobileMode ? 4 : 3)) * (mobileMode ? 8 : 13);
    const angle = elapsed * (reducedMotion ? .08 : .42) + (source.phase || index * 1.7);
    const x = node.x + Math.cos(angle) * orbit;
    const y = node.y + Math.sin(angle) * orbit;
    source.x = x; source.y = y;
    ctx.beginPath(); ctx.moveTo(node.x, node.y); ctx.lineTo(x, y);
    ctx.strokeStyle = source.hover ? 'rgba(255,212,119,.9)' : 'rgba(255,212,119,.34)'; ctx.lineWidth = source.hover ? 2 : 1; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, source.hover ? 9 : 7, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd477'; ctx.shadowColor = '#ffd477'; ctx.shadowBlur = source.hover ? 18 : 9; ctx.fill(); ctx.shadowBlur = 0;
    ctx.font = `${mobileMode ? 7 : 9}px sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#ffe8ae';
    ctx.fillText(`مصدر ${index + 1}`, x, y - 13);
  }

  function sourceAt(x, y) { return sourceNodes.find((source) => source.x && Math.hypot(x - source.x, y - source.y) <= 14); }

  function draw(timestamp) {
    const dt = Math.min((timestamp - lastTime) / 1000, .05); lastTime = timestamp; elapsed += dt;
    setTarget();
    const ease = 1 - Math.pow(.001, dt * (reducedMotion ? 5 : 11));
    node.x += (node.tx - node.x) * ease; node.y += (node.ty - node.y) * ease;
    node.pulse += dt * (reducedMotion ? .8 : 3.2);
    ctx.clearRect(0, 0, viewport.width, viewport.height);
    if (!reducedMotion) {
      trail.push({ x: node.x, y: node.y, alpha: 1 });
      if (trail.length > (mobileMode ? 18 : 32)) trail.shift();
      trail.forEach((point, index) => {
        point.alpha *= .965;
        ctx.beginPath(); ctx.arc(point.x, point.y, 1.5 + index / 18, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(101,214,255,${point.alpha * .18})`; ctx.fill();
      });
    }

    ctx.beginPath(); ctx.arc(viewport.width / 2, mobileMode ? viewport.height * .55 : viewport.height / 2, Math.min(viewport.width, viewport.height) * (mobileMode ? .24 : .29), 0, Math.PI * 2);
    ctx.setLineDash([3, 11]); ctx.strokeStyle = 'rgba(101,214,255,.12)'; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
    [node.r + 55, node.r + 78, node.r + 105].forEach((radius, index) => {
      ctx.beginPath(); ctx.arc(node.x, node.y, radius, elapsed * (index % 2 ? -.18 : .14), elapsed * (index % 2 ? -.18 : .14) + Math.PI * 1.55);
      ctx.strokeStyle = `rgba(${index === 1 ? '255,212,119' : '101,214,255'},${.12 + index * .035})`; ctx.lineWidth = index === 1 ? 1.5 : 1; ctx.stroke();
    });
    satellites.forEach(drawSatellite);
    sourceNodes.forEach(drawSourceNode);

    const glow = node.r + 10 + Math.sin(node.pulse) * 5 + (node.hover ? 8 : 0);
    for (let i = 2; i >= 0; i--) { ctx.beginPath(); ctx.arc(node.x, node.y, glow + i * 8, 0, Math.PI * 2); ctx.strokeStyle = `rgba(101,214,255,${.16 - i * .035})`; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.beginPath(); ctx.arc(node.x, node.y, node.r + (node.hover ? 3 : 0), 0, Math.PI * 2);
    const gradient = ctx.createRadialGradient(node.x - 10, node.y - 12, 3, node.x, node.y, node.r + 8);
    gradient.addColorStop(0, node.hover ? '#1e7897' : '#12465b'); gradient.addColorStop(.58, '#062d40'); gradient.addColorStop(1, '#031923');
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = gradient; ctx.fill(); ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = '#65d6ff'; ctx.lineWidth = node.hover ? 3 : 2; ctx.stroke();
    ctx.fillStyle = '#65d6ff'; ctx.font = `bold ${mobileMode ? 20 : 23}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('↗', node.x, node.y + 8);
    ctx.font = `bold ${mobileMode ? 9 : 11}px sans-serif`; ctx.fillText('مستكشف HTTPS', node.x, node.y + node.r + (mobileMode ? 15 : 19));
    ctx.font = `${mobileMode ? 7 : 9}px sans-serif`; ctx.fillStyle = '#b8d7e6'; ctx.fillText(node.hover ? 'اضغط لفتح اللوحة' : 'اقترب أو اضغط', node.x, node.y + node.r + (mobileMode ? 27 : 32));

    ripples.splice(0).forEach((ripple) => { ripple.size += dt * 90; ripple.alpha -= dt * 1.2; if (ripple.alpha > 0) { ctx.beginPath(); ctx.arc(ripple.x, ripple.y, ripple.size, 0, Math.PI * 2); ctx.strokeStyle = `rgba(101,214,255,${ripple.alpha})`; ctx.lineWidth = 2; ctx.stroke(); ripples.push(ripple); } });
    requestAnimationFrame(draw);
  }

  function updateHover(x, y) { pointer = { x, y }; node.hover = Math.hypot(x - node.x, y - node.y) <= node.r + 16; sourceNodes.forEach((source) => { source.hover = Math.hypot(x - (source.x || -9999), y - (source.y || -9999)) <= 14; }); canvas.style.cursor = node.hover || sourceNodes.some((source) => source.hover) ? 'pointer' : 'crosshair'; }
  canvas.addEventListener('pointermove', (event) => updateHover(event.clientX, event.clientY));
  canvas.addEventListener('pointerleave', () => { node.hover = false; canvas.style.cursor = 'crosshair'; });
  canvas.addEventListener('pointerdown', (event) => { updateHover(event.clientX, event.clientY); const source = sourceAt(event.clientX, event.clientY); if (source) { ripples.push({ x: source.x, y: source.y, size: 8, alpha: .75 }); sourcesInput.value = source.url; openPanel(); result.textContent = `مصدر ثابت: ${source.title || source.url}`; } else if (node.hover) { ripples.push({ x: node.x, y: node.y, size: node.r, alpha: .75 }); openPanel(); } });
  function openPanel() { panel.classList.add('open'); result.textContent = 'اختر بحثًا أو ألصق رابط HTTPS للتحقق المحلي.'; query.focus(); }
  close.addEventListener('click', () => panel.classList.remove('open'));
  document.getElementById('https-search').addEventListener('click', () => { const text = query.value.trim(); if (!text) { result.textContent = 'اكتب موضوع البحث أولًا.'; return; } const target = `https://duckduckgo.com/?q=${encodeURIComponent(text + ' https')}`; result.textContent = 'سيتم فتح بحث عام محدود؛ لم يتم فتح نتائج أو زحف تلقائي.'; window.open(target, '_blank', 'noopener,noreferrer'); });
  document.getElementById('https-check').addEventListener('click', () => { const raw = urlInput.value.trim(); try { const u = new URL(raw); const privateHost = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.)/i.test(u.hostname); const dangerous = /\.(exe|bat|cmd|sh|scr|dll|zip|js|json|py|mp4|png|jpg|jpeg|gif)$/i.test(u.pathname); if (u.protocol !== 'https:') throw new Error('الرابط ليس HTTPS.'); if (privateHost) throw new Error('النطاق يشير إلى شبكة محلية أو عنوان خاص.'); if (dangerous) throw new Error('امتداد الملف يحتاج مراجعة يدوية.'); result.innerHTML = '<span class="https-safe">الرابط يطابق الفحوصات الشكلية الأساسية.</span><br>هذا لا يثبت سلامة الموقع؛ لم يتم فتح الرابط تلقائيًا.'; } catch (error) { result.innerHTML = `<span class="https-warn">${error.message}</span>`; } });
  function addSourceCard(url, title, note) {
    const li = document.createElement('li');
    const link = document.createElement('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = title || url;
    const meta = document.createElement('div'); meta.className = 'https-source-note'; meta.textContent = `${url} · ${note}`;
    li.append(link, meta); sourceList.append(li);
    if (!sourceNodes.some((source) => source.url === url)) {
      sourceNodes.push({ url, title, phase: sourceNodes.length * 1.37, hover: false });
      localStorage.setItem('cycleLabHttpsSources', JSON.stringify(sourceNodes.slice(-18)));
    }
  }
  async function readSources() {
    const urls = [...new Set(sourcesInput.value.split(/[\n,]+/).map((value) => value.trim()).filter(Boolean))].slice(0, 5);
    if (!urls.length) { result.textContent = 'ضع رابطًا واحدًا على الأقل في قارئ المصادر.'; return; }
    result.textContent = `جارٍ قراءة ${urls.length} مصدرًا ضمن الحدود الآمنة…`;
    for (const raw of urls) {
      try {
        const target = new URL(raw);
        if (target.protocol !== 'https:') throw new Error('ليس HTTPS');
        if (target.origin !== location.origin) { addSourceCard(target.href, 'مرجع خارجي HTTPS', 'تم حفظ المرجع فقط؛ قراءة المحتوى الخارجي محجوبة بواسطة المتصفح'); continue; }
        const response = await fetch(target.href, { cache: 'no-store', credentials: 'omit' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        doc.querySelectorAll('script,style,noscript,svg').forEach((node) => node.remove());
        const title = doc.title?.textContent.trim() || target.href;
        const description = doc.querySelector('meta[name="description"]')?.content?.trim();
        const snippet = (description || doc.body?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 180);
        addSourceCard(target.href, title, snippet || 'تمت قراءة الصفحة بدون وصف نصي');
      } catch (error) { addSourceCard(raw, 'تعذر قراءة المصدر', error.message); }
    }
    result.textContent = 'اكتملت قراءة المصادر. لم يتم تنفيذ أي كود أو الزحف خارج نطاق الموقع.';
  }
  function autoSearchSources() {
    const text = sourceQuery.value.trim();
    if (!text) { result.textContent = 'اكتب موضوعًا للبحث عن المصادر.'; return; }
    const encoded = encodeURIComponent(`${text} sources HTTPS`);
    const searches = [
      ['DuckDuckGo · بحث عام', `https://duckduckgo.com/?q=${encoded}`],
      ['Bing · بحث عام', `https://www.bing.com/search?q=${encoded}`],
      ['Google Scholar · مصادر أكاديمية', `https://scholar.google.com/scholar?q=${encodeURIComponent(text)}`],
    ];
    searches.forEach(([title, url]) => addSourceCard(url, title, 'رابط بحث مولّد تلقائيًا؛ اختر المصادر يدويًا قبل قراءتها'));
    result.textContent = 'تم إنشاء 3 بوابات بحث للمصادر. لم يتم فتح النتائج أو قراءة مواقع خارجية تلقائيًا.';
  }
  document.getElementById('https-read-sources').addEventListener('click', readSources);
  document.getElementById('https-auto-sources').addEventListener('click', autoSearchSources);
  draw(performance.now());
})();
