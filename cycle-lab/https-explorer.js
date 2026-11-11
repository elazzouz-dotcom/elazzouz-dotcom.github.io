(() => {
  const canvas = document.getElementById('https-layer');
  const panel = document.getElementById('https-panel');
  const query = document.getElementById('https-query');
  const urlInput = document.getElementById('https-url');
  const result = document.getElementById('https-result');
  const close = document.getElementById('https-close');
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

  function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }
  addEventListener('resize', resize); resize();

  function setTarget() {
    const radius = Math.min(innerWidth, innerHeight) * (innerWidth < 600 ? .32 : .29);
    const angle = -Math.PI / 4 + Math.sin(elapsed * (reducedMotion ? .08 : .22)) * .11;
    node.tx = innerWidth / 2 + Math.cos(angle) * radius;
    node.ty = innerHeight / 2 + Math.sin(angle) * radius;
  }

  function drawSatellite(satellite, index) {
    const orbit = node.r + 27 + index * 8;
    const angle = elapsed * (reducedMotion ? .1 : .42) + satellite.phase;
    const x = node.x + Math.cos(angle) * orbit;
    const y = node.y + Math.sin(angle) * orbit;
    ctx.beginPath(); ctx.moveTo(node.x, node.y); ctx.lineTo(x, y);
    ctx.strokeStyle = `${satellite.color}44`; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 5 + (node.hover ? 2 : 0), 0, Math.PI * 2);
    ctx.fillStyle = satellite.color; ctx.shadowColor = satellite.color; ctx.shadowBlur = node.hover ? 14 : 7; ctx.fill(); ctx.shadowBlur = 0;
    ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = satellite.color; ctx.fillText(satellite.label, x, y - 10);
  }

  function draw(timestamp) {
    const dt = Math.min((timestamp - lastTime) / 1000, .05); lastTime = timestamp; elapsed += dt;
    setTarget();
    const ease = 1 - Math.pow(.001, dt * (reducedMotion ? 5 : 11));
    node.x += (node.tx - node.x) * ease; node.y += (node.ty - node.y) * ease;
    node.pulse += dt * (reducedMotion ? .8 : 3.2);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.beginPath(); ctx.arc(innerWidth / 2, innerHeight / 2, Math.min(innerWidth, innerHeight) * .29, 0, Math.PI * 2);
    ctx.setLineDash([3, 11]); ctx.strokeStyle = 'rgba(101,214,255,.12)'; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
    satellites.forEach(drawSatellite);

    const glow = node.r + 10 + Math.sin(node.pulse) * 5 + (node.hover ? 8 : 0);
    for (let i = 2; i >= 0; i--) { ctx.beginPath(); ctx.arc(node.x, node.y, glow + i * 8, 0, Math.PI * 2); ctx.strokeStyle = `rgba(101,214,255,${.16 - i * .035})`; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.beginPath(); ctx.arc(node.x, node.y, node.r + (node.hover ? 3 : 0), 0, Math.PI * 2);
    ctx.fillStyle = node.hover ? 'rgba(6,45,64,.98)' : 'rgba(3,25,38,.95)'; ctx.fill(); ctx.strokeStyle = '#65d6ff'; ctx.lineWidth = node.hover ? 3 : 2; ctx.stroke();
    ctx.fillStyle = '#65d6ff'; ctx.font = 'bold 23px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('↗', node.x, node.y + 8);
    ctx.font = 'bold 11px sans-serif'; ctx.fillText('مستكشف HTTPS', node.x, node.y + node.r + 19);
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#b8d7e6'; ctx.fillText(node.hover ? 'اضغط لفتح اللوحة' : 'اقترب أو اضغط', node.x, node.y + node.r + 32);

    ripples.splice(0).forEach((ripple) => { ripple.size += dt * 90; ripple.alpha -= dt * 1.2; if (ripple.alpha > 0) { ctx.beginPath(); ctx.arc(ripple.x, ripple.y, ripple.size, 0, Math.PI * 2); ctx.strokeStyle = `rgba(101,214,255,${ripple.alpha})`; ctx.lineWidth = 2; ctx.stroke(); ripples.push(ripple); } });
    requestAnimationFrame(draw);
  }

  function updateHover(x, y) { pointer = { x, y }; node.hover = Math.hypot(x - node.x, y - node.y) <= node.r + 16; canvas.style.cursor = node.hover ? 'pointer' : 'crosshair'; }
  canvas.addEventListener('pointermove', (event) => updateHover(event.clientX, event.clientY));
  canvas.addEventListener('pointerleave', () => { node.hover = false; canvas.style.cursor = 'crosshair'; });
  canvas.addEventListener('pointerdown', (event) => { updateHover(event.clientX, event.clientY); if (node.hover) { ripples.push({ x: node.x, y: node.y, size: node.r, alpha: .75 }); openPanel(); } });
  function openPanel() { panel.classList.add('open'); result.textContent = 'اختر بحثًا أو ألصق رابط HTTPS للتحقق المحلي.'; query.focus(); }
  close.addEventListener('click', () => panel.classList.remove('open'));
  document.getElementById('https-search').addEventListener('click', () => { const text = query.value.trim(); if (!text) { result.textContent = 'اكتب موضوع البحث أولًا.'; return; } const target = `https://duckduckgo.com/?q=${encodeURIComponent(text + ' https')}`; result.textContent = 'سيتم فتح بحث عام محدود؛ لم يتم فتح نتائج أو زحف تلقائي.'; window.open(target, '_blank', 'noopener,noreferrer'); });
  document.getElementById('https-check').addEventListener('click', () => { const raw = urlInput.value.trim(); try { const u = new URL(raw); const privateHost = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.)/i.test(u.hostname); const dangerous = /\.(exe|bat|cmd|sh|scr|dll|zip|js|json|py|mp4|png|jpg|jpeg|gif)$/i.test(u.pathname); if (u.protocol !== 'https:') throw new Error('الرابط ليس HTTPS.'); if (privateHost) throw new Error('النطاق يشير إلى شبكة محلية أو عنوان خاص.'); if (dangerous) throw new Error('امتداد الملف يحتاج مراجعة يدوية.'); result.innerHTML = '<span class="https-safe">الرابط يطابق الفحوصات الشكلية الأساسية.</span><br>هذا لا يثبت سلامة الموقع؛ لم يتم فتح الرابط تلقائيًا.'; } catch (error) { result.innerHTML = `<span class="https-warn">${error.message}</span>`; } });
  draw(performance.now());
})();
