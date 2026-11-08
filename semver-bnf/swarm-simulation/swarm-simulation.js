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
  const distributionCanvas = document.querySelector('#swarm-distribution-canvas');
  const distributionContext = distributionCanvas?.getContext('2d');
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
  let distributionValues = [];
  let distributionType = 'gaussian';

  const DISTRIBUTION_LABELS = Object.freeze({
    uniform: 'المنتظم',
    gaussian: 'الطبيعي (Gaussian)',
    poisson: 'بواسون (Poisson)'
  });

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

  function formatDistributionNumber(value) {
    return Number(value).toLocaleString('en-US', { maximumFractionDigits: 3 });
  }

  function drawDistributionHistogram(values, type) {
    if (!distributionCanvas || !distributionContext || values.length === 0) return;
    const bounds = distributionCanvas.getBoundingClientRect();
    const width = Math.max(1, bounds.width);
    const height = Math.max(180, bounds.height);
    const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    distributionCanvas.width = Math.round(width * ratio);
    distributionCanvas.height = Math.round(height * ratio);
    distributionContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    distributionContext.clearRect(0, 0, width, height);

    let bins;
    let minimum;
    let maximum;
    if (type === 'poisson') {
      minimum = 0;
      maximum = Math.max(0, ...values);
      const binWidth = Math.max(1, Math.ceil((maximum + 1) / 36));
      bins = Array.from({ length: Math.ceil((maximum + 1) / binWidth) }, () => 0);
      for (const value of values) bins[Math.min(bins.length - 1, Math.floor(value / binWidth))] += 1;
    } else {
      const observedMinimum = Math.min(...values);
      const observedMaximum = Math.max(...values);
      const padding = observedMinimum === observedMaximum
        ? Math.max(0.5, Math.abs(observedMinimum) * 0.05)
        : (observedMaximum - observedMinimum) * 0.025;
      minimum = observedMinimum - padding;
      maximum = observedMaximum + padding;
      bins = Array.from({ length: 28 }, () => 0);
      const span = Math.max(Number.EPSILON, maximum - minimum);
      for (const value of values) {
        const index = Math.min(bins.length - 1, Math.max(0, Math.floor((value - minimum) / span * bins.length)));
        bins[index] += 1;
      }
    }

    const padding = { top: 16, right: 12, bottom: 34, left: 42 };
    const chartWidth = Math.max(1, width - padding.left - padding.right);
    const chartHeight = Math.max(1, height - padding.top - padding.bottom);
    const chartBottom = padding.top + chartHeight;
    const peak = Math.max(1, ...bins);
    const ctx = distributionContext;
    ctx.font = '11px system-ui, sans-serif';
    ctx.direction = 'ltr';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let tick = 0; tick <= 3; tick += 1) {
      const y = chartBottom - chartHeight * tick / 3;
      const value = Math.round(peak * tick / 3);
      ctx.strokeStyle = 'rgba(255,255,255,0.09)';
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(226,238,234,0.66)';
      ctx.fillText(String(value), padding.left - 7, y);
    }
    const barWidth = chartWidth / bins.length;
    bins.forEach((value, index) => {
      const barHeight = value / peak * chartHeight;
      const x = padding.left + index * barWidth;
      ctx.fillStyle = type === 'poisson' ? 'rgba(244,206,114,0.82)' : 'rgba(89,224,163,0.82)';
      ctx.fillRect(x + 1, chartBottom - barHeight, Math.max(1, barWidth - 2), barHeight);
    });
    ctx.fillStyle = 'rgba(226,238,234,0.7)';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillText(formatDistributionNumber(minimum), padding.left, height - 9);
    ctx.textAlign = 'right';
    ctx.fillText(formatDistributionNumber(maximum), width - padding.right, height - 9);
    distributionCanvas.setAttribute('aria-label', `مخطط تكراري لتوزيع ${DISTRIBUTION_LABELS[type]} لعدد ${values.length} عينة.`);
  }

  function readDistributionNumber(selector) {
    const raw = $(selector).value.trim();
    if (!raw) throw new RangeError('أكمل معاملات التوزيع قبل توليد العينة.');
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) throw new RangeError('اكتب قيمة رقمية صالحة في معاملات التوزيع.');
    return numeric;
  }

  function distributionParameters(type) {
    if (type === 'uniform') {
      const minimum = readDistributionNumber('#swarm-uniform-min');
      const maximum = readDistributionNumber('#swarm-uniform-max');
      if (minimum < -Model.MAX_DISTRIBUTION_BOUND || maximum > Model.MAX_DISTRIBUTION_BOUND || minimum >= maximum) {
        throw new RangeError(`حدود Uniform ضمن ±${Model.MAX_DISTRIBUTION_BOUND}، ويجب أن يكون الأعلى أكبر من الأدنى.`);
      }
      return { minimum, maximum };
    }
    if (type === 'gaussian') {
      const mean = readDistributionNumber('#swarm-gaussian-mean');
      const standardDeviation = readDistributionNumber('#swarm-gaussian-deviation');
      if (mean < -Model.MAX_DISTRIBUTION_BOUND || mean > Model.MAX_DISTRIBUTION_BOUND
        || standardDeviation < 0 || standardDeviation > Model.MAX_GAUSSIAN_DEVIATION) {
        throw new RangeError(`يجب أن يكون متوسط Gaussian ضمن ±${Model.MAX_DISTRIBUTION_BOUND} وانحرافه بين 0 و${Model.MAX_GAUSSIAN_DEVIATION}.`);
      }
      return { mean, standardDeviation };
    }
    const lambda = readDistributionNumber('#swarm-poisson-lambda');
    if (!Number.isFinite(lambda) || lambda < 0 || lambda > Model.MAX_POISSON_RATE) {
      throw new RangeError(`يجب أن يكون معدل Poisson بين 0 و${Model.MAX_POISSON_RATE}.`);
    }
    return { lambda };
  }

  function updateDistributionParameters() {
    const type = $('#swarm-distribution').value;
    $('#swarm-uniform-parameters').hidden = type !== 'uniform';
    $('#swarm-gaussian-parameters').hidden = type !== 'gaussian';
    $('#swarm-poisson-parameters').hidden = type !== 'poisson';
    $('#swarm-distribution-state').textContent = `التوزيع المحدد: ${DISTRIBUTION_LABELS[type]}. اضغط توليد العينة لعرضها.`;
  }

  function generateDistributionSample(announce = true) {
    const state = $('#swarm-distribution-state');
    try {
      const seedText = $('#swarm-distribution-seed').value.trim();
      if (!/^\d{1,256}$/.test(seedText)) throw new RangeError('اكتب بذرة صحيحة غير سالبة مكوّنة من أرقام فقط.');
      const seed = BigInt(seedText);
      const count = Number($('#swarm-sample-count').value);
      const type = $('#swarm-distribution').value;
      const parameters = distributionParameters(type);
      const sampleRng = new NumpyPCG64(seed);
      distributionValues = Model.sampleDistribution(sampleRng, type, count, parameters);
      distributionType = type;
      const summary = Model.summarizeSamples(distributionValues);
      $('#swarm-distribution-count-result').textContent = String(summary.count);
      $('#swarm-distribution-mean-result').textContent = formatDistributionNumber(summary.mean);
      $('#swarm-distribution-variance-result').textContent = formatDistributionNumber(summary.variance);
      $('#swarm-distribution-range-result').textContent = `${formatDistributionNumber(summary.minimum)} / ${formatDistributionNumber(summary.maximum)}`;
      drawDistributionHistogram(distributionValues, distributionType);
      state.textContent = `تم توليد ${summary.count} عينة من ${DISTRIBUTION_LABELS[type]} بالبذرة ${seedText}.`;
      if (announce) logEvent(`وُلّدت عينة ${DISTRIBUTION_LABELS[type]} من ${summary.count} قيمة؛ بقي تيار حركة السرب مستقلًا.`);
    } catch (error) {
      state.textContent = error instanceof RangeError
        ? error.message
        : 'تعذر توليد العينة؛ تحقّق من البذرة والمعاملات المدخلة.';
    }
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

  $('#swarm-distribution').addEventListener('change', updateDistributionParameters);
  $('#swarm-sample-count').addEventListener('input', (event) => {
    $('#swarm-sample-count-value').value = event.currentTarget.value;
    $('#swarm-sample-count-value').textContent = event.currentTarget.value;
  });
  $('#swarm-generate-samples').addEventListener('click', () => generateDistributionSample(true));

  if ('ResizeObserver' in window) {
    new ResizeObserver(resizeCanvas).observe(canvas);
    new ResizeObserver(() => drawDistributionHistogram(distributionValues, distributionType)).observe(distributionCanvas);
  } else {
    window.addEventListener('resize', () => {
      resizeCanvas();
      drawDistributionHistogram(distributionValues, distributionType);
    }, { passive: true });
  }
  resizeCanvas();
  setPopulation(DEFAULT_AGENTS, 'balanced');
  updateMetrics(true);
  updateDistributionParameters();
  generateDistributionSample(false);
  logEvent('بدأت التجربة من 57 وكيلًا ببذرة NumPy PCG64 الثابتة 12345.');
  logEvent('لا تُجرى اتصالات أو عمليات فحص خارج هذه الصفحة.');
  setRunning(running);
  if (reduceMotion) logEvent('بدأت متوقفة احترامًا لتفضيل تقليل الحركة في الجهاز.');
})();
