import test, { afterEach, before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('../tawhid-github-navigator.js');
const { TawhidGitHubNavigator, GitHubError } = globalThis;

const originalFetch = globalThis.fetch;

function headers(values = {}) {
  const normalized = Object.fromEntries(Object.entries(values).map(([key, value]) => [key.toLowerCase(), String(value)]));
  return { get: (key) => normalized[String(key).toLowerCase()] ?? null };
}

function response(body, { status = 200, rate = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: headers({
      'x-ratelimit-limit': rate.limit ?? 60,
      'x-ratelimit-remaining': rate.remaining ?? 59,
      'x-ratelimit-reset': rate.resetAt ?? Math.floor(Date.now() / 1000) + 3600
    }),
    json: async () => body
  };
}

function urlOf(call) { return new URL(call); }

before(() => {
  assert.equal(typeof TawhidGitHubNavigator, 'function');
  assert.equal(typeof GitHubError, 'function');
});

afterEach(() => { globalThis.fetch = originalFetch; });

test('يقرأ حدود core وsearch من ترويسات GitHub', async () => {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return response({ items: [] }, { rate: { limit: 10, remaining: 7, resetAt: 2_000_000_000 } });
  };
  const nav = new TawhidGitHubNavigator({ gap: 0 });
  await nav.searchRepositories('quran');
  assert.equal(nav.rate.search.limit, 10);
  assert.equal(nav.rate.search.remaining, 7);
  assert.equal(nav.rate.search.resetAt, 2_000_000_000);
  assert.equal(urlOf(calls[0]).pathname, '/search/repositories');
});

test('يتوقف قبل استنفاد حصة البحث ولا يرسل الطلب الثاني', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return response({ items: [] }, { rate: { limit: 10, remaining: 1 } });
  };
  const nav = new TawhidGitHubNavigator({ gap: 0, minRemaining: 1 });
  await nav.searchRepositories('first');
  await assert.rejects(() => nav.searchRepositories('second'), (error) => {
    assert(error instanceof GitHubError);
    assert.equal(error.code, 'RATE_LIMIT');
    assert.match(error.message, /إيقاف طلبات البحث/);
    return true;
  });
  assert.equal(calls, 1);
});

test('يحوّل 403 و404 و422 إلى GitHubError واضح', async (t) => {
  for (const [status, expectedCode] of [[403, 'FORBIDDEN_OR_RATE_LIMIT'], [404, 'HTTP_404'], [422, 'HTTP_422']]) {
    await t.test(`HTTP ${status}`, async () => {
      globalThis.fetch = async () => response({ message: 'failure' }, { status, rate: { remaining: status === 403 ? 20 : 50 } });
      const nav = new TawhidGitHubNavigator({ token: 'test-token', gap: 0 });
      await assert.rejects(() => status === 404 ? nav.getMyRepos() : nav.searchRepositories('q'), (error) => {
        assert(error instanceof GitHubError);
        assert.equal(error.status, status);
        assert.equal(error.code, expectedCode);
        assert.notEqual(error.message, '');
        return true;
      });
    });
  }
});

test('يعيد خطأ AUTH_REQUIRED قبل أي طلب عند غياب الرمز', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return response([]); };
  const nav = new TawhidGitHubNavigator({ gap: 0 });
  await assert.rejects(() => nav.getMyRepos(), (error) => {
    assert(error instanceof GitHubError);
    assert.equal(error.code, 'AUTH_REQUIRED');
    return true;
  });
  assert.equal(calls, 0);
});

test('يستخدم getMyRepos حجم الصفحة 100 ويعيد المستودعات', async () => {
  let requestedUrl = '';
  globalThis.fetch = async (url) => { requestedUrl = String(url); return response([{ full_name: 'owner/project', html_url: 'https://github.com/owner/project', private: true }]); };
  const nav = new TawhidGitHubNavigator({ token: 'test-token', gap: 0 });
  const repos = await nav.getMyRepos();
  const url = urlOf(requestedUrl);
  assert.equal(url.pathname, '/user/repos');
  assert.equal(url.searchParams.get('per_page'), '100');
  assert.equal(repos[0].name, 'owner/project');
  assert.equal(repos[0].private, true);
});

test('يزيل تكرار المستودعات ولا يعيد researchDB كاملة', async () => {
  globalThis.fetch = async () => response({ items: [
    { full_name: 'owner/one', html_url: 'https://github.com/owner/one', stargazers_count: 1 },
    { full_name: 'owner/one', html_url: 'https://github.com/owner/one', stargazers_count: 1 },
    { full_name: 'owner/two', html_url: 'https://github.com/owner/two', stargazers_count: 2 }
  ] });
  const nav = new TawhidGitHubNavigator({ gap: 0 });
  const first = await nav.searchRepositories('q');
  const second = await nav.searchRepositories('q');
  assert.deepEqual(first.map((item) => item.name), ['owner/one', 'owner/two']);
  assert.deepEqual(second, []);
  assert.equal(nav.researchDB.length, 2);
});

test('يكمل التقرير بعد فشل استعلام واحد ويضع الخطأ في errors', async () => {
  globalThis.fetch = async (url) => {
    const query = urlOf(url).searchParams.get('q');
    if (query === 'bad') return response({ message: 'invalid query' }, { status: 422 });
    return response({ items: [{ full_name: 'owner/good', html_url: 'https://github.com/owner/good' }] });
  };
  const nav = new TawhidGitHubNavigator({ gap: 0 });
  const report = await nav.startTawhidResearch({ queries: ['bad', 'good'] });
  assert.equal(report.ok, false);
  assert.equal(report.errors.length, 1);
  assert.equal(report.errors[0].error.code, 'HTTP_422');
  assert.equal(report.results.length, 1);
  assert.equal(report.results[0].query, 'good');
});

test('يعيد timeout كخطأ GitHubError دون اتصال حقيقي', async () => {
  globalThis.fetch = (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  });
  const nav = new TawhidGitHubNavigator({ gap: 0, timeout: 1_000 });
  await assert.rejects(() => nav.searchRepositories('timeout'), (error) => {
    assert(error instanceof GitHubError);
    assert.equal(error.code, 'TIMEOUT');
    return true;
  });
});
