// tawhid-github-navigator.js
// GitHub REST API navigator مستقل: لا مفاتيح مضمّنة، لا scraping، ولا تشغيل تلقائي.
(() => {
  'use strict';

  const API_ORIGIN = 'https://api.github.com';
  const DEFAULT_TIMEOUT = 12_000;
  const DEFAULT_GAP = 750;
  const MAX_QUERY_LENGTH = 160;
  const MAX_PAGE_SIZE = 100;

  class GitHubError extends Error {
    constructor(message, { status = 0, code = 'GITHUB_ERROR', endpoint = '', resetAt = null, cause = null } = {}) {
      super(message);
      this.name = 'GitHubError';
      this.status = status;
      this.code = code;
      this.endpoint = endpoint;
      this.resetAt = resetAt;
      this.cause = cause || undefined;
    }
  }

  function safeText(value, maxLength = 500) {
    const input = String(value ?? '');
    const withoutTags = input.replace(/<[^>]*>/g, ' ');
    const normalized = withoutTags.replace(/\s+/g, ' ').trim();
    return normalized.slice(0, maxLength);
  }

  function formatResetTime(resetAt) {
    if (!resetAt) return 'وقت غير معروف';
    const date = new Date(resetAt * 1000);
    return Number.isNaN(date.getTime()) ? 'وقت غير معروف' : date.toLocaleString('ar');
  }

  function endpointUrl(path, params = {}) {
    const url = new URL(path, API_ORIGIN);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    });
    return url;
  }

  class TawhidGitHubNavigator {
    constructor({ token = '', timeout = DEFAULT_TIMEOUT, gap = DEFAULT_GAP, minRemaining = 1, researchDB = [] } = {}) {
      this.token = typeof token === 'string' ? token.trim() : '';
      this.timeout = Math.max(1_000, Number(timeout) || DEFAULT_TIMEOUT);
      this.gap = Math.max(0, Number(gap) || DEFAULT_GAP);
      this.minRemaining = Math.max(0, Number(minRemaining) || 0);
      this.lastRequestAt = 0;
      this.rate = { core: null, search: null };
      this.researchDB = Array.isArray(researchDB) ? researchDB : [];
      this.repositoryIndex = new Map();
      this.researchDB.forEach((item) => { if (item?.name) this.repositoryIndex.set(item.name, item); });
    }

    bucketFor(url) { return url.pathname.startsWith('/search/') ? 'search' : 'core'; }

    readRateHeaders(response, bucket) {
      const limit = Number(response.headers.get('x-ratelimit-limit'));
      const remaining = Number(response.headers.get('x-ratelimit-remaining'));
      const resetAt = Number(response.headers.get('x-ratelimit-reset'));
      if (Number.isFinite(limit) || Number.isFinite(remaining) || Number.isFinite(resetAt)) {
        this.rate[bucket] = {
          limit: Number.isFinite(limit) ? limit : null,
          remaining: Number.isFinite(remaining) ? remaining : null,
          resetAt: Number.isFinite(resetAt) ? resetAt : null,
          observedAt: Date.now()
        };
      }
    }

    rateError(bucket) {
      const info = this.rate[bucket];
      return new GitHubError(`تم إيقاف طلبات ${bucket === 'search' ? 'البحث' : 'الواجهة الأساسية'} قبل تجاوز الحد. تعود الحصة في ${formatResetTime(info?.resetAt)}.`, {
        status: 403, code: 'RATE_LIMIT', endpoint: bucket, resetAt: info?.resetAt || null
      });
    }

    ensureRateBudget(bucket) {
      const info = this.rate[bucket];
      if (info && Number.isFinite(info.remaining) && info.remaining <= this.minRemaining) throw this.rateError(bucket);
    }

    async waitGap() {
      const wait = this.gap - (Date.now() - this.lastRequestAt);
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    }

    async request(path, params = {}) {
      const url = endpointUrl(path, params);
      const bucket = this.bucketFor(url);
      this.ensureRateBudget(bucket);
      await this.waitGap();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);
      const headers = { Accept: 'application/vnd.github+json' };
      if (this.token) headers.Authorization = `Bearer ${this.token}`;
      try {
        this.lastRequestAt = Date.now();
        const response = await fetch(url.href, { method: 'GET', headers, credentials: 'omit', signal: controller.signal, cache: 'no-store' });
        this.readRateHeaders(response, bucket);
        if (!response.ok) throw this.makeHttpError(response, url, bucket);
        return await response.json();
      } catch (error) {
        if (error instanceof GitHubError) throw error;
        if (error?.name === 'AbortError') throw new GitHubError(`انتهت مهلة GitHub بعد ${Math.round(this.timeout / 1000)} ثانية.`, { code: 'TIMEOUT', endpoint: url.pathname, cause: error });
        throw new GitHubError('تعذر الاتصال بـ GitHub. تحقق من الشبكة أو سياسة CORS.', { code: 'NETWORK_ERROR', endpoint: url.pathname, cause: error });
      } finally { clearTimeout(timer); }
    }

    makeHttpError(response, url, bucket) {
      const status = response.status;
      const info = this.rate[bucket];
      const messages = {
        401: 'تحتاج هذه العملية إلى مصادقة GitHub صالحة.',
        403: info?.remaining <= this.minRemaining ? `تم بلوغ حد GitHub. تعود الحصة في ${formatResetTime(info.resetAt)}.` : 'رفض GitHub الطلب؛ تحقق من الصلاحيات أو معدل الطلبات.',
        404: 'المورد المطلوب غير موجود أو غير متاح لهذا الحساب.',
        422: 'رفض GitHub المعلمات المرسلة؛ تحقق من صيغة البحث.',
        429: 'أوقف GitHub الطلب مؤقتًا بسبب كثرة الطلبات.'
      };
      return new GitHubError(messages[status] || `أعاد GitHub الحالة HTTP ${status}.`, { status, code: status === 403 ? 'FORBIDDEN_OR_RATE_LIMIT' : `HTTP_${status}`, endpoint: url.pathname, resetAt: info?.resetAt || null });
    }

    async searchRepositories(query, { perPage = 5 } = {}) {
      const cleanQuery = safeText(query, MAX_QUERY_LENGTH);
      if (!cleanQuery) throw new GitHubError('لا يمكن تنفيذ بحث فارغ.', { code: 'INVALID_QUERY' });
      const size = Math.max(1, Math.min(MAX_PAGE_SIZE, Number(perPage) || 5));
      const data = await this.request('/search/repositories', { q: cleanQuery, per_page: size });
      const fresh = [];
      for (const repo of Array.isArray(data.items) ? data.items : []) {
        const name = safeText(repo.full_name, 200);
        if (!name || this.repositoryIndex.has(name)) continue;
        const item = { type: 'بحث مستودعات', name, url: safeText(repo.html_url, 500), description: safeText(repo.description, 500), stars: Number(repo.stargazers_count) || 0, language: safeText(repo.language, 80), source: 'GitHub REST API', collectedAt: Date.now() };
        this.repositoryIndex.set(name, item); this.researchDB.push(item); fresh.push(item);
      }
      return fresh;
    }

    async getMyRepos({ perPage = 100, page = 1 } = {}) {
      if (!this.token) throw new GitHubError('getMyRepos يحتاج رمز GitHub يمرره المستخدم صراحةً ولا يُحفظ في هذا الملف.', { code: 'AUTH_REQUIRED' });
      const size = Math.max(1, Math.min(MAX_PAGE_SIZE, Number(perPage) || 100));
      const data = await this.request('/user/repos', { per_page: size, page, affiliation: 'owner,collaborator,organization_member', sort: 'updated' });
      if (!Array.isArray(data)) throw new GitHubError('صيغة قائمة المستودعات غير متوقعة.', { code: 'INVALID_RESPONSE', endpoint: '/user/repos' });
      return data.map((repo) => ({ name: safeText(repo.full_name, 200), url: safeText(repo.html_url, 500), private: Boolean(repo.private), stars: Number(repo.stargazers_count) || 0, language: safeText(repo.language, 80), source: 'GitHub REST API' }));
    }

    attachOptionalAgent(item) {
      const Agent = globalThis.UnifiedInsect;
      const colony = globalThis.colony;
      if (typeof Agent !== 'function' || !Array.isArray(colony)) return { attached: false, reason: 'UnifiedInsect أو colony غير متاحين؛ استمر الملف بدون اعتماد عليهما.' };
      try { const agent = new Agent('استكشاف'); agent.research = item; colony.push(agent); return { attached: true }; } catch (error) { return { attached: false, reason: safeText(error.message, 200) }; }
    }

    async startTawhidResearch({ queries = [], includeMyRepos = false, perPage = 5, onStep = null } = {}) {
      const report = { ok: true, startedAt: Date.now(), results: [], errors: [] };
      const cleanQueries = queries.map((query) => safeText(query, MAX_QUERY_LENGTH)).filter(Boolean).slice(0, 10);
      for (const query of cleanQueries) {
        try {
          const repositories = await this.searchRepositories(query, { perPage });
          const attachments = repositories.map((item) => this.attachOptionalAgent(item));
          const step = { type: 'searchRepositories', query, count: repositories.length, repositories, attachments };
          report.results.push(step); if (typeof onStep === 'function') onStep(step);
        } catch (error) {
          const item = { type: 'searchRepositories', query, error: this.errorForReport(error) }; report.errors.push(item); if (typeof onStep === 'function') onStep(item);
        }
      }
      if (includeMyRepos) {
        try { const repos = await this.getMyRepos({ perPage: 100 }); const step = { type: 'getMyRepos', count: repos.length, repositories: repos }; report.results.push(step); if (typeof onStep === 'function') onStep(step); }
        catch (error) { const item = { type: 'getMyRepos', error: this.errorForReport(error) }; report.errors.push(item); if (typeof onStep === 'function') onStep(item); }
      }
      report.ok = report.errors.length === 0; report.finishedAt = Date.now(); report.rate = this.rate; return report;
    }

    errorForReport(error) { return { name: error.name || 'Error', code: error.code || 'UNKNOWN', status: error.status || 0, message: safeText(error.message || 'خطأ غير معروف', 500), resetAt: error.resetAt || null }; }
  }

  globalThis.GitHubError = GitHubError;
  globalThis.TawhidGitHubNavigator = TawhidGitHubNavigator;
  globalThis.tawhidGithubSafeText = safeText;
  globalThis.startTawhidResearch = (options) => new TawhidGitHubNavigator(options?.navigator || {}).startTawhidResearch(options);
})();
