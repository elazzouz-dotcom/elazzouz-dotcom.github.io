/**
 * Sovereign Bug Swarm — وكلاء فحص محليون لشبكة 6600 عقدة.
 * لا يجلب روابط خارجية ولا يدّعي فحصها؛ يقرأ حالة العقدة الموجودة في الواجهة
 * ويمرر سياقها إلى Mod 9 عبر CustomEvent إذا كان المختبر مفعّلًا.
 */
class SovereignBugSwarm {
  constructor() {
    this.reportKey = 'azzouz-sovereign-swarm-reports-v1';
    this.maxReports = 500;
    this.quranicConfig = Object.freeze({ count: 57, max: 300, balance: 0.33, stability: 0.75, quran: 320015 });
    this.bugs = [
      { id: 'Bug-01', label: 'الهيكل', delay: 1100, offset: 0 },
      { id: 'Bug-02', label: 'Mod 9', delay: 1600, offset: 180 },
      { id: 'Bug-03', label: 'الرادار', delay: 2200, offset: 360 }
    ];
    this.timers = new Map();
    this.nodeIndex = 0;
    this.running = false;
    this.scanned = 0;
    this.active = new Map();
    this.nodeIds = [];
    this.cosmicCanvas = null;
    this.cosmicContext = null;
    this.cosmicAgents = [];
    this.cosmicFrame = 0;
    this.cosmicScans = 0;
    this.cosmicTime = 0;
    this.cosmicScale = 1;
    this.cosmicGrowthTarget = 57;
    this.cosmicStability = 0.75;
    this.reports = this.readReports();
    this.setupReportControls();
    this.renderReports();
  }

  start() {
    this.nodeIds = [...document.querySelectorAll('.network-node[data-id]')]
      .map((node) => Number(node.dataset.id))
      .filter((id) => Number.isInteger(id) && id > 0)
      .sort((a, b) => a - b);
    if (!this.nodeIds.length) return false;
    this.running = true;
    this.setupCosmicBridge();
    this.setUi('● سرب نشط', 'نشط');
    this.bugs.forEach((bug) => {
      window.setTimeout(() => this.tick(bug), bug.offset);
    });
    return true;
  }

  stop() {
    this.running = false;
    this.timers.forEach((timer) => window.clearTimeout(timer));
    this.timers.clear();
    this.active.forEach((node) => node.classList.remove('is-swarm-active'));
    this.active.clear();
    if (this.cosmicFrame) cancelAnimationFrame(this.cosmicFrame);
    this.setUi('○ سرب متوقف', 'متوقف');
  }

  toggle() {
    if (this.running) this.stop();
    else this.start();
    return this.running;
  }

  createCosmicAgent(index) {
    return { bug: this.bugs[index % this.bugs.length], nodeId: this.nodeIds[(index * 113) % this.nodeIds.length] || 1, x: .08 + ((index * 0.071) % .84), y: .12 + ((index * 0.137) % .76), vx: (index % 3 - 1) * .0012, vy: ((index + 1) % 3 - 1) * .0012, role: index % 3 };
  }

  rebalanceCosmicAgents() {
    const counts = [0, 0, 0];
    this.cosmicAgents.forEach((agent) => { counts[agent.role] += 1; });
    const order = this.cosmicAgents.slice().sort((a, b) => counts[b.role] - counts[a.role]);
    order.forEach((agent) => { const max = Math.max(...counts), min = Math.min(...counts); if (max - min >= this.quranicConfig.balance * 15) { const from = counts.indexOf(max), to = counts.indexOf(min); if (agent.role === from) { agent.role = to; counts[from] -= 1; counts[to] += 1; } } });
    const gap = Math.max(...counts) - Math.min(...counts);
    this.cosmicStability = gap < 5 ? this.quranicConfig.stability : Math.max(0, this.quranicConfig.stability - 0.08);
    return { counts, gap };
  }

  setupCosmicBridge() {
    this.cosmicCanvas = document.querySelector('#cosmic-bridge-canvas');
    if (!this.cosmicCanvas || !this.nodeIds.length) return;
    this.cosmicContext = this.cosmicCanvas.getContext('2d');
    const resize = () => { const dpr = Math.min(2, window.devicePixelRatio || 1); const r = this.cosmicCanvas.getBoundingClientRect(); this.cosmicCanvas.width = Math.max(1, Math.round(r.width * dpr)); this.cosmicCanvas.height = Math.max(1, Math.round(r.height * dpr)); this.cosmicContext.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize(); window.addEventListener('resize', resize, { passive: true });
    if (!this.cosmicAgents.length) this.cosmicAgents = Array.from({ length: this.quranicConfig.count }, (_, index) => this.createCosmicAgent(index));
    this.drawCosmicBridge();
  }

  focusCosmicNode(id) {
    const agent = this.cosmicAgents[this.cosmicScans % Math.max(1, this.cosmicAgents.length)];
    if (agent && id > 0) { agent.nodeId = id; agent.x = .5; agent.y = .5; }
  }

  drawCosmicBridge() {
    if (!this.cosmicContext || !this.cosmicCanvas) return;
    const w = this.cosmicCanvas.clientWidth, h = this.cosmicCanvas.clientHeight, ctx = this.cosmicContext;
    if (this.running) { this.cosmicTime += 0.016; this.cosmicScale = Math.exp(0.0007 * this.cosmicTime); this.cosmicGrowthTarget = Math.min(this.quranicConfig.max, Math.floor(this.quranicConfig.count * Math.exp(0.004 * this.cosmicTime))); while (this.cosmicAgents.length < this.cosmicGrowthTarget) this.cosmicAgents.push(this.createCosmicAgent(this.cosmicAgents.length)); if (this.cosmicAgents.length > this.quranicConfig.max) this.cosmicAgents.length = this.quranicConfig.max; if (Math.floor(this.cosmicTime * 60) % 60 === 0) this.rebalanceCosmicAgents(); }
    ctx.fillStyle = 'rgba(2,11,11,.28)'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(89,224,163,.12)'; ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 42) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 42) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    const colors = ['#59e0a3', '#f4ce72', '#55b8e8'];
    this.cosmicAgents.forEach((agent) => { if (this.running) { const dx = agent.x - .5, dy = agent.y - .5; agent.x += agent.vx + dx * 0.0007 * this.cosmicScale; agent.y += agent.vy + dy * 0.0007 * this.cosmicScale; if (agent.x < .03 || agent.x > .97) agent.vx *= -1; if (agent.y < .06 || agent.y > .94) agent.vy *= -1; } const node = document.querySelector(`.network-node[data-id="${agent.nodeId}"]`); const configured = node?.dataset.active === 'true'; const color = colors[agent.role % colors.length]; ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = configured ? 12 : 6; ctx.beginPath(); ctx.arc(agent.x * w, agent.y * h, configured ? 6 : 4, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; });
    const configuredCount = this.nodeIds.filter((id) => document.querySelector(`.network-node[data-id="${id}"]`)?.dataset.active === 'true').length;
    const balance = this.rebalanceCosmicAgents(); const stats = document.querySelector('#cosmic-bridge-stats'); if (stats) stats.textContent = `${this.cosmicAgents.length}/${this.quranicConfig.max} وكلاء · ${this.cosmicScans} زيارة · ${this.nodeIds.length ? Math.round(configuredCount / this.nodeIds.length * 100) : 0}% بيانات`; const equations = document.querySelector('#cosmic-bridge-equations'); if (equations) equations.textContent = `a(t)=e^(H₀t)=${this.cosmicScale.toFixed(3)}x · Q(t)=114×Ā×L̄=${(this.quranicConfig.quran / 1000).toFixed(0)}k حرف ثابت · N(t)=min(300,57×e^(kt))=${this.cosmicAgents.length} · Δ=${balance.gap}<5 · استقرار=${Math.round(this.cosmicStability * 100)}%`;
    this.cosmicFrame = requestAnimationFrame(() => this.drawCosmicBridge());
  }

  nextNode(bug) {
    const index = (this.nodeIndex + bug.offset / 180) % this.nodeIds.length;
    this.nodeIndex = (this.nodeIndex + 1) % this.nodeIds.length;
    return this.nodeIds[Math.floor(index) % this.nodeIds.length];
  }

  tick(bug) {
    if (!this.running || !this.nodeIds.length) return;
    const id = this.nextNode(bug);
    const node = document.querySelector(`.network-node[data-id="${id}"]`);
    if (node) {
      const previous = this.active.get(bug.id);
      previous?.classList.remove('is-swarm-active');
      node.classList.add('is-swarm-active');
      node.dataset.swarmAgent = bug.id;
      this.active.set(bug.id, node);
      const configured = node.dataset.active === 'true';
      this.scanned += 1;
      this.cosmicScans += 1;
      this.focusCosmicNode(id);
      this.setUi(`● ${bug.id} يفحص ${node.dataset.id} · ${configured ? 'مهيأة' : 'فارغة'} · ${this.scanned} فحص`, 'نشط');
      const detail = { id, name: `عقدة N-${String(id).padStart(3, '0')}`, value: id, agent: bug.id, configured };
      if (typeof window.inspectNodeAlgebraically === 'function') {
        window.inspectNodeAlgebraically(detail.id, detail.name, detail.value);
      } else {
        window.dispatchEvent(new CustomEvent('azzouz:swarm-node', { detail }));
      }
      this.recordReport({
        agent: bug.id,
        agentLabel: bug.label,
        nodeId: id,
        nodeKey: `N-${String(id).padStart(3, '0')}`,
        configured,
        status: configured ? 'configured' : 'empty',
        mod9Value: document.querySelector('#mod9-input')?.value || String(id),
        mod9Context: document.querySelector('#mod9-context')?.value || '',
        mod9Summary: (document.querySelector('#mod9-results')?.innerText || '').slice(0, 300)
      });
    }
    this.timers.set(bug.id, window.setTimeout(() => this.tick(bug), bug.delay));
  }

  setUi(message, state) {
    const status = document.querySelector('#agent-status');
    const codeStatus = document.querySelector('#agent-code-status');
    const toggle = document.querySelector('#swarm-toggle');
    if (status) status.textContent = message;
    if (codeStatus) codeStatus.textContent = state === 'نشط' ? message : 'تم إيقاف الوكلاء؛ يمكن تشغيلهم مجددًا في أي وقت.';
    if (toggle) {
      toggle.textContent = this.running ? 'إيقاف السرب' : 'تشغيل السرب';
      toggle.setAttribute('aria-pressed', String(this.running));
    }
  }

  readReports() {
    try {
      const value = JSON.parse(localStorage.getItem(this.reportKey) || '[]');
      return Array.isArray(value) ? value.slice(-this.maxReports) : [];
    } catch { return []; }
  }

  saveReports() {
    try { localStorage.setItem(this.reportKey, JSON.stringify(this.reports.slice(-this.maxReports))); }
    catch { this.reports = this.reports.slice(-100); }
  }

  recordReport(entry) {
    const report = { ...entry, timestamp: new Date().toISOString(), period: new Date().toISOString().slice(0, 13) };
    this.reports.push(report);
    this.reports = this.reports.slice(-this.maxReports);
    this.saveReports();
    this.renderReports();
    window.dispatchEvent(new CustomEvent('azzouz:swarm-report', { detail: report }));
  }

  setupReportControls() {
    document.querySelector('#swarm-report-json')?.addEventListener('click', () => this.exportReports('json'));
    document.querySelector('#swarm-report-csv')?.addEventListener('click', () => this.exportReports('csv'));
    document.querySelector('#swarm-report-clear')?.addEventListener('click', () => {
      this.reports = [];
      this.saveReports();
      this.renderReports();
    });
  }

  renderReports() {
    const count = document.querySelector('#swarm-report-count');
    const last = document.querySelector('#swarm-report-last');
    const log = document.querySelector('#swarm-report-log');
    if (count) count.textContent = `${this.reports.length} سجل`;
    const latest = this.reports[this.reports.length - 1];
    if (last) last.textContent = latest ? `آخر فحص: ${latest.nodeKey} بواسطة ${latest.agent} · ${new Date(latest.timestamp).toLocaleString('ar')}` : 'سيُحفظ كل فحص محليًا عند تشغيل السرب.';
    if (!log) return;
    log.replaceChildren();
    this.reports.slice(-12).reverse().forEach((report) => {
      const row = document.createElement('div');
      row.className = 'swarm-report-entry';
      const agent = document.createElement('strong'); agent.textContent = report.agent;
      const node = document.createElement('code'); node.textContent = `${report.nodeKey} · ${report.status === 'configured' ? 'مهيأة' : 'فارغة'} · Mod 9: ${report.mod9Value}`;
      const time = document.createElement('span'); time.textContent = new Date(report.timestamp).toLocaleTimeString('ar');
      row.append(agent, node, time); log.appendChild(row);
    });
  }

  exportReports(format) {
    const filename = `azzouz-swarm-report-${new Date().toISOString().replace(/[:.]/g, '-')}.${format}`;
    let content;
    let type;
    if (format === 'csv') {
      const fields = ['timestamp', 'period', 'agent', 'agentLabel', 'nodeId', 'nodeKey', 'configured', 'status', 'mod9Value', 'mod9Context', 'mod9Summary'];
      const quote = (value) => `"${String(value ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
      content = [fields.join(','), ...this.reports.map((row) => fields.map((field) => quote(row[field])).join(','))].join('\n');
      type = 'text/csv;charset=utf-8';
    } else {
      content = JSON.stringify({ format: 'azzouz-sovereign-swarm-periodic-report', generatedAt: new Date().toISOString(), totalRecords: this.reports.length, records: this.reports }, null, 2);
      type = 'application/json;charset=utf-8';
    }
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const swarm = new SovereignBugSwarm();
  window.sovereignBugs = swarm;
  document.querySelector('#swarm-toggle')?.addEventListener('click', () => swarm.toggle());
  swarm.start();
});
