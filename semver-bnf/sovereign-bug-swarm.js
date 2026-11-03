/**
 * Sovereign Bug Swarm — وكلاء فحص محليون لشبكة 6600 عقدة.
 * لا يجلب روابط خارجية ولا يدّعي فحصها؛ يقرأ حالة العقدة الموجودة في الواجهة
 * ويمرر سياقها إلى Mod 9 عبر CustomEvent إذا كان المختبر مفعّلًا.
 */
class SovereignBugSwarm {
  constructor() {
    this.reportKey = 'slaks-sovereign-swarm-reports-v1';
    this.maxReports = 500;
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
    this.setUi('○ سرب متوقف', 'متوقف');
  }

  toggle() {
    if (this.running) this.stop();
    else this.start();
    return this.running;
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
      this.setUi(`● ${bug.id} يفحص ${node.dataset.id} · ${configured ? 'مهيأة' : 'فارغة'} · ${this.scanned} فحص`, 'نشط');
      const detail = { id, name: `عقدة N-${String(id).padStart(3, '0')}`, value: id, agent: bug.id, configured };
      if (typeof window.inspectNodeAlgebraically === 'function') {
        window.inspectNodeAlgebraically(detail.id, detail.name, detail.value);
      } else {
        window.dispatchEvent(new CustomEvent('slaks:swarm-node', { detail }));
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
    window.dispatchEvent(new CustomEvent('slaks:swarm-report', { detail: report }));
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
    const filename = `slaks-swarm-report-${new Date().toISOString().replace(/[:.]/g, '-')}.${format}`;
    let content;
    let type;
    if (format === 'csv') {
      const fields = ['timestamp', 'period', 'agent', 'agentLabel', 'nodeId', 'nodeKey', 'configured', 'status', 'mod9Value', 'mod9Context', 'mod9Summary'];
      const quote = (value) => `"${String(value ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
      content = [fields.join(','), ...this.reports.map((row) => fields.map((field) => quote(row[field])).join(','))].join('\n');
      type = 'text/csv;charset=utf-8';
    } else {
      content = JSON.stringify({ format: 'slaks-sovereign-swarm-periodic-report', generatedAt: new Date().toISOString(), totalRecords: this.reports.length, records: this.reports }, null, 2);
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
