// ResearchEngine — لا يعمل بالخلفية ولا يبدأ بحثًا دون استدعاء صريح.
(() => {
  'use strict';
  class ResearchEngine {
    constructor(navigatorInstance, { maxRecords = 100 } = {}) { this.navigator = navigatorInstance; this.maxRecords = maxRecords; this.running = false; }

    async runOnce(queries = []) {
      if (this.running) return { error: 'البحث قيد التنفيذ' };
      this.running = true;
      try {
        const normalized = queries.map((query) => String(query).trim().slice(0, 160)).filter(Boolean).slice(0, 4);
        const results = [];
        for (const query of normalized) {
          const [wiki, repos] = await Promise.all([this.navigator.searchWikipedia(query), this.navigator.searchRepositories(query)]);
          results.push({ query, wikipedia: wiki, repositories: repos, completedAt: Date.now() });
          this.navigator.researchDB.push(...repos);
        }
        this.navigator.researchDB = this.navigator.researchDB.slice(-this.maxRecords);
        return { ok: true, results, total: this.navigator.researchDB.length };
      } finally { this.running = false; }
    }
  }
  globalThis.ResearchEngine = ResearchEngine;
})();
