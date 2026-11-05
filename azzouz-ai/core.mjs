export const MAX_QUERY_LENGTH = 300;
export const MAX_RESULTS_PER_SOURCE = 3;
export const MAX_EXCERPT_LENGTH = 520;

export const API_SOURCES = Object.freeze([
  Object.freeze({
    id: 'alquran',
    label: 'القرآن · AlQuran Cloud',
    description: 'بحث نصي في القرآن أو الترجمة؛ لا يفسّر الآيات ولا يستنبط منها حكمًا.',
    docsUrl: 'https://alquran.cloud/api',
    host: 'api.alquran.cloud'
  }),
  Object.freeze({
    id: 'wikipedia',
    label: 'Wikipedia · MediaWiki',
    description: 'مقتطفات من صفحات ويكيبيديا مع رابط للمقال الأصلي.',
    docsUrl: 'https://www.mediawiki.org/wiki/API:Search',
    host: 'wikipedia.org'
  }),
  Object.freeze({
    id: 'openalex',
    label: 'OpenAlex',
    description: 'اكتشاف أعمال علمية وبياناتها الببليوغرافية؛ قد تتوفر خلاصة مفهرسة.',
    docsUrl: 'https://help.openalex.org/api/searching/',
    host: 'api.openalex.org'
  }),
  Object.freeze({
    id: 'crossref',
    label: 'Crossref',
    description: 'بيانات وصفية للمنشورات المسجلة وDOI؛ وجود الملخص أو بعض الحقول غير مضمون.',
    docsUrl: 'https://www.crossref.org/documentation/retrieve-metadata/rest-api/',
    host: 'api.crossref.org'
  }),
  Object.freeze({
    id: 'github',
    label: 'GitHub',
    description: 'اكتشاف مستودعات برمجية عامة؛ وصف المستودع ليس مرجعًا علميًا عامًا.',
    docsUrl: 'https://docs.github.com/en/rest/search/search#search-repositories',
    host: 'api.github.com'
  }),
  Object.freeze({ id: 'wikipedia-en', label: 'Wikipedia English', description: 'نتائج ويكيبيديا باللغة الإنجليزية للمقارنة عبر اللغات.', docsUrl: 'https://www.mediawiki.org/wiki/API:Search', host: 'en.wikipedia.org' }),
  Object.freeze({ id: 'duckduckgo', label: 'DuckDuckGo · ملخص عام', description: 'ملخص عام من Instant Answer API؛ قد لا تتوفر إجابة لكل سؤال.', docsUrl: 'https://duckduckgo.com/api', host: 'api.duckduckgo.com' }),
  Object.freeze({ id: 'openlibrary', label: 'Open Library · كتب', description: 'فهرس كتب ومؤلفين وبيانات نشر.', docsUrl: 'https://openlibrary.org/developers/api', host: 'openlibrary.org' }),
  Object.freeze({ id: 'quotable', label: 'Quotable · حكمة', description: 'اقتباسات عامة قابلة للمقارنة وليست مصدرًا علميًا.', docsUrl: 'https://github.com/lukePeavey/quotable', host: 'api.quotable.io' }),
  Object.freeze({ id: 'numbers', label: 'Numbers API · حقيقة رياضية', description: 'معلومة عددية عند وجود رقم في السؤال.', docsUrl: 'https://numbersapi.com/', host: 'numbersapi.com' })
]);

export const LOCAL_AND_MANUAL_SOURCES = Object.freeze([
  Object.freeze({
    id: 'memory',
    label: 'ذاكرة Azzouz المحلية',
    description: 'أسئلة وروابط حُفظت اختياريًا على هذا الجهاز فقط؛ ليست مرجعًا مستقلًا.'
  }),
  Object.freeze({
    id: 'duckduckgo-manual',
    label: 'DuckDuckGo · بحث يدوي',
    description: 'يفتح صفحة بحث خارجية عند النقر.'
  }),
  Object.freeze({ id: 'internal', label: 'التحليل الداخلي · أبجد + آية', description: 'حساب محلي للجذر الرقمي وقيمة أبجد ومؤشرات الآية، دون اتصال.' })
]);

const API_HOSTS = Object.freeze({
  alquran: ['api.alquran.cloud', 'alquran.cloud'],
  wikipedia: ['ar.wikipedia.org', 'en.wikipedia.org'],
  openalex: ['api.openalex.org', 'openalex.org', 'doi.org'],
  crossref: ['api.crossref.org', 'doi.org'],
  github: ['api.github.com', 'github.com'],
  'wikipedia-en': ['en.wikipedia.org'],
  duckduckgo: ['api.duckduckgo.com', 'duckduckgo.com', 'en.wikipedia.org', 'ar.wikipedia.org'],
  openlibrary: ['openlibrary.org'],
  quotable: ['api.quotable.io'],
  numbers: ['numbersapi.com'],
  internal: ['elazzouz-dotcom.github.io']
});

function checkedQuery(value) {
  const query = String(value ?? '').trim();
  if (!query) throw new TypeError('أدخل سؤالًا أو عبارة للبحث.');
  if (query.length > MAX_QUERY_LENGTH) {
    throw new RangeError(`حد السؤال ${MAX_QUERY_LENGTH} حرفًا.`);
  }
  return query;
}

export function queryLanguage(query) {
  return /[\u0600-\u06ff]/u.test(String(query)) ? 'ar' : 'en';
}

export function buildSearchUrl(sourceId, rawQuery, language = queryLanguage(rawQuery)) {
  const query = checkedQuery(rawQuery);
  const locale = language === 'ar' ? 'ar' : 'en';

  if (sourceId === 'alquran') {
    const edition = locale === 'ar' ? 'quran-uthmani' : 'en.pickthall';
    const url = new URL(`https://api.alquran.cloud/v1/search/${encodeURIComponent(query)}/all/${edition}`);
    url.searchParams.set('limit', String(MAX_RESULTS_PER_SOURCE));
    return url;
  }

  if (sourceId === 'wikipedia') {
    const url = new URL(`https://${locale}.wikipedia.org/w/api.php`);
    url.search = new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: query,
      srlimit: String(MAX_RESULTS_PER_SOURCE),
      srprop: 'snippet',
      format: 'json',
      origin: '*'
    }).toString();
    return url;
  }

  if (sourceId === 'openalex') {
    const url = new URL('https://api.openalex.org/works');
    url.search = new URLSearchParams({
      search: query,
      'per-page': String(MAX_RESULTS_PER_SOURCE),
      select: 'id,doi,title,publication_year,primary_location,abstract_inverted_index'
    }).toString();
    return url;
  }

  if (sourceId === 'crossref') {
    const url = new URL('https://api.crossref.org/v1/works');
    url.search = new URLSearchParams({
      'query.bibliographic': query,
      rows: String(MAX_RESULTS_PER_SOURCE),
      select: 'DOI,title,author,published,URL,abstract,type'
    }).toString();
    return url;
  }

  if (sourceId === 'github') {
    const url = new URL('https://api.github.com/search/repositories');
    url.search = new URLSearchParams({
      q: query,
      per_page: String(MAX_RESULTS_PER_SOURCE),
      sort: 'stars',
      order: 'desc'
    }).toString();
    return url;
  }

  if (sourceId === 'wikipedia-en') {
    const url = new URL('https://en.wikipedia.org/w/api.php');
    url.search = new URLSearchParams({ action: 'query', list: 'search', srsearch: query, srlimit: String(MAX_RESULTS_PER_SOURCE), srprop: 'snippet', format: 'json', origin: '*' }).toString();
    return url;
  }
  if (sourceId === 'duckduckgo') {
    const url = new URL('https://api.duckduckgo.com/');
    url.search = new URLSearchParams({ q: query, format: 'json', no_html: '1', no_redirect: '1', skip_disambig: '1' }).toString();
    return url;
  }
  if (sourceId === 'openlibrary') {
    const url = new URL('https://openlibrary.org/search.json');
    url.search = new URLSearchParams({ q: query, limit: String(MAX_RESULTS_PER_SOURCE), fields: 'key,title,author_name,first_publish_year' }).toString();
    return url;
  }
  if (sourceId === 'quotable') {
    const url = new URL('https://api.quotable.io/quotes');
    url.search = new URLSearchParams({ query, limit: String(MAX_RESULTS_PER_SOURCE) }).toString();
    return url;
  }
  if (sourceId === 'numbers') {
    const number = String(query).match(/\d+/u)?.[0] || '0';
    return new URL(`https://numbersapi.com/${number}?json`);
  }

  throw new RangeError(`مصدر البحث غير معروف: ${sourceId}`);
}

export function buildFetchOptions(sourceId, signal) {
  const headers = { Accept: 'application/json' };
  if (sourceId === 'github') headers.Accept = 'application/vnd.github+json';
  return {
    method: 'GET',
    mode: 'cors',
    credentials: 'omit',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    headers,
    signal
  };
}

export function buildDuckDuckGoUrl(rawQuery) {
  const query = checkedQuery(rawQuery);
  const url = new URL('https://duckduckgo.com/');
  url.searchParams.set('q', query);
  return url;
}

export function stripMarkup(value, maxLength = MAX_EXCERPT_LENGTH) {
  const text = String(value ?? '')
    .replace(/<[^>]*>/gu, ' ')
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/giu, (entity, token) => {
      const lower = token.toLowerCase();
      if (lower === 'amp') return '&';
      if (lower === 'lt') return '<';
      if (lower === 'gt') return '>';
      if (lower === 'quot') return '"';
      if (lower === 'apos' || lower === '#39') return "'";
      if (lower === 'nbsp') return ' ';
      const numeric = lower.startsWith('#x')
        ? Number.parseInt(lower.slice(2), 16)
        : Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(numeric) && numeric > 0 && numeric <= 0x10ffff
        ? String.fromCodePoint(numeric)
        : entity;
    })
    .replace(/[\u0000-\u001f\u007f]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}…` : text;
}

export function reconstructAbstract(invertedIndex) {
  if (typeof invertedIndex === 'string') return stripMarkup(invertedIndex);
  if (!invertedIndex || typeof invertedIndex !== 'object' || Array.isArray(invertedIndex)) return '';
  const words = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    if (!Array.isArray(positions)) continue;
    for (const position of positions) {
      if (Number.isSafeInteger(position) && position >= 0 && position < 20000) {
        words.push([position, word]);
      }
    }
  }
  words.sort((a, b) => a[0] - b[0]);
  return stripMarkup(words.map((entry) => entry[1]).join(' '));
}

function safeHttpsUrl(value, sourceId) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    const allowed = API_HOSTS[sourceId] || [];
    if (!allowed.includes(host)) return null;
    return url.href;
  } catch {
    return null;
  }
}

function makeResult(sourceId, title, excerpt, url, metadata = {}) {
  const href = safeHttpsUrl(url, sourceId);
  if (!href) return null;
  return Object.freeze({
    sourceId,
    title: stripMarkup(title, 220) || 'نتيجة بلا عنوان',
    excerpt: stripMarkup(excerpt),
    url: href,
    metadata: stripMarkup(metadata, 260)
  });
}

export function normalizeStoredCitation(value) {
  if (!value || typeof value !== 'object') return null;
  const sourceId = [...API_SOURCES, ...LOCAL_AND_MANUAL_SOURCES].some((source) => source.id === value.sourceId) ? value.sourceId : '';
  if (!sourceId) return null;
  return makeResult(sourceId, value.title, value.excerpt, value.url, value.metadata);
}

function resultList(payload, limit = MAX_RESULTS_PER_SOURCE) {
  return Array.isArray(payload) ? payload.slice(0, limit) : [];
}

export function normalizeSourceResults(sourceId, payload, language = 'ar') {
  const locale = language === 'ar' ? 'ar' : 'en';
  let records = [];

  if (sourceId === 'alquran') {
    records = resultList(payload?.data?.matches).map((item) => {
      const surahNumber = Number(item?.surah?.number);
      const ayahNumber = Number(item?.numberInSurah);
      if (!Number.isInteger(surahNumber) || surahNumber < 1 || surahNumber > 114 ||
          !Number.isInteger(ayahNumber) || ayahNumber < 1) return null;
      const surahName = stripMarkup(item?.surah?.name || item?.surah?.englishName, 100);
      const editionName = stripMarkup(item?.edition?.englishName || item?.edition?.name, 100);
      const title = `سورة ${surahName}، الآية ${ayahNumber}${editionName ? ` · ${editionName}` : ''}`;
      return makeResult(
        sourceId,
        title,
        item?.text,
        `https://alquran.cloud/surah/${surahNumber}`,
        `رقم الآية العام: ${Number(item?.number) || 'غير متاح'}`
      );
    });
  } else if (sourceId === 'wikipedia') {
    const pages = payload?.query?.search;
    records = resultList(pages).map((item) => {
      const title = String(item?.title || '').trim();
      if (!title) return null;
      const encodedTitle = encodeURIComponent(title.replace(/\s+/gu, '_'));
      const host = locale === 'ar' ? 'ar.wikipedia.org' : 'en.wikipedia.org';
      return makeResult(
        sourceId,
        title,
        item?.snippet,
        `https://${host}/wiki/${encodedTitle}`,
        Number.isSafeInteger(Number(item?.pageid)) ? `معرّف الصفحة: ${Number(item.pageid)}` : ''
      );
    });
  } else if (sourceId === 'openalex') {
    records = resultList(payload?.results).map((item) => {
      const title = item?.title || 'عمل علمي بلا عنوان';
      const doi = safeHttpsUrl(item?.doi, sourceId);
      const openAlexId = safeHttpsUrl(item?.id, sourceId);
      const location = safeHttpsUrl(item?.primary_location?.landing_page_url, sourceId);
      const href = doi || openAlexId || location;
      const excerpt = reconstructAbstract(item?.abstract_inverted_index) || 'لا يتوفر ملخص في سجل OpenAlex.';
      const year = Number.isInteger(Number(item?.publication_year)) ? `سنة النشر: ${Number(item.publication_year)}` : '';
      return makeResult(sourceId, title, excerpt, href, year);
    });
  } else if (sourceId === 'crossref') {
    const items = payload?.message?.items;
    records = resultList(items).map((item) => {
      const doiUrl = safeHttpsUrl(item?.URL, sourceId);
      const recordUrl = item?.DOI
        ? safeHttpsUrl(`https://api.crossref.org/v1/works/${encodeURIComponent(String(item.DOI))}`, sourceId)
        : null;
      const authors = resultList(item?.author, 3)
        .map((author) => [author?.given, author?.family].filter(Boolean).join(' '))
        .filter(Boolean)
        .join('، ');
      const dateParts = item?.published?.['date-parts']?.[0] || [];
      const year = Number.isInteger(Number(dateParts[0])) ? Number(dateParts[0]) : null;
      const metadata = [authors, year ? `سنة النشر: ${year}` : '', item?.type || ''].filter(Boolean).join(' · ');
      const excerpt = item?.abstract ? stripMarkup(item.abstract) : 'سجل بيانات ببليوغرافية؛ لا يتضمن هذا السجل ملخصًا نصيًا متاحًا.';
      return makeResult(sourceId, resultList(item?.title, 1)[0] || 'منشور بلا عنوان', excerpt, doiUrl || recordUrl, metadata);
    });
  } else if (sourceId === 'github') {
    records = resultList(payload?.items).map((item) => {
      const metadata = [item?.language || '', Number.isFinite(Number(item?.stargazers_count)) ? `نجوم: ${Number(item.stargazers_count)}` : '']
        .filter(Boolean).join(' · ');
      return makeResult(
        sourceId,
        item?.full_name || item?.name,
        item?.description || 'لا يتوفر وصف للمستودع.',
        item?.html_url,
        metadata
      );
    });
  } else if (sourceId === 'wikipedia-en') {
    const pages = payload?.query?.search;
    records = resultList(pages).map((item) => {
      const title = String(item?.title || '').trim();
      if (!title) return null;
      return makeResult(sourceId, title, item?.snippet, `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/gu, '_'))}`, item?.pageid ? `Page ID: ${item.pageid}` : '');
    });
  } else if (sourceId === 'duckduckgo') {
    const abstract = payload?.AbstractText || payload?.Answer || '';
    if (abstract || payload?.Heading) records = [makeResult(sourceId, payload?.Heading || 'DuckDuckGo Instant Answer', abstract || 'لم يتوفر ملخص نصي.', payload?.AbstractURL || 'https://duckduckgo.com/', payload?.AbstractSource || 'DuckDuckGo')];
  } else if (sourceId === 'openlibrary') {
    records = resultList(payload?.docs).map((item) => makeResult(sourceId, item?.title, `المؤلفون: ${(item?.author_name || []).slice(0, 3).join('، ') || 'غير متاح'}`, `https://openlibrary.org${item?.key || ''}`, item?.first_publish_year ? `أول نشر: ${item.first_publish_year}` : ''));
  } else if (sourceId === 'quotable') {
    records = resultList(payload?.results).map((item) => makeResult(sourceId, item?.author || 'حكمة', item?.content, `https://api.quotable.io/quotes/${encodeURIComponent(item?._id || '')}`, item?.tags?.join('، ') || ''));
  } else if (sourceId === 'numbers') {
    records = [makeResult(sourceId, payload?.number != null ? `حقيقة عن ${payload.number}` : 'Numbers API', payload?.text, `https://numbersapi.com/${encodeURIComponent(payload?.number ?? '0')}`, payload?.type || 'number')];
  }

  return records.filter(Boolean).slice(0, MAX_RESULTS_PER_SOURCE);
}

export function isAlquranNoMatch(statusCode, payload) {
  return statusCode === 404 && payload?.code === 404 && payload?.status === 'NOT FOUND' &&
    typeof payload?.data === 'string' && /^Nothing matching your search was found\.*$/u.test(payload.data.trim());
}

function normalizeMathInput(value) {
  let text = String(value ?? '').normalize('NFKC');
  text = text
    .replace(/[٠-٩]/gu, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/gu, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[×✕]/gu, '*')
    .replace(/[÷]/gu, '/')
    .replace(/[−–]/gu, '-')
    .replace(/[؟?]$/u, '')
    .replace(/^\s*(?:احسب(?:\s+لي)?|حسب(?:\s+لي)?|ما\s+حاصل|كم\s+يساوي)\s*/iu, '')
    .replace(/\s+في\s+/giu, '*')
    .trim();
  if (!text || text.length > 120 || !/^[\d\s.+\-*/%()]+$/u.test(text)) return null;
  return text;
}

export function extractArithmeticExpression(question) {
  const raw = String(question ?? '').normalize('NFKC');
  const explicitPrompt = /^\s*(?:احسب(?:\s+لي)?|حسب(?:\s+لي)?|ما\s+حاصل|كم\s+يساوي)(?:\s|$)/iu.test(raw);
  const hasOperator = /[+*/%×✕÷−–]/u.test(raw) || /\s+في\s+/iu.test(raw);
  if (!explicitPrompt && !hasOperator) return null;
  return normalizeMathInput(raw);
}

export function evaluateArithmetic(rawExpression) {
  const expression = normalizeMathInput(rawExpression);
  if (!expression) throw new TypeError('اكتب عملية حسابية بسيطة بالأرقام والأقواس والعمليات + − × ÷ %.');
  const tokens = expression.match(/(?:\d+(?:\.\d*)?|\.\d+)|[()+\-*/%]/gu) || [];
  if (tokens.join('') !== expression.replace(/\s+/gu, '') || tokens.length > 120) {
    throw new TypeError('صيغة العملية غير مدعومة.');
  }
  let cursor = 0;
  let depth = 0;

  const checked = (value) => {
    if (!Number.isFinite(value)) throw new RangeError('نتيجة العملية ليست عددًا محدودًا.');
    return value;
  };
  const peek = () => tokens[cursor];
  const consume = () => tokens[cursor++];

  function parsePrimary() {
    const token = peek();
    if (token === '(') {
      consume();
      depth += 1;
      if (depth > 20) throw new RangeError('الأقواس متداخلة أكثر من الحد المسموح.');
      const value = parseExpression();
      if (consume() !== ')') throw new SyntaxError('قوس إغلاق مفقود.');
      depth -= 1;
      return value;
    }
    if (!token || !/^(?:\d+(?:\.\d*)?|\.\d+)$/u.test(token)) {
      throw new SyntaxError('توقعت رقمًا أو قوسًا.');
    }
    consume();
    return checked(Number(token));
  }

  function parseUnary() {
    if (peek() === '+') {
      consume();
      return parseUnary();
    }
    if (peek() === '-') {
      consume();
      return checked(-parseUnary());
    }
    return parsePrimary();
  }

  function parseTerm() {
    let value = parseUnary();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const operator = consume();
      const right = parseUnary();
      if ((operator === '/' || operator === '%') && right === 0) {
        throw new RangeError('لا يمكن القسمة على صفر.');
      }
      if (operator === '*') value = checked(value * right);
      else if (operator === '/') value = checked(value / right);
      else value = checked(value % right);
    }
    return value;
  }

  function parseExpression() {
    let value = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const operator = consume();
      const right = parseTerm();
      value = checked(operator === '+' ? value + right : value - right);
    }
    return value;
  }

  const result = parseExpression();
  if (cursor !== tokens.length) throw new SyntaxError('توجد رموز غير مفهومة في العملية.');
  return result;
}

export function normalizeMemoryQuery(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[؟?!.,،؛:]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function findExactMemory(memory, query) {
  const normalized = normalizeMemoryQuery(query);
  if (!normalized || !Array.isArray(memory)) return null;
  return memory.find((entry) => normalizeMemoryQuery(entry?.question || entry?.q) === normalized) || null;
}
