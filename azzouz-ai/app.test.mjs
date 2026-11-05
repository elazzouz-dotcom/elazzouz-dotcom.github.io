import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  API_SOURCES,
  LOCAL_AND_MANUAL_SOURCES,
  buildDuckDuckGoUrl,
  buildFetchOptions,
  buildSearchUrl,
  evaluateArithmetic,
  extractArithmeticExpression,
  findExactMemory,
  isAlquranNoMatch,
  normalizeSourceResults,
  normalizeStoredCitation,
  queryLanguage,
  reconstructAbstract,
  stripMarkup
} from './core.mjs';

const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const appSource = await readFile(new URL('./app.mjs', import.meta.url), 'utf8');
const coreSource = await readFile(new URL('./core.mjs', import.meta.url), 'utf8');

test('عشرة مصادر API والتحليل الداخلي وذاكرة Azzouz', () => {
  assert.deepEqual(API_SOURCES.map((source) => source.id), ['alquran', 'wikipedia', 'openalex', 'crossref', 'github', 'wikipedia-en', 'duckduckgo', 'openlibrary', 'quotable', 'numbers']);
  assert.deepEqual(LOCAL_AND_MANUAL_SOURCES.map((source) => source.id), ['memory', 'duckduckgo-manual', 'internal']);
  assert.equal(buildDuckDuckGoUrl('black hole').hostname, 'duckduckgo.com');
});

test('روابط البحث تستخدم مضيفين ثابتين وحدودًا صغيرة وترميزًا صحيحًا', () => {
  const query = 'الثقب الأسود & نجوم';
  const quran = buildSearchUrl('alquran', query);
  assert.equal(quran.hostname, 'api.alquran.cloud');
  assert.match(quran.pathname, /quran-uthmani$/u);
  assert.equal(quran.searchParams.get('limit'), '3');

  const wiki = buildSearchUrl('wikipedia', query);
  assert.equal(wiki.hostname, 'ar.wikipedia.org');
  assert.equal(wiki.searchParams.get('origin'), '*');
  assert.equal(wiki.searchParams.get('srsearch'), query);
  assert.equal(wiki.searchParams.get('srlimit'), '3');

  const openAlex = buildSearchUrl('openalex', 'black hole');
  assert.equal(openAlex.hostname, 'api.openalex.org');
  assert.equal(openAlex.searchParams.get('per-page'), '3');

  const crossref = buildSearchUrl('crossref', 'black hole');
  assert.equal(crossref.hostname, 'api.crossref.org');
  assert.equal(crossref.searchParams.get('rows'), '3');

  const github = buildSearchUrl('github', 'black hole');
  assert.equal(github.hostname, 'api.github.com');
  assert.equal(github.searchParams.get('per_page'), '3');
  assert.equal(github.searchParams.get('q'), 'black hole');
  assert.throws(() => buildSearchUrl('wikipedia', 'x'.repeat(301)), /300/);
  assert.throws(() => buildSearchUrl('unknown', 'question'), /غير معروف/);
});

test('طلبات القراءة لا تحمل بيانات اعتماد أو ترويسة Authorization', () => {
  const options = buildFetchOptions('github', new AbortController().signal);
  assert.equal(options.method, 'GET');
  assert.equal(options.mode, 'cors');
  assert.equal(options.credentials, 'omit');
  assert.equal(options.referrerPolicy, 'no-referrer');
  assert.equal(options.headers.Accept, 'application/vnd.github+json');
  assert.equal('Authorization' in options.headers, false);
});

test('كشف لغة البحث واتجاه اختيار الترجمة', () => {
  assert.equal(queryLanguage('الثقب الأسود'), 'ar');
  assert.equal(queryLanguage('black hole'), 'en');
  assert.equal(buildSearchUrl('alquran', 'black hole').pathname.endsWith('/en.pickthall'), true);
});

test('تطبيع نتائج القرآن يبقي النص ورابط السورة ورقم الآية دون قبول موضع غير صالح', () => {
  const results = normalizeSourceResults('alquran', {
    data: {
      matches: [
        {
          number: 262,
          numberInSurah: 255,
          surah: { number: 2, name: 'البقرة' },
          edition: { englishName: 'Quran text' },
          text: 'اللّهُ لَا إِلَٰهَ إِلَّا هُوَ'
        },
        { numberInSurah: 0, surah: { number: 999, name: 'خارج الحدود' }, text: 'مرفوض' }
      ]
    }
  });
  assert.equal(results.length, 1);
  assert.match(results[0].title, /البقرة/u);
  assert.match(results[0].title, /255/u);
  assert.equal(results[0].url, 'https://alquran.cloud/surah/2');
  assert.match(results[0].excerpt, /اللّه/u);
});

test('404 بمعنى لا توجد آية مطابقة يعد بحثًا ناجحًا بلا نتائج', () => {
  assert.equal(isAlquranNoMatch(404, { code: 404, status: 'NOT FOUND', data: 'Nothing matching your search was found..' }), true);
  assert.equal(isAlquranNoMatch(404, { code: 404, status: 'NOT FOUND', data: 'Endpoint missing' }), false);
  assert.equal(isAlquranNoMatch(500, { code: 404, status: 'NOT FOUND', data: 'Nothing matching your search was found..' }), false);
});

test('تطبيع ويكيبيديا يزيل وسوم الإبراز ويبني رابطًا آمنًا إلى المقال', () => {
  const [result] = normalizeSourceResults('wikipedia', {
    query: {
      search: [{
        title: 'ثقب أسود',
        pageid: 42,
        snippet: '<span class="searchmatch">ثقب</span> <img src=x onerror=alert(1)> أسود'
      }]
    }
  });
  assert.equal(result.title, 'ثقب أسود');
  assert.equal(result.url, 'https://ar.wikipedia.org/wiki/%D8%AB%D9%82%D8%A8_%D8%A3%D8%B3%D9%88%D8%AF');
  assert.equal(result.excerpt, 'ثقب أسود');
  assert.equal(result.url.startsWith('https://ar.wikipedia.org/'), true);
});

test('تطبيع OpenAlex يعيد بناء abstract ويحافظ على DOI أو رابط السجل المسموح', () => {
  const [result] = normalizeSourceResults('openalex', {
    results: [{
      id: 'https://openalex.org/W123',
      doi: 'https://doi.org/10.1000/demo',
      title: 'An example paper',
      publication_year: 2024,
      abstract_inverted_index: { 'A': [0], 'test': [1], 'abstract.': [2] }
    }]
  }, 'en');
  assert.equal(result.title, 'An example paper');
  assert.equal(result.url, 'https://doi.org/10.1000/demo');
  assert.equal(result.excerpt, 'A test abstract.');
  const rejected = normalizeSourceResults('openalex', {
    results: [{ id: 'https://attacker.example/W123', title: 'Fake', primary_location: { landing_page_url: 'javascript:alert(1)' } }]
  });
  assert.equal(rejected.length, 0);
});

test('تطبيع Crossref وGitHub يحافظ على الاستشهادات ويزيل markup غير موثوق', () => {
  const [paper] = normalizeSourceResults('crossref', {
    message: {
      items: [{
        DOI: '10.1000/demo',
        URL: 'https://doi.org/10.1000/demo',
        title: ['Paper title'],
        author: [{ given: 'A', family: 'Writer' }],
        published: { 'date-parts': [[2023]] },
        abstract: '<jats:p>Summary <script>bad()</script> text.</jats:p>'
      }]
    }
  }, 'en');
  assert.equal(paper.url, 'https://doi.org/10.1000/demo');
  assert.equal(paper.title, 'Paper title');
  assert.match(paper.metadata, /A Writer/u);
  assert.equal(paper.excerpt, 'Summary bad() text.');

  const [repo] = normalizeSourceResults('github', {
    items: [{ full_name: 'owner/project', html_url: 'https://github.com/owner/project', description: '<img src=x onerror=alert(1)>A demo', language: 'JavaScript', stargazers_count: 12 }]
  }, 'en');
  assert.equal(repo.url, 'https://github.com/owner/project');
  assert.equal(repo.excerpt, 'A demo');
  assert.match(repo.metadata, /نجوم: 12/u);
  assert.equal(normalizeSourceResults('github', { items: [{ full_name: 'bad', html_url: 'https://evil.example/repo' }] }).length, 0);
  assert.equal(normalizeSourceResults('github', { items: [{ full_name: 'bad', html_url: 'https://sub.github.com/repo' }] }).length, 0);
});

test('روابط الذاكرة المحملة من التخزين يعاد فحصها مقابل النطاقات المسموحة', () => {
  assert.equal(normalizeStoredCitation({ sourceId: 'github', title: 'repo', url: 'https://github.com/owner/repo', excerpt: 'ok' }).url, 'https://github.com/owner/repo');
  assert.equal(normalizeStoredCitation({ sourceId: 'github', title: 'bad', url: 'javascript:alert(1)' }), null);
  assert.equal(normalizeStoredCitation({ sourceId: 'github', title: 'bad', url: 'https://github.io/owner/repo' }), null);
  assert.equal(normalizeStoredCitation({ sourceId: 'github', title: 'bad', url: 'https://sub.github.com/owner/repo' }), null);
});

test('تنظيف مقتطفات HTML وabstract لا يترك حقنًا نشطًا', () => {
  assert.equal(stripMarkup('<img src=x onerror=alert(1)>safe &amp; sound'), 'safe & sound');
  assert.equal(reconstructAbstract({ second: [1], first: [0] }), 'first second');
});

test('حساب محلي آمن يدعم العربية ولا يفسر رقمًا منفردًا كسؤال حسابي', () => {
  const expression = extractArithmeticExpression('احسب ١١٤ في ٦٢٣٦');
  assert.equal(expression, '114*6236');
  assert.equal(evaluateArithmetic(expression), 710904);
  assert.equal(evaluateArithmetic('2*(3+4)'), 14);
  assert.equal(evaluateArithmetic('−2 + 10'), 8);
  assert.equal(evaluateArithmetic('14 ÷ 7'), 2);
  assert.equal(extractArithmeticExpression('19'), null);
  assert.equal(extractArithmeticExpression('الثقب الأسود'), null);
  assert.throws(() => evaluateArithmetic('1/0'), /صفر/u);
  assert.throws(() => evaluateArithmetic('2**3'), /صيغة|توقعت|رموز/u);
  assert.throws(() => evaluateArithmetic('1+'.repeat(70)), /صيغة|120|عملية/u);
});

test('مطابقة الذاكرة محلية وحرفية بعد تطبيع الأحرف والمسافات', () => {
  const memory = [{ question: '  Black   Hole؟ ', answer: 'saved' }, { question: 'black hole physics', answer: 'other' }];
  assert.equal(findExactMemory(memory, 'black hole')?.answer, 'saved');
  assert.equal(findExactMemory(memory, 'black hole physics extra'), null);
});

test('الواجهة مشددة CSP وتستخدم عناصر DOM نصية ولا تستخدم eval أو innerHTML', () => {
  assert.match(html, /script-src 'self'; style-src 'self'/u);
  assert.doesNotMatch(html, /unsafe-inline/u);
  assert.match(html, /id="external-consent"/u);
  assert.match(html, /id="voice-consent"/u);
  assert.match(html, /id="speech-consent"/u);
  assert.match(html, /type="module" src="\/azzouz-ai\/app\.mjs"/u);
  assert.doesNotMatch(appSource, /\.innerHTML\s*=/u);
  assert.doesNotMatch(`${appSource}\n${coreSource}`, /\b(?:eval|Function)\s*\(/u);
  assert.match(appSource, /if \(!elements\.externalConsent\.checked\)/u);
  assert.match(appSource, /externalConsent\.addEventListener\('change'/u);
  assert.match(appSource, /state\.searchCancelled/u);
  assert.match(appSource, /controller\.abort\(\)/u);
  assert.match(appSource, /!elements\.voiceConsent\.checked \|\| !state\.voiceSession/u);
  assert.match(appSource, /speechConsent\.checked/u);
  assert.match(appSource, /speechSynthesis\.cancel\(\)/u);
  assert.match(appSource, /speechConsent\.addEventListener\('change'/u);
  assert.match(coreSource, /credentials: 'omit'/u);
});

test('كل معرّفات DOM التي يستخدمها التطبيق موجودة في الصفحة', () => {
  const idsInHtml = new Set([...html.matchAll(/\bid="([^"]+)"/gu)].map((match) => match[1]));
  const idsInApp = [...appSource.matchAll(/getElementById\('([^']+)'\)/gu)].map((match) => match[1]);
  assert.ok(idsInApp.length > 0);
  for (const id of idsInApp) assert.equal(idsInHtml.has(id), true, `DOM id missing: ${id}`);
});


test('سحب موافقة البحث يلغي الاتصالات الجارية ويمنع إرسال المصادر المنتظرة', async () => {
  class FakeElement {
    constructor(id = '') {
      this.id = id;
      this.value = '';
      this.checked = false;
      this.disabled = false;
      this.textContent = '';
      this.className = '';
      this.children = [];
      this.scrollHeight = 0;
      this.listeners = new Map();
    }

    addEventListener(type, listener) {
      const list = this.listeners.get(type) || [];
      list.push(listener);
      this.listeners.set(type, list);
    }

    dispatch(type, event = {}) {
      for (const listener of this.listeners.get(type) || []) listener(event);
    }

    append(...nodes) { this.children.push(...nodes); }
    appendChild(node) { this.children.push(node); return node; }
    replaceChildren(...nodes) { this.children = [...nodes]; }
    focus() {}
  }

  const ids = [...html.matchAll(/\bid="([^"]+)"/gu)].map((match) => match[1]);
  const elements = new Map(ids.map((id) => [id, new FakeElement(id)]));
  const previous = new Map(['document', 'window', 'localStorage', 'fetch'].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  let requestCount = 0;
  let abortCount = 0;

  globalThis.document = {
    getElementById: (id) => elements.get(id) || null,
    createElement: () => new FakeElement()
  };
  globalThis.window = { confirm: () => true };
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  globalThis.fetch = (_url, { signal } = {}) => {
    requestCount += 1;
    return new Promise((_resolve, reject) => {
      const rejectAborted = () => {
        abortCount += 1;
        reject(new DOMException('Request aborted by test', 'AbortError'));
      };
      if (signal?.aborted) rejectAborted();
      else signal?.addEventListener('abort', rejectAborted, { once: true });
    });
  };

  try {
    await import(`./app.mjs?consent-cancel-test=${process.pid}-${Date.now()}`);
    const question = elements.get('question');
    const externalConsent = elements.get('external-consent');
    const status = elements.get('status');
    question.value = 'black hole';
    externalConsent.checked = true;
    elements.get('ask').dispatch('click');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(requestCount, 3, 'should start only the configured three concurrent requests');

    externalConsent.checked = false;
    externalConsent.dispatch('change');
    for (let attempt = 0; attempt < 100 && !status.textContent.includes('أُوقف البحث'); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    assert.equal(abortCount, 3, 'all in-flight requests should receive abort signals');
    assert.equal(requestCount, 3, 'the remaining sources must not receive a request');
    assert.equal(question.value, 'black hole', 'the query should remain available for the user');
    assert.match(status.textContent, /أُوقف البحث/u);

    let spokenCount = 0;
    let speechCancelCount = 0;
    globalThis.window.SpeechRecognition = class {
      start() { globalThis.window.activeRecognition = this; }
      stop() {}
    };
    globalThis.window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    globalThis.window.speechSynthesis = {
      cancel() { speechCancelCount += 1; },
      speak() { spokenCount += 1; }
    };
    const voiceConsent = elements.get('voice-consent');
    const speechConsent = elements.get('speech-consent');
    voiceConsent.checked = true;
    elements.get('voice-start').dispatch('click');
    const recognition = globalThis.window.activeRecognition;
    const voiceResult = { results: [[{ transcript: 'احسب 2+2' }]] };

    recognition.onresult(voiceResult);
    assert.equal(spokenCount, 0, 'recognition consent alone must not enable speech output');
    speechConsent.checked = true;
    speechConsent.dispatch('change');
    recognition.onresult(voiceResult);
    assert.equal(spokenCount, 1, 'speech should run only after its separate consent');
    speechConsent.checked = false;
    speechConsent.dispatch('change');
    assert.equal(speechCancelCount, 2, 'revoking speech consent should cancel current speech');

    const questionCount = elements.get('question-count').textContent;
    voiceConsent.checked = false;
    voiceConsent.dispatch('change');
    recognition.onresult(voiceResult);
    assert.equal(elements.get('question-count').textContent, questionCount, 'late speech recognition must be ignored after consent is revoked');
    assert.equal(spokenCount, 1);
  } finally {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});
