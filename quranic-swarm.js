(() => {
  'use strict';
  const roles = ['explore', 'scan', 'protect'];
  const colors = { explore: '#00ff88', scan: '#ffaa00', protect: '#4488ff' };

  class QuranicSwarm extends HTMLElement {
    static observedAttributes = ['count', 'max', 'balance'];

    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this.colony = [];
      this.running = true;
      this.last = 0;
      this.frame = 0;
      this.H0 = 0.0007;
      this.buildShadowDom();
      this.resizeObserver = new ResizeObserver(() => this.resize());
    }

    connectedCallback() {
      this.readOptions();
      this.resizeObserver.observe(this);
      this.reset();
      this.shadowRoot.querySelector('[data-action="toggle"]').addEventListener('click', () => {
        this.running = !this.running;
        const button = this.shadowRoot.querySelector('[data-action="toggle"]');
        button.textContent = this.running ? 'إيقاف' : 'استئناف';
        if (this.running) { this.last = performance.now(); this.frame = requestAnimationFrame((time) => this.loop(time)); }
      });
      this.last = performance.now();
      this.frame = requestAnimationFrame((time) => this.loop(time));
    }

    disconnectedCallback() { this.resizeObserver.disconnect(); cancelAnimationFrame(this.frame); }
    attributeChangedCallback() { if (this.isConnected) { this.readOptions(); this.reset(); } }

    buildShadowDom() {
      const style = document.createElement('style');
      style.textContent = ':host{display:block;min-height:260px;position:relative;overflow:hidden;border:1px solid rgba(0,255,136,.3);border-radius:16px;background:#020603;color:#dff8e9;font:12px system-ui,sans-serif;direction:rtl}canvas{display:block;width:100%;height:100%;min-height:260px}.bar{position:absolute;inset:0 0 auto;z-index:1;display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:8px;background:rgba(0,0,0,.72);backdrop-filter:blur(8px);border-bottom:1px solid rgba(0,255,136,.2)}.brand{color:#00ff88;font-weight:800}.stat{padding:3px 6px;border:1px solid rgba(255,255,255,.14);border-radius:6px;color:#aac1b2;font-size:10px}.stat b{color:#00ff88;font-size:12px}.button{border:1px solid rgba(255,255,255,.18);border-radius:6px;padding:4px 7px;background:#0c1a12;color:#dff8e9;cursor:pointer;font:inherit;font-size:10px}';
      const bar = document.createElement('div'); bar.className = 'bar';
      const brand = document.createElement('span'); brand.className = 'brand'; brand.textContent = 'السرب القرآني'; bar.appendChild(brand);
      [['السرب', 'count'], ['الحد', 'max'], ['التوازن', 'balance'], ['Q', 'q']].forEach(([label, id]) => { const stat = document.createElement('span'); stat.className = 'stat'; const text = document.createElement('span'); text.textContent = `${label} `; const value = document.createElement('b'); value.id = id; value.textContent = id === 'q' ? '320k' : ''; stat.append(text, value); bar.appendChild(stat); });
      const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'button'; toggle.dataset.action = 'toggle'; toggle.textContent = 'إيقاف'; bar.appendChild(toggle);
      const canvas = document.createElement('canvas'); canvas.setAttribute('aria-label', 'حركة السرب القرآني المتوازن');
      this.shadowRoot.append(style, bar, canvas); this.canvas = canvas; this.ctx = canvas.getContext('2d');
    }

    readOptions() { this.initialCount = Math.max(1, Math.min(300, Number(this.getAttribute('count')) || 57)); this.maxCount = Math.max(this.initialCount, Math.min(300, Number(this.getAttribute('max')) || 300)); this.balance = Math.max(1, Math.min(100, Number(this.getAttribute('balance')) || 33)); }
    resize() { const rect = this.getBoundingClientRect(); const ratio = Math.min(2, devicePixelRatio || 1); this.width = Math.max(280, rect.width || 600); this.height = Math.max(260, rect.height || 320); this.canvas.width = this.width * ratio; this.canvas.height = this.height * ratio; this.canvas.style.width = `${this.width}px`; this.canvas.style.height = `${this.height}px`; this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0); }
    reset() { this.colony = []; for (let i = 0; i < this.initialCount; i += 1) this.colony.push(this.createItem(roles[i % 3])); this.updateStats(); }
    createItem(role) { return { role, x: Math.random() * this.width, y: 38 + Math.random() * Math.max(40, this.height - 38), vx: (Math.random() - .5) * 1.6, vy: (Math.random() - .5) * 1.6 }; }
    update(dt) { const target = Math.min(this.maxCount, Math.max(this.initialCount, Math.round(this.initialCount * Math.exp(this.H0 * performance.now() / 1000)))); while (this.colony.length < target) this.colony.push(this.createItem(roles[this.colony.length % 3])); if (this.colony.length > this.maxCount) this.colony.length = this.maxCount; this.colony.forEach((item) => { item.x += item.vx * dt; item.y += item.vy * dt; item.vx += (Math.random() - .5) * .08 * dt; item.vy += (Math.random() - .5) * .08 * dt; item.vx *= .99; item.vy *= .99; if (item.x < 0 || item.x > this.width) item.vx *= -1; if (item.y < 36 || item.y > this.height) item.vy *= -1; }); this.rebalance(); this.updateStats(); }
    rebalance() { const counts = roles.map((role) => this.colony.filter((item) => item.role === role).length); const max = Math.max(...counts); const min = Math.min(...counts); if (max - min >= 5) { const from = roles[counts.indexOf(max)]; const to = roles[counts.indexOf(min)]; const item = this.colony.find((candidate) => candidate.role === from); if (item) item.role = to; } }
    updateStats() { const root = this.shadowRoot; root.querySelector('#count').textContent = String(this.colony.length); root.querySelector('#max').textContent = String(this.maxCount); root.querySelector('#balance').textContent = `${this.balance}%`; }
    draw() { const ctx = this.ctx; ctx.fillStyle = 'rgba(2,6,3,.22)'; ctx.fillRect(0, 0, this.width, this.height); for (let i = 0; i < this.colony.length; i += 1) for (let j = i + 1; j < Math.min(i + 6, this.colony.length); j += 1) { const a = this.colony[i]; const b = this.colony[j]; const distance = Math.hypot(a.x - b.x, a.y - b.y); if (distance < 70) { ctx.strokeStyle = `rgba(0,255,136,${.15 * (1 - distance / 70)})`; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); } } this.colony.forEach((item) => { const color = colors[item.role]; ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 7; ctx.beginPath(); ctx.arc(item.x, item.y, 2.5, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; }); }
    loop(now) { const dt = Math.min(2, (now - this.last) / 16.67 || 1); this.last = now; if (this.running) this.update(dt); this.draw(); this.frame = requestAnimationFrame((time) => this.loop(time)); }
  }

  if (!customElements.get('quranic-swarm')) customElements.define('quranic-swarm', QuranicSwarm);
})();
