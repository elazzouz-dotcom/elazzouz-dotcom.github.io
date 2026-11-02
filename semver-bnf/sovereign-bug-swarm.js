/**
 * Sovereign Bug Swarm — وكلاء فحص محليون لشبكة 6600 عقدة.
 * لا يجلب روابط خارجية ولا يدّعي فحصها؛ يقرأ حالة العقدة الموجودة في الواجهة
 * ويمرر سياقها إلى Mod 9 عبر CustomEvent إذا كان المختبر مفعّلًا.
 */
class SovereignBugSwarm {
  constructor() {
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
}

window.addEventListener('DOMContentLoaded', () => {
  const swarm = new SovereignBugSwarm();
  window.sovereignBugs = swarm;
  document.querySelector('#swarm-toggle')?.addEventListener('click', () => swarm.toggle());
  swarm.start();
});
