(() => {
  'use strict';

  const LIMIT = 300;
  const ROLES = [
    { id: 'explore', label: 'استكشاف', color: '#59e0a3' },
    { id: 'inspect', label: 'فحص تعليمي', color: '#f4ce72' },
    { id: 'protect', label: 'حماية افتراضية', color: '#70a7ff' }
  ];
  const canvas = document.querySelector('#swarm-canvas');
  const context = canvas?.getContext('2d');
  const logList = document.querySelector('#swarm-log');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let agents = [];
  let nextId = 1;
  let running = !reduceMotion;
  let stability = 75;
  let logicalWidth = 0;
  let logicalHeight = 0;
  let drawFrame = 0;
  let simulationTimer = 0;

  const countNodes = {
    total: document.querySelector('#agent-count'),
    explore: document.querySelector('#explore-count'),
    inspect: document.querySelector('#inspect-count'),
    protect: document.querySelector('#protect-count')
  };
  const meterNodes = {
    total: document.querySelector('#agent-meter'),
    explore: document.querySelector('#explore-meter'),
    inspect: document.querySelector('#inspect-meter'),
    protect: document.querySelector('#protect-meter'),
    stability: document.querySelector('#stability-meter')
  };

  function countByRole() {
    const counts = Object.fromEntries(ROLES.map((role) => [role.id, 0]));
    for (const agent of agents) counts[agent.role] += 1;
    return counts;
  }

  function smallestRole(counts = countByRole()) {
    return [...ROLES].sort((left, right) => counts[left.id] - counts[right.id])[0].id;
  }

  function addAgent(role = smallestRole()) {
    if (agents.length >= LIMIT) return false;
    const roleData = ROLES.find((candidate) => candidate.id === role) || ROLES[0];
    agents.push({
      id: nextId++,
      role: roleData.id,
      energy: 95 + Math.random() * 15,
      age: 0,
      x: Math.random() * logicalWidth,
      y: Math.random() * logicalHeight,
      vx: (Math.random() - 0.5) * 1.25,
      vy: (Math.random() - 0.5) * 1.25
    });
    return true;
  }

  function updateMetrics() {
    const counts = countByRole();
    countNodes.total.textContent = String(agents.length);
    countNodes.explore.textContent = String(counts.explore);
    countNodes.inspect.textContent = String(counts.inspect);
    countNodes.protect.textContent = String(counts.protect);
    meterNodes.total.style.width = `${Math.min(100, agents.length / LIMIT * 100)}%`;
    for (const role of ROLES) {
      meterNodes[role.id].style.width = `${agents.length ? counts[role.id] / agents.length * 100 : 0}%`;
    }
    document.querySelector('#stability-value').textContent = `${stability.toFixed(1)}%`;
    meterNodes.stability.style.width = `${stability}%`;
  }

  function logEvent(message) {
    const item = document.createElement('li');
    item.textContent = message;
    logList.appendChild(item);
    while (logList.children.length > 60) logList.firstElementChild.remove();
    logList.scrollTop = logList.scrollHeight;
  }

  function resizeCanvas() {
    if (!canvas || !context) return;
    const bounds = canvas.getBoundingClientRect();
    const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    logicalWidth = Math.max(1, bounds.width);
    logicalHeight = Math.max(1, bounds.height);
    canvas.width = Math.round(logicalWidth * ratio);
    canvas.height = Math.round(logicalHeight * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    for (const agent of agents) {
      agent.x = Math.min(logicalWidth, agent.x);
      agent.y = Math.min(logicalHeight, agent.y);
    }
    requestDraw();
  }

  function draw() {
    if (!context) return;
    context.clearRect(0, 0, logicalWidth, logicalHeight);
    context.lineWidth = 0.8;
    for (let index = 0; index < agents.length; index += 5) {
      const first = agents[index];
      for (let otherIndex = index + 1; otherIndex < Math.min(index + 6, agents.length); otherIndex += 1) {
        const second = agents[otherIndex];
        const dx = first.x - second.x;
        const dy = first.y - second.y;
        if (dx * dx + dy * dy < 55 * 55) {
          context.strokeStyle = 'rgba(89,224,163,0.16)';
          context.beginPath();
          context.moveTo(first.x, first.y);
          context.lineTo(second.x, second.y);
          context.stroke();
        }
      }
    }
    for (const agent of agents) {
      if (running && !reduceMotion) {
        agent.x += agent.vx;
        agent.y += agent.vy;
        if (agent.x < 3 || agent.x > logicalWidth - 3) agent.vx *= -1;
        if (agent.y < 3 || agent.y > logicalHeight - 3) agent.vy *= -1;
        agent.x = Math.min(logicalWidth - 3, Math.max(3, agent.x));
        agent.y = Math.min(logicalHeight - 3, Math.max(3, agent.y));
      }
      const role = ROLES.find((candidate) => candidate.id === agent.role) || ROLES[0];
      context.fillStyle = role.color;
      context.globalAlpha = 0.9;
      context.beginPath();
      context.arc(agent.x, agent.y, 2.8, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function requestDraw() {
    if (drawFrame) return;
    drawFrame = window.requestAnimationFrame(() => {
      drawFrame = 0;
      draw();
      if (running && !reduceMotion) requestDraw();
    });
  }

  function tick() {
    const batch = agents.slice(0, 7);
    for (const agent of batch) {
      agent.age += 1;
      agent.energy -= 0.25;
      if (agent.energy < 30) agent.energy += 8;
      if (Math.random() < 0.035) {
        const counts = countByRole();
        const average = agents.length / ROLES.length;
        if (counts[agent.role] > average + 4 && Math.random() < 0.35) agent.role = smallestRole(counts);
      }
      if (agent.role === 'protect' && Math.random() < 0.04) {
        stability = Math.min(90, Math.max(60, stability * 0.92 + 75 * 0.08 + (Math.random() - 0.5)));
      }
    }
    updateMetrics();
    requestDraw();
  }

  function setRunning(value) {
    running = value;
    const button = document.querySelector('#swarm-toggle');
    const status = document.querySelector('#swarm-state');
    button.setAttribute('aria-pressed', String(running));
    button.textContent = running ? 'إيقاف المحاكاة' : 'تشغيل المحاكاة';
    status.textContent = running ? 'المحاكاة تعمل محليًا' : 'المحاكاة متوقفة';
    if (running) {
      if (!simulationTimer) simulationTimer = window.setInterval(tick, 360);
      requestDraw();
    } else if (simulationTimer) {
      window.clearInterval(simulationTimer);
      simulationTimer = 0;
      requestDraw();
    }
  }

  function rebalance() {
    const startAt = nextId % ROLES.length;
    agents.forEach((agent, index) => { agent.role = ROLES[(index + startAt) % ROLES.length].id; });
    stability = 75;
    updateMetrics();
    requestDraw();
    logEvent(`أُعيد توزيع ${agents.length} وكيلًا على الأدوار الثلاثة بالتساوي قدر الإمكان.`);
  }

  document.querySelector('#swarm-toggle').addEventListener('click', () => {
    setRunning(!running);
    logEvent(running ? 'استؤنفت المحاكاة المحلية.' : 'أُوقفت الحركة مؤقتًا.');
  });
  document.querySelector('#swarm-rebalance').addEventListener('click', rebalance);
  document.querySelector('#swarm-add').addEventListener('click', () => {
    const before = agents.length;
    for (let count = 0; count < 10 && agents.length < LIMIT; count += 1) addAgent();
    updateMetrics();
    requestDraw();
    const added = agents.length - before;
    logEvent(added ? `أُضيف ${added} وكلاء؛ العدد الحالي ${agents.length} من ${LIMIT}.` : `وصل السرب إلى الحد الأعلى ${LIMIT}؛ لم يُضف وكلاء جدد.`);
  });
  document.querySelector('#swarm-clear').addEventListener('click', () => {
    logList.replaceChildren();
    logEvent('مُسح سجل الأحداث من الصفحة الحالية.');
  });

  if ('ResizeObserver' in window) new ResizeObserver(resizeCanvas).observe(canvas);
  else window.addEventListener('resize', resizeCanvas, { passive: true });
  resizeCanvas();
  for (let index = 0; index < 57; index += 1) addAgent(ROLES[index % ROLES.length].id);
  updateMetrics();
  logEvent('بدأت المحاكاة من 57 وكيلًا موزعين بالتساوي بين ثلاثة أدوار افتراضية.');
  logEvent('لا تُجرى اتصالات أو عمليات فحص خارج هذه الصفحة.');
  setRunning(running);
  if (reduceMotion) logEvent('بدأت متوقفة احترامًا لتفضيل تقليل الحركة في الجهاز.');
})();
