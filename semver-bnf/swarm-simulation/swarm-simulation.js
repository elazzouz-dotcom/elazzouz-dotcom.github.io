(() => {
  'use strict';

  const Model = window.SwarmSimulationModel;
  const NumpyPCG64 = window.NumpyPCG64;
  if (!Model || !NumpyPCG64) {
    const status = document.querySelector('#swarm-state');
    if (status) status.textContent = 'تعذر تحميل نموذج المحاكاة أو مولّد الأعداد المحلي.';
    return;
  }
  const canvas = document.querySelector('#swarm-canvas');
  const context = canvas?.getContext('2d');
  const logList = document.querySelector('#swarm-log');
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  const $ = (selector) => document.querySelector(selector);
  const { ROLES, SCENARIOS, MIN_AGENTS, MAX_AGENTS, DEFAULT_AGENTS } = Model;
  const RNG_SEED = 12345;
  let rng = new NumpyPCG64(RNG_SEED);
  const random = () => rng.random();
  let agents = [];
  let nextId = 1;
  let tickCursor = 0;
  let running = !reduceMotion;
  let speed = 1;
  let logicalWidth = 0;
  let logicalHeight = 0;
  let drawFrame = 0;
  let simulationTimer = 0;

  const countNodes = {
    total: $('#agent-count'),
    explore: $('#explore-count'),
    inspect: $('#inspect-count'),
    protect: $('#protect-count')
  };
  const meterNodes = {
    total: $('#agent-meter'),
    explore: $('#explore-meter'),
    inspect: $('#inspect-meter'),
    protect: $('#protect-meter'),
    balance: $('#balance-meter')
  };
  const roleCounts = () => Model.countRoles(agents);

  function logEvent(message) {
    const item = document.createElement('li');
    item.textContent = message;
    logList.appendChild(item);
    while (logList.children.length > 60) logList.firstElementChild.remove();
    logList.scrollTop = logList.scrollHeight;
  }

  function updateMetrics(syncPopulationControl = false) {
    const counts = roleCounts();
    const balance = Model.calculateBalancePercent(counts);
    countNodes.total.textContent = String(agents.length);
    countNodes.explore.textContent = String(counts.explore);
    countNodes.inspect.textContent = String(counts.inspect);
    countNodes.protect.textContent = String(counts.protect);
    meterNodes.total.style.width = `${agents.length / MAX_AGENTS * 100}%`;
    for (const role of ROLES) meterNodes[role.id].style.width = `${agents.length ? counts[role.id] / agents.length * 100 : 0}%`;
    $('#balance-value').textContent = `${balance}%`;
    meterNodes.balance.style.width = `${balance}%`;
    if (syncPopulationControl) {
      $('#swarm-count').value = String(agents.length);
      $('#swarm-count-value').value = String(agents.length);
      $('#swarm-count-value').textContent = String(agents.length);
    }
  }

  function makeAgent(role) {
    return {
      id: nextId++,
      role,
      energy: 95 + random() * 15,
      age: 0,
      x: random() * logicalWidth,
      y: random() * logicalHeight,
      vx: (random() - 0.5) * 1.25,
      vy: (random() - 0.5) * 1.25
    };
  }

  function applyAssignments(assignments) {
    agents.forEach((agent, index) => { agent.role = assignments[index]; });
    updateMetrics();
    requestDraw();
  }

  function setPopulation(value, scenario = $('#swarm-scenario').value) {
    const target = Model.clampAgentCount(value);
    if (target === agents.length) return target;
    const assignments = Model.createRoleAssignments(target, scenario, random);
    if (target < agents.length) agents.length = target;
    while (agents.length < target) agents.push(makeAgent(assignments[agents.length]));
    applyAssignments(assignments);
    updateMetrics(true);
    return target;
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
        agent.x += agent.vx * speed;
        agent.y += agent.vy * speed;
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

  function smallestRole(counts) {
    return [...ROLES].sort((left, right) => counts[left.id] - counts[right.id])[0].id;
  }

  function tick() {
    const counts = roleCounts();
    const average = agents.length / ROLES.length;
    const batchSize = Math.min(10, agents.length);
    const batch = Array.from({ length: batchSize }, (_, offset) => agents[(tickCursor + offset) % agents.length]);
    tickCursor = (tickCursor + batchSize) % agents.length;
    for (const agent of batch) {
      agent.age += 1;
      agent.energy -= 0.25;
      if (agent.energy < 30) agent.energy += 8;
      if (counts[agent.role] > average + 4 && random() < 0.12) {
        const previousRole = agent.role;
        const nextRole = smallestRole(counts);
        if (nextRole !== previousRole) {
          counts[previousRole] -= 1;
          counts[nextRole] += 1;
          agent.role = nextRole;
        }
      }
    }
    updateMetrics();
    requestDraw();
  }

  function intervalForSpeed() {
    return Math.max(120, Math.round(360 / speed));
  }

  function syncTimer() {
    if (simulationTimer) window.clearInterval(simulationTimer);
    simulationTimer = running ? window.setInterval(tick, intervalForSpeed()) : 0;
  }

  function setRunning(value) {
    running = value;
    const button = $('#swarm-toggle');
    const status = $('#swarm-state');
    button.setAttribute('aria-pressed', String(running));
    button.textContent = running ? 'إيقاف المحاكاة' : 'تشغيل المحاكاة';
    status.textContent = running
      ? (reduceMotion ? 'الحسابات تعمل؛ الحركة المرئية متوقفة لتقليل الحركة' : `المحاكاة تعمل محليًا · ${speed}×`)
      : 'المحاكاة متوقفة';
    syncTimer();
    requestDraw();
  }

  function applyScenario() {
    const scenario = $('#swarm-scenario').value;
    const assignments = Model.createRoleAssignments(agents.length, scenario, random);
    applyAssignments(assignments);
    logEvent(`طُبق سيناريو «${SCENARIOS[scenario].label}» على ${agents.length} وكيلًا.`);
  }

  function setSpeed(value, announce = false) {
    speed = Math.min(3, Math.max(0.5, Number(value) || 1));
    const shown = `${speed}×`;
    $('#swarm-speed-value').value = shown;
    $('#swarm-speed-value').textContent = shown;
    if (running) {
      syncTimer();
      $('#swarm-state').textContent = reduceMotion
        ? 'الحسابات تعمل؛ الحركة المرئية متوقفة لتقليل الحركة'
        : `المحاكاة تعمل محليًا · ${speed}×`;
    }
    requestDraw();
    if (announce) logEvent(`ضُبطت سرعة خطوات المحاكاة على ${shown}.`);
  }

  function resetSimulation() {
    setRunning(false);
    nextId = 1;
    tickCursor = 0;
    agents = [];
    rng = new NumpyPCG64(RNG_SEED);
    $('#swarm-scenario').value = 'balanced';
    setSpeed(1);
    setPopulation(DEFAULT_AGENTS, 'balanced');
    logEvent('أُعيدت التجربة إلى 57 وكيلًا وتوزيع متوازن وسرعة 1×.');
  }

  $('#swarm-toggle').addEventListener('click', () => {
    setRunning(!running);
    logEvent(running ? 'استؤنفت المحاكاة المحلية.' : 'أُوقفت الحركة مؤقتًا.');
  });
  $('#swarm-rebalance').addEventListener('click', () => {
    $('#swarm-scenario').value = 'balanced';
    applyScenario();
  });
  $('#swarm-apply-scenario').addEventListener('click', applyScenario);
  $('#swarm-add').addEventListener('click', () => {
    const target = Model.clampAgentCount(agents.length + 10);
    const previous = agents.length;
    setPopulation(target);
    logEvent(target === previous ? `وصل السرب إلى الحد الأعلى ${MAX_AGENTS}؛ لم يُضف وكلاء.` : `أُضيف ${target - previous} وكلاء؛ العدد الحالي ${target}.`);
  });
  $('#swarm-remove').addEventListener('click', () => {
    const target = Model.clampAgentCount(agents.length - 10);
    const previous = agents.length;
    setPopulation(target);
    logEvent(target === previous ? `الحد الأدنى هو ${MIN_AGENTS} وكلاء؛ لم يُحذف المزيد.` : `أُزيل ${previous - target} وكلاء؛ العدد الحالي ${target}.`);
  });
  $('#swarm-apply-count').addEventListener('click', () => {
    const target = setPopulation($('#swarm-count').value);
    logEvent(`ضُبط حجم السرب على ${target} وكيلًا ضمن الحد ${MIN_AGENTS}–${MAX_AGENTS}.`);
  });
  $('#swarm-count').addEventListener('input', (event) => {
    $('#swarm-count-value').value = event.currentTarget.value;
    $('#swarm-count-value').textContent = event.currentTarget.value;
  });
  $('#swarm-speed').addEventListener('input', (event) => setSpeed(event.currentTarget.value));
  $('#swarm-speed').addEventListener('change', (event) => setSpeed(event.currentTarget.value, true));
  $('#swarm-reset').addEventListener('click', resetSimulation);
  $('#swarm-clear').addEventListener('click', () => {
    logList.replaceChildren();
    logEvent('مُسح سجل الأحداث من الصفحة الحالية.');
  });

  if ('ResizeObserver' in window) new ResizeObserver(resizeCanvas).observe(canvas);
  else window.addEventListener('resize', resizeCanvas, { passive: true });
  resizeCanvas();
  setPopulation(DEFAULT_AGENTS, 'balanced');
  updateMetrics(true);
  logEvent('بدأت التجربة من 57 وكيلًا ببذرة NumPy PCG64 الثابتة 12345.');
  logEvent('لا تُجرى اتصالات أو عمليات فحص خارج هذه الصفحة.');
  setRunning(running);
  if (reduceMotion) logEvent('بدأت متوقفة احترامًا لتفضيل تقليل الحركة في الجهاز.');
})();
