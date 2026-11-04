(() => {
  'use strict';

  const ROLES = ['استكشاف', 'فحص', 'حماية', 'نور', 'ميزان'];
  const COLORS = { استكشاف: '#00ff88', فحص: '#ffaa00', حماية: '#4488ff', نور: '#fff2a8', ميزان: '#d98cff' };

  class QuranicSwarm extends HTMLElement {
    static observedAttributes = ['count', 'max', 'balance', 'stability'];

    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this.colony = [];
      this.running = true;
      this.nurActive = false;
      this.mizanMode = true;
      this.last = 0;
      this.frame = 0;
      this.time = 0;
      this.generation = 1;
      this.H0 = 0.0007;
      this.K = 0.0009;
      this.buildShadowDom();
      this.resizeObserver = new ResizeObserver(() => this.resize());
    }

    connectedCallback() {
      this.readOptions();
      this.resizeObserver.observe(this);
      this.reset();
      this.bindControls();
      this.last = performance.now();
      this.frame = requestAnimationFrame((time) => this.loop(time));
    }

    disconnectedCallback() {
      this.resizeObserver.disconnect();
      cancelAnimationFrame(this.frame);
    }

    attributeChangedCallback() {
      if (this.isConnected) {
        this.readOptions();
        this.reset();
      }
    }

    buildShadowDom() {
      const style = document.createElement('style');
      style.textContent = `
        :host{display:block;min-height:300px;position:relative;overflow:hidden;border:1px solid rgba(0,255,136,.3);border-radius:16px;background:#020603;color:#dff8e9;font:12px system-ui,sans-serif;direction:rtl}
        canvas{display:block;width:100%;height:100%;min-height:300px;cursor:crosshair}
        .bar{position:absolute;inset:0 0 auto;z-index:1;display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px;background:rgba(0,0,0,.76);backdrop-filter:blur(8px);border-bottom:1px solid rgba(0,255,136,.2)}
        .brand{color:#00ff88;font-weight:800}.stat{padding:3px 6px;border:1px solid rgba(255,255,255,.14);border-radius:6px;color:#aac1b2;font-size:10px}.stat b{color:#00ff88;font-size:12px}
        .button{border:1px solid rgba(255,255,255,.18);border-radius:6px;padding:4px 7px;background:#0c1a12;color:#dff8e9;cursor:pointer;font:inherit;font-size:10px}.button[aria-pressed="true"]{background:#164d31;color:#fff}
        .inspector{position:absolute;z-index:2;left:8px;bottom:8px;max-width:calc(100% - 16px);padding:7px 9px;border-right:3px solid #fff2a8;background:rgba(0,0,0,.78);color:#dff8e9;font:10px/1.6 ui-monospace,monospace;direction:rtl}
      `;
      const bar = document.createElement('div'); bar.className = 'bar';
      const brand = document.createElement('span'); brand.className = 'brand'; brand.textContent = 'TawhidOS · السرب الموحّد'; bar.appendChild(brand);
      [['السرب', 'count'], ['الحد', 'max'], ['الميزان', 'balance'], ['النور', 'nur'], ['الجيل', 'generation'], ['Q', 'q']].forEach(([label, id]) => {
        const stat = document.createElement('span'); stat.className = 'stat';
        const text = document.createElement('span'); text.textContent = `${label} `;
        const value = document.createElement('b'); value.id = id; value.textContent = id === 'q' ? '210M' : '0';
        stat.append(text, value); bar.appendChild(stat);
      });
      [['toggle', 'إيقاف'], ['nur-toggle', 'نور'], ['mizan-toggle', 'ميزان'], ['reset', 'إعادة']].forEach(([id, label]) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'button'; button.dataset.action = id; button.textContent = label; button.setAttribute('aria-pressed', id === 'mizan-toggle' ? 'true' : 'false'); bar.appendChild(button);
      });
      const canvas = document.createElement('canvas'); canvas.setAttribute('aria-label', 'محاكاة TawhidOS للسرب المتوازن');
      const inspector = document.createElement('div'); inspector.className = 'inspector'; inspector.hidden = true;
      this.shadowRoot.append(style, bar, canvas, inspector);
      this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.inspector = inspector;
    }

    readOptions() {
      this.initialCount = Math.max(1, Math.min(300, Number(this.getAttribute('count')) || 57));
      this.maxCount = Math.max(this.initialCount, Math.min(300, Number(this.getAttribute('max')) || 300));
      this.balance = Math.max(1, Math.min(100, Number(this.getAttribute('balance')) || 33));
      this.targetStability = Math.max(0.5, Math.min(1, (Number(this.getAttribute('stability')) || 75) / 100));
    }

    bindControls() {
      const action = (name) => this.shadowRoot.querySelector(`[data-action="${name}"]`);
      action('toggle').addEventListener('click', () => { this.running = !this.running; action('toggle').textContent = this.running ? 'إيقاف' : 'استئناف'; action('toggle').setAttribute('aria-pressed', String(!this.running)); });
      action('nur-toggle').addEventListener('click', () => { this.nurActive = !this.nurActive; action('nur-toggle').setAttribute('aria-pressed', String(this.nurActive)); });
      action('mizan-toggle').addEventListener('click', () => { this.mizanMode = !this.mizanMode; action('mizan-toggle').setAttribute('aria-pressed', String(this.mizanMode)); });
      action('reset').addEventListener('click', () => this.reset());
      this.canvas.addEventListener('click', (event) => this.inspectAt(event));
    }

    resize() {
      const rect = this.getBoundingClientRect(); const ratio = Math.min(2, devicePixelRatio || 1);
      this.width = Math.max(280, rect.width || 600); this.height = Math.max(300, rect.height || 340);
      this.canvas.width = this.width * ratio; this.canvas.height = this.height * ratio;
      this.canvas.style.width = `${this.width}px`; this.canvas.style.height = `${this.height}px`;
      this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    reset() {
      this.colony = []; this.time = 0; this.generation = 1;
      for (let i = 0; i < this.initialCount; i += 1) this.colony.push(this.createItem(ROLES[i % ROLES.length], 1));
      this.updateStats();
    }

    createItem(role, generation = 1, parent = null) {
      const id = this.colony.length + 1 + Math.floor(Math.random() * 100000);
      return { id, role, generation, eff: parent ? Math.max(.6, Math.min(2.4, parent.eff + (Math.random() - .5) * .1)) : 1 + Math.random() * .3, energy: 95 + Math.random() * 20, age: 0, x: parent ? parent.x + (Math.random() - .5) * 25 : Math.random() * this.width, y: parent ? parent.y + (Math.random() - .5) * 25 : 40 + Math.random() * Math.max(40, this.height - 40), vx: (Math.random() - .5) * 1.8, vy: (Math.random() - .5) * 1.8, nurValue: (id * 19) % 114 + 1 };
    }

    update(dt) {
      this.time += dt / 60;
      const target = Math.min(this.maxCount, Math.max(this.initialCount, Math.round(this.initialCount * Math.exp(this.K * this.time))));
      this.colony.forEach((item) => {
        item.age += dt; item.energy -= dt * (.012 + .004 / item.eff);
        const dx = item.x - this.width / 2; const dy = item.y - this.height / 2;
        item.x += dx * this.H0 * dt + item.vx * dt; item.y += dy * this.H0 * dt + item.vy * dt;
        item.vx += (Math.random() - .5) * .08 * dt; item.vy += (Math.random() - .5) * .08 * dt; item.vx *= .99; item.vy *= .99;
        if (item.x < 0 || item.x > this.width) item.vx *= -1; if (item.y < 36 || item.y > this.height) item.vy *= -1;
        if (this.nurActive) item.energy = Math.min(120, item.energy + .008 * dt);
        if (this.mizanMode && item.role === this.dominantRole()) item.energy -= .012 * dt;
      });
      while (this.colony.length < target) { const parent = this.colony[this.colony.length % Math.max(1, this.colony.length)]; const child = this.createItem(this.leastRole(), (parent?.generation || 1) + 1, parent); this.colony.push(child); this.generation = Math.max(this.generation, child.generation); }
      this.colony = this.colony.filter((item) => item.energy > 0 && item.age < 3600);
      if (this.colony.length < Math.min(33, this.initialCount)) while (this.colony.length < Math.min(33, this.initialCount)) this.colony.push(this.createItem(this.leastRole()));
      this.rebalance(); this.updateStats();
    }

    roleCounts() { return Object.fromEntries(ROLES.map((role) => [role, this.colony.filter((item) => item.role === role).length])); }
    dominantRole() { const counts = this.roleCounts(); return ROLES.reduce((a, b) => counts[a] >= counts[b] ? a : b); }
    leastRole() { const counts = this.roleCounts(); return ROLES.reduce((a, b) => counts[a] <= counts[b] ? a : b); }
    rebalance() { const counts = this.roleCounts(); const max = Math.max(...Object.values(counts)); const min = Math.min(...Object.values(counts)); if (max - min >= 5) { const from = ROLES.find((role) => counts[role] === max); const to = ROLES.find((role) => counts[role] === min); const item = this.colony.find((candidate) => candidate.role === from); if (item) item.role = to; } }

    updateStats() {
      const root = this.shadowRoot; const counts = this.roleCounts(); const spread = Math.max(...Object.values(counts)) - Math.min(...Object.values(counts));
      root.querySelector('#count').textContent = String(this.colony.length); root.querySelector('#max').textContent = String(this.maxCount); root.querySelector('#balance').textContent = `${Math.max(0, Math.round(100 - spread * 5))}%`; root.querySelector('#nur').textContent = this.nurActive ? 'نشط' : '19'; root.querySelector('#generation').textContent = String(this.generation); root.querySelector('#q').textContent = '210M';
    }

    inspectAt(event) {
      const rect = this.canvas.getBoundingClientRect(); const x = event.clientX - rect.left; const y = event.clientY - rect.top;
      const item = this.colony.slice().reverse().find((candidate) => Math.hypot(candidate.x - x, candidate.y - y) < 14); if (!item) return;
      this.inspector.hidden = false; this.inspector.textContent = `#${item.id} · الدور: ${item.role} · الجيل: ${item.generation} · النور: ${item.nurValue} · الكفاءة: ${item.eff.toFixed(2)} · الطاقة: ${item.energy.toFixed(1)}`;
      this.dispatchEvent(new CustomEvent('swarm-inspect', { detail: { ...item }, bubbles: true }));
    }

    draw() {
      const ctx = this.ctx; ctx.fillStyle = 'rgba(2,6,3,.24)'; ctx.fillRect(0, 0, this.width, this.height);
      const scale = Math.min(3, 1 + this.time * this.H0); const gradient = ctx.createRadialGradient(this.width / 2, this.height / 2, 0, this.width / 2, this.height / 2, 220 * scale); gradient.addColorStop(0, this.nurActive ? 'rgba(255,242,168,.22)' : 'rgba(0,255,136,.10)'); gradient.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, this.width, this.height);
      for (let i = 0; i < this.colony.length; i += 1) for (let j = i + 1; j < Math.min(i + 6, this.colony.length); j += 1) { const a = this.colony[i]; const b = this.colony[j]; const distance = Math.hypot(a.x - b.x, a.y - b.y); if (distance < 70 * scale) { ctx.strokeStyle = `rgba(0,255,136,${.15 * (1 - distance / (70 * scale))})`; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); } }
      this.colony.forEach((item) => { const color = COLORS[item.role]; const radius = 2.4 + item.eff * .8 + item.generation * .04; ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = this.nurActive ? 12 : 6; ctx.beginPath(); ctx.arc(item.x, item.y, radius, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; if (item.nurValue === 112) { ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(item.x, item.y, radius + 3, 0, Math.PI * 2); ctx.stroke(); } });
      ctx.fillStyle = '#fff'; ctx.font = 'bold 20px serif'; ctx.textAlign = 'center'; ctx.fillText('١', this.width / 2, this.height / 2 + 7);
    }

    loop(now) { const dt = Math.min(2, (now - this.last) / 16.67 || 1); this.last = now; if (this.running) this.update(dt); this.draw(); this.frame = requestAnimationFrame((time) => this.loop(time)); }
  }

  if (!customElements.get('quranic-swarm')) customElements.define('quranic-swarm', QuranicSwarm);
})();
