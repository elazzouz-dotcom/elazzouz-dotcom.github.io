(() => {
  const canvas = document.getElementById('https-layer');
  const panel = document.getElementById('https-panel');
  const query = document.getElementById('https-query');
  const urlInput = document.getElementById('https-url');
  const result = document.getElementById('https-result');
  const close = document.getElementById('https-close');
  if (!canvas || !panel) return;
  const ctx = canvas.getContext('2d');
  let node = { x: 0, y: 0, r: 38, pulse: 0 };
  const resize = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
  addEventListener('resize', resize); resize();

  function position() {
    const radius = Math.min(innerWidth, innerHeight) * .29;
    const angle = -Math.PI / 4 + Math.sin(performance.now() / 3000) * .08;
    node.x = innerWidth / 2 + Math.cos(angle) * radius;
    node.y = innerHeight / 2 + Math.sin(angle) * radius;
  }
  function draw() {
    position(); node.pulse += .045;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const glow = node.r + 8 + Math.sin(node.pulse) * 5;
    ctx.beginPath(); ctx.arc(node.x, node.y, glow, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(101,214,255,.34)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(3,25,38,.94)'; ctx.fill(); ctx.strokeStyle = '#65d6ff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#65d6ff'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('↗', node.x, node.y + 7);
    ctx.font = 'bold 11px sans-serif'; ctx.fillText('مستكشف HTTPS', node.x, node.y + node.r + 18);
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#b8d7e6'; ctx.fillText('اضغط للاستكشاف', node.x, node.y + node.r + 31);
    requestAnimationFrame(draw);
  }
  function openPanel() { panel.classList.add('open'); result.textContent = 'اختر بحثًا أو ألصق رابط HTTPS للتحقق المحلي.'; query.focus(); }
  canvas.addEventListener('click', (event) => {
    const rect = canvas.getBoundingClientRect();
    const distance = Math.hypot(event.clientX - rect.left - node.x, event.clientY - rect.top - node.y);
    if (distance <= node.r + 14) openPanel();
  });
  close.addEventListener('click', () => panel.classList.remove('open'));
  document.getElementById('https-search').addEventListener('click', () => {
    const text = query.value.trim();
    if (!text) { result.textContent = 'اكتب موضوع البحث أولًا.'; return; }
    const target = `https://duckduckgo.com/?q=${encodeURIComponent(text + ' https')}`;
    result.textContent = 'سيتم فتح بحث عام محدود؛ لم يتم فتح نتائج أو زحف تلقائي.';
    window.open(target, '_blank', 'noopener,noreferrer');
  });
  document.getElementById('https-check').addEventListener('click', () => {
    const raw = urlInput.value.trim();
    try {
      const u = new URL(raw);
      const privateHost = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.)/i.test(u.hostname);
      const dangerous = /\.(exe|bat|cmd|sh|scr|dll|zip|js|json|py|mp4|png|jpg|jpeg|gif)$/i.test(u.pathname);
      if (u.protocol !== 'https:') throw new Error('الرابط ليس HTTPS.');
      if (privateHost) throw new Error('النطاق يشير إلى شبكة محلية أو عنوان خاص.');
      if (dangerous) throw new Error('امتداد الملف يحتاج مراجعة يدوية.');
      result.innerHTML = '<span class="https-safe">الرابط يطابق الفحوصات الشكلية الأساسية.</span><br>هذا لا يثبت سلامة الموقع؛ لم يتم فتح الرابط تلقائيًا.';
    } catch (error) { result.innerHTML = `<span class="https-warn">${error.message}</span>`; }
  });
  draw();
})();
