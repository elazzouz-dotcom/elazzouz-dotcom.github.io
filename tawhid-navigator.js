// TawhidNavigator — طبقة وصول اختيارية ومدفوعة بالموافقة.
// لا تُشغّل أي طلبات تلقائيًا، ولا تتجاوز تسجيل الدخول أو CORS.
(() => {
  'use strict';

  const OWN_ORIGIN = 'https://elazzouz-dotcom.github.io';
  const API_ORIGINS = new Set(['https://en.wikipedia.org', 'https://api.github.com']);
  const MAX_BYTES = 1_500_000;
  const TIMEOUT_MS = 10_000;

  function isOwnSite(input) {
    try {
      const url = new URL(input, OWN_ORIGIN);
      return url.origin === OWN_ORIGIN && (url.protocol === 'https:' || url.pathname.startsWith('/'));
    } catch { return false; }
  }

  function assertApiOrigin(input) {
    const url = new URL(input);
    if (!API_ORIGINS.has(url.origin) || url.protocol !== 'https:') throw new Error('المصدر غير موجود في قائمة API الرسمية المسموحة');
    return url;
  }

  async function requestJson(input, options = {}) {
    const url = assertApiOrigin(input);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeout || TIMEOUT_MS);
    try {
      const response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' }, signal: controller.signal, credentials: 'omit', cache: 'no-store' });
      if (!response.ok) throw new Error(`API HTTP ${response.status}`);
      const length = Number(response.headers.get('content-length') || 0);
      if (length > MAX_BYTES) throw new Error('استجابة API أكبر من الحد المسموح');
      return await response.json();
    } finally { clearTimeout(timer); }
  }

  class TawhidNavigator {
    constructor({ researchDB = [] } = {}) { this.visited = new Set(); this.researchDB = researchDB; }

    async exploreOwnSite(input) {
      if (!isOwnSite(input)) return { error: 'التنقل محصور في موقع Slaks أو API رسمي مصرح.' };
      const url = new URL(input, OWN_ORIGIN);
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const response = await fetch(url, { credentials: 'same-origin', signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error(`الموقع HTTP ${response.status}`);
        const text = (await response.text()).slice(0, MAX_BYTES);
        const stats = this.analyzeCode(text); this.visited.add(url.href);
        const result = { url: url.href, ...stats, time: Date.now() }; this.researchDB.push(result); return result;
      } catch (error) { return { error: error.name === 'AbortError' ? 'انتهت مهلة الطلب' : error.message }; }
      finally { clearTimeout(timer); }
    }

    async searchWikipedia(query, limit = 5) {
      const safeLimit = Math.max(1, Math.min(10, Number(limit) || 5));
      const url = new URL('https://en.wikipedia.org/w/api.php');
      url.search = new URLSearchParams({ action: 'query', list: 'search', srsearch: String(query).slice(0, 160), srlimit: String(safeLimit), format: 'json', origin: '*' });
      const data = await requestJson(url.href); const results = data?.query?.search || [];
      return results.map((item) => ({ title: String(item.title), snippet: this.decodeHtml(String(item.snippet || '')), source: 'Wikipedia API' }));
    }

    async searchRepositories(query, limit = 5) {
      const safeLimit = Math.max(1, Math.min(10, Number(limit) || 5));
      const url = new URL('https://api.github.com/search/repositories'); url.search = new URLSearchParams({ q: String(query).slice(0, 160), per_page: String(safeLimit) });
      const data = await requestJson(url.href);
      return (data.items || []).map((repo) => ({ type: 'بحث برمجي', name: String(repo.full_name), stars: Number(repo.stargazers_count) || 0, lang: repo.language ? String(repo.language) : null, source: 'GitHub REST API' }));
    }

    analyzeCode(code) {
      const text = String(code); return { lines: text.split('\n').length, functions: (text.match(/\b(function|class)\b|=>/g) || []).length, complexity: (text.match(/\b(if|for|while|switch)\b/g) || []).length, length: text.length };
    }

    decodeHtml(value) {
      if (typeof DOMParser === 'undefined') return value.replace(/<[^>]*>/g, '');
      const doc = new DOMParser().parseFromString(value, 'text/html'); return doc.body.textContent || '';
    }
  }

  globalThis.TawhidNavigator = TawhidNavigator;
})();
