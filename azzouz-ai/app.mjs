import {
  API_SOURCES,
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
  stripMarkup
} from './core.mjs';

const MEMORY_KEY = 'azzouz-ai-memory-v1';
const MEMORY_DB = 'azzouz-ai-brain-db';
const MEMORY_STORE = 'knowledge';
const MAX_MEMORY_ENTRIES = 500;
const MAX_LOCAL_MEMORY_ENTRIES = 100;
const MAX_MEMORY_FILE_BYTES = 2 * 1024 * 1024;
const MEMORY_FORMAT = 'azzouz-brain';
const MEMORY_VERSION = 2;
const NIGHT_MEMORY_KEY = 'azzouz-ai-night-topics-v1';
const NIGHT_TOPICS = Object.freeze(['الثقب الأسود', 'النحل', 'فيزياء الكم', 'الذكاء الاصطناعي', 'النظام الشمسي', 'الدماغ البشري', 'دورة الماء', 'البناء الضوئي', 'مستعمرة النمل', 'المحيطات', 'الجبال', 'الرياضيات', 'الهندسة', 'التاريخ', 'الخط العربي']);
const MAX_SEARCHES_PER_MINUTE = 5;
const REQUEST_TIMEOUT_MS = 10000;
const SOURCE_LABELS = Object.freeze(Object.fromEntries(API_SOURCES.map((source) => [source.id, source.label])));

const elements = {
  question: document.getElementById('question'),
  ask: document.getElementById('ask'),
  chat: document.getElementById('chat'),
  status: document.getElementById('status'),
  externalConsent: document.getElementById('external-consent'),
  rememberQuestion: document.getElementById('remember-question'),
  voiceConsent: document.getElementById('voice-consent'),
  speechConsent: document.getElementById('speech-consent'),
  voiceStart: document.getElementById('voice-start'),
  voiceStop: document.getElementById('voice-stop'),
  speechStop: document.getElementById('speech-stop'),
  voiceLanguage: document.getElementById('voice-language'),
  voiceRate: document.getElementById('voice-rate'),
  showMemory: document.getElementById('show-memory'),
  clearMemory: document.getElementById('clear-memory'),
  exportMemory: document.getElementById('export-memory'),
  importMemory: document.getElementById('import-memory'),
  importMemoryFile: document.getElementById('import-memory-file'),
  nightInterval: document.getElementById('night-interval'),
  nightToggle: document.getElementById('night-toggle'),
  morningReport: document.getElementById('morning-report'),
  nightStatus: document.getElementById('night-status'),
  sourceStatus: document.getElementById('source-status'),
  questionCount: document.getElementById('question-count'),
  citationCount: document.getElementById('citation-count'),
  sourceCount: document.getElementById('source-count'),
  memoryCount: document.getElementById('memory-count'),
  streamComments: document.getElementById('stream-comments'),
  analyzeStreamComments: document.getElementById('analyze-stream-comments'),
  sampleStreamComments: document.getElementById('sample-stream-comments'),
  clearStreamComments: document.getElementById('clear-stream-comments'),
  streamAnalysis: document.getElementById('stream-analysis'),
  fixerCode: document.getElementById('fixer-code'),
  fixerError: document.getElementById('fixer-error'),
  fixerAnalyze: document.getElementById('fixer-analyze'),
  fixerSample: document.getElementById('fixer-sample'),
  fixerClear: document.getElementById('fixer-clear'),
  fixerResult: document.getElementById('fixer-result')
};

const state = {
  questionCount: 0,
  citationCount: 0,
  successfulSources: 0,
  memory: [],
  memoryLoaded: false,
  searchTimes: [],
  controllers: new Set(),
  searchCancelled: false,
  activeQuery: '',
  recognition: null,
  voiceSession: false,
  busy: false,
  nightOn: false,
  nightTimer: null,
  nightIndex: 0,
  nightTopics: []
};
let memoryDbPromise;

function setStatus(message, kind = '') {
  elements.status.textContent = String(message);
  elements.status.className = `live-status ${kind}`;
}

function updateStats() {
  elements.questionCount.textContent = String(state.questionCount);
  elements.citationCount.textContent = String(state.citationCount);
  elements.sourceCount.textContent = String(state.successfulSources);
  elements.memoryCount.textContent = state.memoryLoaded ? String(state.memory.length) : 'غير مفعّلة';
}

function loadNightTopics() {
  try {
    const raw = JSON.parse(localStorage.getItem(NIGHT_MEMORY_KEY) || '[]');
    state.nightTopics = Array.isArray(raw) ? raw.map((item) => ({
      question: stripMarkup(item?.question, 180),
      createdAt: Number.isFinite(Number(item?.createdAt)) ? Number(item.createdAt) : 0
    })).filter((item) => item.question).slice(-100) : [];
  } catch {
    state.nightTopics = [];
  }
}
function saveNightTopics() {
  try { localStorage.setItem(NIGHT_MEMORY_KEY, JSON.stringify(state.nightTopics.slice(-100))); } catch { /* التخزين الاختياري قد لا يتاح */ }
}
function updateNightStatus(message = '') {
  if (!elements.nightStatus) return;
  const prefix = state.nightOn ? 'السرب يعمل' : 'السرب متوقف';
  elements.nightStatus.textContent = `${prefix} · ${state.nightTopics.length} موضوعًا محليًا${message ? ` · ${message}` : ''}`;
  elements.nightToggle.textContent = state.nightOn ? 'إيقاف سرب الليل' : 'تشغيل سرب الليل';
  elements.nightToggle.setAttribute('aria-pressed', String(state.nightOn));
}

function appendMessage(text, kind = 'system') {
  const message = document.createElement('article');
  message.className = `message ${kind}`;
  message.textContent = String(text);
  elements.chat.appendChild(message);
  elements.chat.scrollTop = elements.chat.scrollHeight;
  return message;
}

function sourceName(sourceId) {
  return SOURCE_LABELS[sourceId] || (sourceId === 'memory' ? 'ذاكرة محلية' : 'مصدر غير معروف');
}

function createResultCard(result, label = sourceName(result.sourceId)) {
  const card = document.createElement('article');
  card.className = 'result-card';

  const source = document.createElement('p');
  source.className = 'source-label';
  source.textContent = label;

  const heading = document.createElement('h3');
  heading.textContent = result.title;
  card.append(source, heading);

  if (result.excerpt) {
    const excerpt = document.createElement('p');
    excerpt.className = 'excerpt';
    excerpt.textContent = result.excerpt;
    card.appendChild(excerpt);
  }

  if (result.metadata) {
    const metadata = document.createElement('p');
    metadata.className = 'metadata';
    metadata.textContent = result.metadata;
    card.appendChild(metadata);
  }

  const link = document.createElement('a');
  link.className = 'source-link';
  link.href = result.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.referrerPolicy = 'no-referrer';
  link.textContent = 'افتح المصدر الأصلي';
  card.appendChild(link);
  return card;
}

function appendResultCards(results, labelFor = sourceName) {
  if (!results.length) return null;
  const grid = document.createElement('div');
  grid.className = 'results-grid';
  for (const result of results) grid.appendChild(createResultCard(result, labelFor(result.sourceId)));
  elements.chat.appendChild(grid);
  elements.chat.scrollTop = elements.chat.scrollHeight;
  return grid;
}

function renderSourceStatuses(statuses) {
  elements.sourceStatus.replaceChildren();
  for (const source of API_SOURCES) {
    const row = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = source.label;
    const status = document.createElement('span');
    const stateValue = statuses[source.id] || { text: 'بانتظار البحث', kind: '' };
    status.textContent = stateValue.text;
    if (stateValue.kind) status.className = stateValue.kind;
    row.append(name, status);
    elements.sourceStatus.appendChild(row);
  }
}

function normalizeMemoryEntries(entries) {
  return (Array.isArray(entries) ? entries : []).map((entry) => ({
    question: stripMarkup(entry?.question, 300),
    answer: stripMarkup(entry?.answer, 1000),
    createdAt: Number.isFinite(Number(entry?.createdAt)) ? Number(entry.createdAt) : 0,
    citations: Array.isArray(entry?.citations) ? entry.citations.map(normalizeStoredCitation).filter(Boolean).slice(0, 15) : []
  })).filter((entry) => entry.question).slice(-MAX_MEMORY_ENTRIES);
}
function memoryIdentity(question) {
  return stripMarkup(question, 300).normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('ar');
}
function mergeMemoryEntries(current, incoming) {
  const merged = new Map();
  for (const entry of normalizeMemoryEntries([...current, ...incoming])) {
    const key = memoryIdentity(entry.question);
    const previous = merged.get(key);
    if (!previous || Number(entry.createdAt || 0) >= Number(previous.createdAt || 0)) merged.set(key, entry);
  }
  return [...merged.values()].sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0)).slice(-MAX_MEMORY_ENTRIES);
}
function openMemoryDb() {
  if (!('indexedDB' in window)) return Promise.resolve(null);
  if (memoryDbPromise) return memoryDbPromise;
  memoryDbPromise = new Promise((resolve) => {
    const request = indexedDB.open(MEMORY_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(MEMORY_STORE, { keyPath: 'question' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
  return memoryDbPromise;
}
async function readBrainMemory() {
  const db = await openMemoryDb();
  if (!db) return [];
  return new Promise((resolve) => {
    const request = db.transaction(MEMORY_STORE, 'readonly').objectStore(MEMORY_STORE).getAll();
    request.onsuccess = () => resolve(normalizeMemoryEntries(request.result));
    request.onerror = () => resolve([]);
  });
}
async function writeBrainMemory(entries) {
  const db = await openMemoryDb();
  if (!db) return false;
  await new Promise((resolve) => {
    const tx = db.transaction(MEMORY_STORE, 'readwrite');
    const store = tx.objectStore(MEMORY_STORE);
    store.clear();
    normalizeMemoryEntries(entries).forEach((entry) => store.put(entry));
    tx.oncomplete = resolve;
    tx.onerror = resolve;
  });
  return true;
}
function loadMemory() {
  if (state.memoryLoaded) return state.memory;
  state.memoryLoaded = true;
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    state.memory = normalizeMemoryEntries(parsed).slice(-MAX_LOCAL_MEMORY_ENTRIES);
  } catch {
    state.memory = [];
  }
  updateStats();
  void readBrainMemory().then((brain) => {
    if (!brain.length) return;
    state.memory = mergeMemoryEntries(state.memory, brain);
    updateStats();
  });
  return state.memory;
}

async function persistMemory() {
  const entries = normalizeMemoryEntries(state.memory);
  localStorage.setItem(MEMORY_KEY, JSON.stringify(entries.slice(-MAX_LOCAL_MEMORY_ENTRIES)));
  await writeBrainMemory(entries);
  state.memory = entries;
  state.memoryLoaded = true;
  updateStats();
}

function saveMemory(question, answer, citations = []) {
  if (!elements.rememberQuestion.checked) return false;
  loadMemory();
  const record = {
    question: stripMarkup(question, 300),
    answer: stripMarkup(answer, 700),
    createdAt: Date.now(),
    citations: citations.slice(0, 15).map((item) => ({
      sourceId: item.sourceId,
      title: stripMarkup(item.title, 180),
      excerpt: stripMarkup(item.excerpt, 260),
      url: item.url,
      metadata: stripMarkup(item.metadata, 160)
    }))
  };
  state.memory = mergeMemoryEntries(state.memory, [record]);
  try {
    void persistMemory().catch(() => setStatus('تعذر مزامنة الذاكرة مع التخزين الدائم؛ بقيت النتيجة في جلسة الصفحة.', 'warning'));
    updateStats();
    return true;
  } catch {
    setStatus('تعذر حفظ الذاكرة على هذا الجهاز؛ يمكنك متابعة البحث دون تخزين.', 'warning');
    return false;
  }
}

function renderMemoryMatch(record) {
  const label = record.createdAt ? new Date(record.createdAt).toLocaleString() : 'وقت غير متاح';
  appendMessage(`مطابقة محفوظة على هذا الجهاز · ${label}\n${record.answer || 'لا يوجد نص جواب محفوظ؛ تتوفر المراجع المحفوظة أدناه.'}`, 'system');
  const citations = Array.isArray(record.citations)
    ? record.citations.map(normalizeStoredCitation).filter(Boolean)
    : [];
  if (citations.length) appendResultCards(citations, (id) => `ذاكرة محلية · ${sourceName(id)}`);
}
async function exportMemory() {
  elements.exportMemory.disabled = true;
  elements.importMemory.disabled = true;
  setStatus('جارٍ تجهيز ملف الذاكرة…');
  try {
    loadMemory();
    const brain = await readBrainMemory();
    state.memory = mergeMemoryEntries(state.memory, brain);
    const payload = {
      format: MEMORY_FORMAT,
      version: MEMORY_VERSION,
      exportedAt: new Date().toISOString(),
      entryCount: state.memory.length,
      nightTopics: state.nightTopics.slice(-100),
      entries: normalizeMemoryEntries(state.memory)
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'azzouz-brain.json'; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setStatus(`تم تصدير ${payload.entries.length} ذاكرة إلى azzouz-brain.json.`);
  } catch {
    setStatus('تعذر تجهيز ملف الذاكرة؛ لم تتغير الذاكرة المحلية.', 'warning');
  } finally {
    elements.exportMemory.disabled = false;
    elements.importMemory.disabled = false;
  }
}
async function importMemoryFile(file) {
  if (!file) return;
  if (file.size > MAX_MEMORY_FILE_BYTES) {
    setStatus('ملف الذاكرة أكبر من 2 ميغابايت؛ اختر ملفًا أصغر.', 'warning');
    return;
  }
  elements.importMemory.disabled = true;
  elements.exportMemory.disabled = true;
  setStatus('جارٍ فحص ملف الذاكرة ودمجه…');
  try {
    const raw = JSON.parse(await file.text());
    const entries = Array.isArray(raw) ? raw : raw?.entries;
    if (!Array.isArray(entries)) throw new Error('صيغة الملف غير صحيحة: يجب أن يحتوي على entries.');
    if (raw?.format && raw.format !== MEMORY_FORMAT) throw new Error('هذا الملف ليس ملف ذاكرة Azzouz صالحًا.');
    if (raw?.version && Number(raw.version) > MEMORY_VERSION) throw new Error('إصدار ملف الذاكرة أحدث من هذا التطبيق. حدّث الصفحة ثم أعد المحاولة.');
    const imported = normalizeMemoryEntries(entries);
    if (!imported.length) throw new Error('الملف لا يحتوي على ذاكرة صالحة.');
    loadMemory();
    const before = new Map(state.memory.map((entry) => [memoryIdentity(entry.question), entry]));
    state.memory = mergeMemoryEntries(state.memory, imported);
    const added = imported.filter((entry) => !before.has(memoryIdentity(entry.question))).length;
    const updated = imported.length - added;
    await persistMemory();
    if (Array.isArray(raw?.nightTopics)) {
      state.nightTopics = raw.nightTopics.map((item) => ({
        question: stripMarkup(item?.question, 180),
        createdAt: Number.isFinite(Number(item?.createdAt)) ? Number(item.createdAt) : Date.now()
      })).filter((item) => item.question).slice(-100);
      saveNightTopics();
      updateNightStatus();
    }
    setStatus(`تم الدمج بنجاح: ${added} جديدة، ${updated} محدثة، والإجمالي ${state.memory.length} ذاكرة.`);
  } catch (error) {
    setStatus(error?.message || 'تعذر استيراد ملف الذاكرة.', 'warning');
  } finally {
    elements.importMemory.disabled = false;
    elements.exportMemory.disabled = false;
  }
}

function buildInternalAnalysis(query) {
  const abjad = { ا: 1, أ: 1, إ: 1, آ: 1, ب: 2, ج: 3, د: 4, ه: 5, ة: 5, و: 6, ز: 7, ح: 8, ط: 9, ي: 10, ى: 10, ك: 20, ل: 30, م: 40, ن: 50, س: 60, ع: 70, ف: 80, ص: 90, ق: 100, ر: 200, ش: 300, ت: 400, ث: 500, خ: 600, ذ: 700, ض: 800, ظ: 900, غ: 1000 };
  const value = [...String(query)].reduce((sum, letter) => sum + (abjad[letter] || 0), 0);
  const number = Number(String(query).match(/\d+/u)?.[0] || 0);
  const root = (n) => n ? 1 + ((n - 1) % 9) : 0;
  const ayah = number >= 1 && number <= 114 ? `الرقم ${number} يمكن استخدامه كمؤشر سورة/آية داخل المختبر؛ لا يمثل تفسيرًا أو حكمًا.` : 'لم يُذكر رقم بين 1 و114 في السؤال.';
  return { sourceId: 'internal', title: 'التحليل الداخلي · أبجد + آية', excerpt: `قيمة أبجد التقريبية لعبارة السؤال: ${value}. الجذر الرقمي: ${root(value)}. ${ayah}`, url: 'https://elazzouz-dotcom.github.io/azzouz-ai/#internal-analysis', metadata: 'حساب محلي قابل للتكرار · لا اتصال خارجي' };
}

function validateMathQuestion(question) {
  const expression = extractArithmeticExpression(question);
  if (!expression) return null;
  return { expression, answer: evaluateArithmetic(expression) };
}

function appendManualSearchLink(query) {
  const paragraph = document.createElement('p');
  paragraph.className = 'manual-search';
  const note = document.createElement('span');
  note.textContent = 'بحث ويب إضافي (اختياري): النقر يفتح DuckDuckGo ويرسل عبارة البحث إليه. ';
  const link = document.createElement('a');
  link.href = buildDuckDuckGoUrl(query).href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.referrerPolicy = 'no-referrer';
  link.textContent = 'افتح البحث يدويًا';
  paragraph.append(note, link);
  elements.chat.appendChild(paragraph);
}

const MEMORY_STOPWORDS = new Set('من في على إلى عن مع هذا هذه ذلك التي الذي هو هي من كان تكون يتم حول بين بعد قبل عند أو و ثم كما إن أن لا ما قد كل'.split(' '));
function meaningfulTokens(value) {
  return stripMarkup(value, 1200).toLocaleLowerCase('ar').replace(/[\u0640\u064b-\u065f\u06d6-\u06ed]/gu, '').split(/[^\p{L}\p{N}]+/u).filter((token) => token.length > 2 && !MEMORY_STOPWORDS.has(token));
}
function relatedMemories(memory, query) {
  const queryTokens = new Set(meaningfulTokens(query));
  if (!queryTokens.size) return [];
  return memory.map((entry) => {
    const entryTokens = new Set(meaningfulTokens(`${entry.question} ${entry.answer}`));
    const overlap = [...queryTokens].filter((token) => entryTokens.has(token)).length;
    return { entry, score: overlap / queryTokens.size };
  }).filter((item) => item.score >= 0.34).sort((a, b) => b.score - a.score || Number(b.entry.createdAt || 0) - Number(a.entry.createdAt || 0)).slice(0, 3);
}
function buildGroundedAnswer(query, citations, previous = []) {
  if (!citations.length) return '';
  const usable = citations.filter((item) => item.excerpt).slice(0, 6);
  const sourceNames = [...new Set(citations.map((item) => sourceName(item.sourceId)))].join('، ');
  const counts = new Map();
  usable.forEach((item) => meaningfulTokens(item.excerpt).forEach((token) => counts.set(token, (counts.get(token) || 0) + 1)));
  const sharedTerms = [...counts.entries()].filter(([, count]) => count >= Math.min(2, usable.length)).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([token]) => token);
  const points = usable.slice(0, 4).map((item) => `• ${stripMarkup(item.excerpt, 240)}`).join('\n');
  const memoryNote = previous.length ? `\n\nذاكرة سابقة مرتبطة بالسؤال:\n${previous.map(({ entry }) => `• ${stripMarkup(entry.answer, 220)}`).join('\n')}\nتمت مقارنة الذاكرة بالمصادر الجديدة وإضافة التحديث بدل استبدالها.` : '';
  return `ملخص Azzouz AI المقيّد بالمراجع حول «${stripMarkup(query, 180)}»:\n\nالفكرة الجامعة التقريبية: ${sharedTerms.length ? `تتكرر بين المقتطفات مفاهيم ${sharedTerms.join('، ')}؛ لذلك يجمعها هذا المحور المشترك.` : 'لا توجد كلمات مشتركة كافية، لذا أعرض المقتطفات للمقارنة بدل اختلاق فكرة موحدة.'}\n\nالمقتطفات الداعمة:\n${points || 'تتوفر سجلات وعناوين، لكن لا يتوفر مقتطف نصي كافٍ لصياغة ملخص.'}${memoryNote}\n\nالمصادر: ${sourceNames}. هذا تركيب لغوي خوارزمي من النتائج المسترجعة، وليس اقتباسًا حرفيًا ولا إثباتًا نهائيًا؛ راجع الروابط الأصلية قبل الاعتماد.`;
}

function reserveSearchSlot() {
  const now = Date.now();
  state.searchTimes = state.searchTimes.filter((time) => now - time < 60000);
  if (state.searchTimes.length >= MAX_SEARCHES_PER_MINUTE) {
    throw new Error('وصلت إلى الحد المحلي: خمسة أسئلة بحث خارجي في الدقيقة. انتظر قليلًا ثم أعد المحاولة.');
  }
  state.searchTimes.push(now);
}

async function fetchSource(sourceId, query, language, controller) {
  const url = buildSearchUrl(sourceId, query, language);
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url.href, buildFetchOptions(sourceId, controller.signal));
    if (sourceId === 'alquran' && response.status === 404) {
      const payload = await response.json().catch(() => null);
      if (isAlquranNoMatch(response.status, payload)) return [];
      const error = new Error('HTTP 404');
      error.status = 404;
      throw error;
    }
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const payload = await response.json();
    return normalizeSourceResults(sourceId, payload, language);
  } finally {
    clearTimeout(timeout);
  }
}

async function mapWithConcurrency(items, limit, callback) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await callback(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function loadMathAnswer(question, expression, value, shouldSpeak) {
  const answer = `${expression} = ${new Intl.NumberFormat('ar').format(value)} (حساب محلي، بلا اتصال خارجي).`;
  appendMessage(answer, 'system');
  saveMemory(question, answer, []);
  setStatus('حُسبت العملية محليًا؛ لم يُرسل السؤال إلى أي API.');
  if (shouldSpeak) speakText(answer);
}

function loadMemoryBeforeQuestion() {
  return elements.rememberQuestion.checked ? loadMemory() : [];
}

async function submitQuestion({ spoken = false, night = false } = {}) {
  if (state.busy) return;
  const query = elements.question.value.trim();
  if (!query) {
    setStatus('اكتب سؤالًا أو استخدم زر الميكروفون.', 'warning');
    elements.question.focus();
    return;
  }
  if (query.length > 300) {
    setStatus('اختصر السؤال إلى 300 حرف أو أقل.', 'warning');
    return;
  }

  state.questionCount += 1;
  updateStats();
  appendMessage(night ? `🌙 سرب الليل يدرس: ${query}` : query, night ? 'night' : 'user');
  elements.question.value = '';

  let mathResult = null;
  try {
    mathResult = validateMathQuestion(query);
  } catch (error) {
    appendMessage(`تعذر الحساب محليًا: ${error.message}`, 'warning');
    setStatus('لم يُرسل السؤال إلى مصدر خارجي.', 'warning');
    if (spoken) speakText('تعذر حساب العملية. راجع صيغة الأرقام والعمليات.');
    return;
  }
  if (mathResult) {
    loadMathAnswer(query, mathResult.expression, mathResult.answer, spoken);
    return;
  }

  const memory = loadMemoryBeforeQuestion();
  const exactMatch = findExactMemory(memory, query);
  const related = relatedMemories(memory, query);
  if (exactMatch) renderMemoryMatch(exactMatch);
  else if (related.length) appendMessage(`تذكرت ${related.length} إجابة مرتبطة بهذا السؤال، وسأقارنها بالمصادر الجديدة بدل البدء من الصفر.`, 'system');

  if (!elements.externalConsent.checked) {
    const explanation = 'لم أرسل السؤال إلى أي مصدر. فعّل موافقة البحث الخارجي ثم اضغط «ابحث بالمراجع» إذا أردت طلب نتائج جديدة.';
    appendMessage(explanation, 'warning');
    elements.question.value = query;
    setStatus('البحث الخارجي متوقف حتى توافق صراحةً.', 'warning');
    if (spoken) speakText(exactMatch?.answer || 'فعّل موافقة البحث الخارجي أولًا أو اكتب سؤالك محليًا.');
    return;
  }

  try {
    reserveSearchSlot();
  } catch (error) {
    elements.question.value = query;
    appendMessage(error.message, 'warning');
    setStatus(error.message, 'warning');
    if (spoken) speakText(error.message);
    return;
  }

  state.busy = true;
  state.searchCancelled = false;
  state.activeQuery = query;
  state.controllers.clear();
  elements.ask.disabled = true;
  elements.voiceStart.disabled = true;
  elements.status.textContent = 'جارٍ البحث في المصادر العامة؛ أُرسل نص السؤال فقط.';
  const language = queryLanguage(query);
  const statuses = Object.fromEntries(API_SOURCES.map((source) => [source.id, { text: 'جارٍ البحث…', kind: '' }]));
  renderSourceStatuses(statuses);
  const work = API_SOURCES.map((source) => source.id);
  let successfulCount = 0;
  let citations = [];

  try {
    const responses = await mapWithConcurrency(work, 3, async (sourceId) => {
      if (state.searchCancelled || !elements.externalConsent.checked) {
        statuses[sourceId] = { text: 'أُوقف قبل الإرسال', kind: 'cancelled' };
        renderSourceStatuses(statuses);
        return { sourceId, ok: false, cancelled: true, results: [] };
      }
      const controller = new AbortController();
      state.controllers.add(controller);
      try {
        const results = await fetchSource(sourceId, query, language, controller);
        if (state.searchCancelled) {
          statuses[sourceId] = { text: 'أُوقف', kind: 'cancelled' };
          renderSourceStatuses(statuses);
          return { sourceId, ok: false, cancelled: true, results: [] };
        }
        successfulCount += 1;
        statuses[sourceId] = { text: `${results.length} نتائج`, kind: 'ok' };
        renderSourceStatuses(statuses);
        return { sourceId, ok: true, results };
      } catch (error) {
        if (state.searchCancelled) {
          statuses[sourceId] = { text: 'أُوقف', kind: 'cancelled' };
          renderSourceStatuses(statuses);
          return { sourceId, ok: false, cancelled: true, results: [] };
        }
        const statusCode = Number(error?.status);
        const label = statusCode ? `HTTP ${statusCode}` : error?.name === 'AbortError' ? 'انتهت المهلة' : 'تعذر الاتصال';
        statuses[sourceId] = { text: label, kind: 'error' };
        renderSourceStatuses(statuses);
        return { sourceId, ok: false, results: [] };
      } finally {
        state.controllers.delete(controller);
      }
    });

    citations = [buildInternalAnalysis(query), ...responses.flatMap((response) => response.results)];
    state.successfulSources = successfulCount;
    state.citationCount += citations.length;
    updateStats();

    const wasCancelled = state.searchCancelled;
    const summary = wasCancelled
      ? `أُوقف البحث بعد سحب الموافقة. عُرضت فقط النتائج التي اكتملت قبل الإيقاف (${citations.length} نتيجة من ${successfulCount} مصادر)؛ لم يبدأ التطبيق طلبات المصادر المتبقية.`
      : citations.length
        ? `انتهى الاسترجاع: ${citations.length} نتيجة من ${successfulCount} مصادر استجابت. سيُبنى الملخص التالي من هذه المقتطفات فقط؛ افتح الروابط لمراجعة السياق الأصلي.`
        : `لم تُرجع المصادر نتائج قابلة للعرض. نجحت استجابة ${successfulCount} من أصل ${API_SOURCES.length} واجهات؛ افحص الحالة أعلاه وجرّب عبارة أدق لاحقًا.`;
    appendMessage(summary, wasCancelled || !citations.length ? 'warning' : 'system');
    const groundedAnswer = !wasCancelled ? buildGroundedAnswer(query, citations, related) : '';
    if (groundedAnswer) appendMessage(groundedAnswer, 'system');
    if (citations.length) appendResultCards(citations);
    if (!wasCancelled) {
      appendManualSearchLink(query);
      saveMemory(query, groundedAnswer || summary, citations);
    }
    setStatus(wasCancelled
      ? 'أُوقف البحث؛ لم تُحفظ نتائج جزئية في الذاكرة.'
      : `اكتمل البحث · ${successfulCount} مصادر ناجحة · ${citations.length} استشهادات${elements.rememberQuestion.checked ? ' · حُفظ محليًا' : ''}.`);
    if (spoken) speakText(groundedAnswer || summary);
  } catch {
    const message = 'تعذر إكمال عرض النتائج بسبب خطأ غير متوقع. لا تتضمن الرسالة تفاصيل السؤال أو بيانات شخصية.';
    appendMessage(message, 'warning');
    setStatus('حدث خطأ محلي أثناء معالجة النتائج.', 'warning');
    if (spoken) speakText(message);
  } finally {
    state.controllers.clear();
    state.activeQuery = '';
    state.busy = false;
    elements.ask.disabled = false;
    elements.voiceStart.disabled = false;
  }
}

async function learnNightTopic() {
  if (!state.nightOn || state.busy) return;
  if (!elements.externalConsent.checked) {
    stopNight('سُحبت موافقة البحث؛ لم يُرسل موضوع جديد.');
    return;
  }
  const query = NIGHT_TOPICS[state.nightIndex % NIGHT_TOPICS.length];
  state.nightIndex += 1;
  state.nightTopics.push({ question: query, createdAt: Date.now() });
  state.nightTopics = state.nightTopics.slice(-100);
  saveNightTopics();
  updateNightStatus(`الموضوع الحالي: ${query}`);
  elements.question.value = query;
  await submitQuestion({ night: true });
  updateNightStatus('اكتمل آخر موضوع أو تعذر مصدر من مصادره.');
}
function stopNight(message = '') {
  state.nightOn = false;
  if (state.nightTimer) window.clearInterval(state.nightTimer);
  state.nightTimer = null;
  updateNightStatus(message);
}
function startNight() {
  if (!elements.externalConsent.checked) {
    setStatus('فعّل موافقة البحث الخارجي أولًا؛ سرب الليل لا يعمل دون موافقة.', 'warning');
    return;
  }
  if (!elements.rememberQuestion.checked) {
    setStatus('فعّل الحفظ المحلي أولًا حتى لا يعمل السرب دون حفظ اختياري واضح.', 'warning');
    return;
  }
  state.nightOn = true;
  const minutes = Math.max(1, Number(elements.nightInterval.value) || 10);
  updateNightStatus(`الموضوع التالي كل ${minutes} دقيقة`);
  void learnNightTopic();
  state.nightTimer = window.setInterval(() => { void learnNightTopic(); }, minutes * 60 * 1000);
  setStatus('سرب الليل يعمل بموافقتك؛ يمكنك إيقافه في أي وقت.');
}
function toggleNight() {
  if (state.nightOn) stopNight('أوقفته يدويًا.');
  else startNight();
}
function morningReport() {
  loadNightTopics();
  if (!state.nightTopics.length) {
    appendMessage('لا يوجد تقرير ليلي بعد؛ شغّل سرب الليل يدويًا بعد تفعيل الموافقات.', 'night');
    setStatus('لا توجد مواضيع ليلية محفوظة بعد.', 'warning');
    return;
  }
  const topics = state.nightTopics.slice(-3).map((item) => item.question).join('، ');
  const report = `تقرير Azzouz الصباحي: سُجل ${state.nightTopics.length} موضوعًا محليًا. آخر المواضيع: ${topics}. هذه سجلات بحث محلية وليست تعلمًا مستقلًا أو ضمانًا لصحة النتائج.`;
  appendMessage(`🌅 ${report}`, 'night');
  setStatus(`تقرير الصباح جاهز · ${state.nightTopics.length} موضوعًا محليًا.`);
  if (elements.speechConsent.checked) speakText(report);
}

function renderMemory() {
  const memory = loadMemory();
  if (!memory.length) {
    appendMessage('لا توجد عناصر محفوظة في ذاكرة Azzouz على هذا الجهاز.', 'system');
    setStatus('الذاكرة المحلية فارغة. فعّل خيار الحفظ قبل البحث لتخزين نتائج لاحقة.');
    return;
  }
  appendMessage(`الذاكرة محلية على هذا الجهاز. يعرض التطبيق آخر ${Math.min(10, memory.length)} أسئلة محفوظة.`);
  for (const record of memory.slice(-10).reverse()) renderMemoryMatch(record);
  setStatus(`عُرضت الذاكرة المحلية · ${memory.length} عناصر.`);
}

function clearMemory() {
  if (!window.confirm('هل تريد مسح أسئلة ومراجع Azzouz AI المحفوظة على هذا الجهاز؟')) return;
  try {
    localStorage.removeItem(MEMORY_KEY);
    localStorage.removeItem(NIGHT_MEMORY_KEY);
    void writeBrainMemory([]);
    state.memory = [];
    state.nightTopics = [];
    state.memoryLoaded = true;
    updateStats();
    updateNightStatus();
    appendMessage('مُسحت الذاكرة المحلية من هذا المتصفح.', 'system');
    setStatus('تم مسح الذاكرة المحلية.');
  } catch {
    setStatus('تعذر مسح الذاكرة من التخزين المحلي.', 'warning');
  }
}

function speakText(text) {
  if (!elements.speechConsent.checked) {
    setStatus('بقي الرد نصيًا لأن موافقة إخراج الصوت غير مفعّلة.');
    return;
  }
  if (!('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') {
    setStatus('إخراج الصوت غير متاح في هذا المتصفح؛ يمكنك قراءة النص.', 'warning');
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new window.SpeechSynthesisUtterance(String(text).slice(0, 700));
  utterance.lang = elements.voiceLanguage.value;
  utterance.rate = Number(elements.voiceRate.value) || 1;
  utterance.onerror = () => setStatus('تعذر إخراج الصوت؛ بقي النص ظاهرًا للمراجعة.', 'warning');
  utterance.onstart = () => setStatus('يجري نطق ملخص قصير عبر صوت المتصفح.');
  utterance.onend = () => setStatus('انتهى النطق؛ يمكنك متابعة الكتابة أو الضغط على الميكروفون.');
  window.speechSynthesis.speak(utterance);
}

function stopVoice() {
  state.voiceSession = false;
  if (state.recognition) {
    try { state.recognition.stop(); } catch { /* قد يكون التسجيل متوقفًا بالفعل */ }
  }
  elements.voiceStop.disabled = true;
  elements.voiceStart.disabled = false;
  setStatus('أُوقف الاستماع.');
}

function startVoice() {
  if (state.busy) {
    setStatus('انتظر انتهاء البحث الحالي قبل بدء سؤال صوتي جديد.', 'warning');
    return;
  }
  if (!elements.voiceConsent.checked) {
    setStatus('فعّل موافقة الصوت أولًا، أو استخدم حقل الكتابة.', 'warning');
    return;
  }
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    setStatus('التعرف الصوتي غير مدعوم في هذا المتصفح. اكتب السؤال بدلًا منه.', 'warning');
    return;
  }
  if (state.voiceSession) return;

  const recognition = new Recognition();
  state.recognition = recognition;
  state.voiceSession = true;
  recognition.lang = elements.voiceLanguage.value;
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onstart = () => {
    elements.voiceStart.disabled = true;
    elements.voiceStop.disabled = false;
    setStatus('الميكروفون يستمع لسؤال واحد؛ اضغط «إيقاف الميكروفون» للإيقاف المبكر.');
  };
  recognition.onresult = (event) => {
    if (!elements.voiceConsent.checked || !state.voiceSession) {
      setStatus('تجاهلت نتيجة صوتية وصلت بعد سحب الموافقة أو إيقاف الاستماع.', 'warning');
      return;
    }
    const transcript = String(event.results?.[0]?.[0]?.transcript || '').trim();
    if (!transcript) {
      setStatus('لم يُلتقط كلام واضح؛ يمكنك المحاولة مرة أخرى أو الكتابة.', 'warning');
      return;
    }
    elements.question.value = transcript.slice(0, 300);
    void submitQuestion({ spoken: true });
  };
  recognition.onerror = (event) => {
    const code = String(event.error || 'unknown').replace(/[^a-z-]/giu, '').slice(0, 32);
    setStatus(`تعذر التعرف الصوتي (${code || 'غير محدد'}). يمكنك الكتابة بدلًا منه.`, 'warning');
  };
  recognition.onend = () => {
    state.voiceSession = false;
    elements.voiceStart.disabled = state.busy;
    elements.voiceStop.disabled = true;
  };
  try {
    recognition.start();
  } catch {
    state.voiceSession = false;
    elements.voiceStart.disabled = false;
    elements.voiceStop.disabled = true;
    setStatus('تعذر بدء الميكروفون؛ تحقق من إذن المتصفح أو اكتب السؤال.', 'warning');
  }
}

function analyzeStreamComments() {
  const lines = String(elements.streamComments.value || '').split(/\r?\n/gu).map((line) => line.trim()).filter(Boolean).slice(0, 200);
  if (!lines.length) { elements.streamAnalysis.textContent = 'ألصق تعليقًا واحدًا على الأقل ثم أعد التحليل.'; return; }
  const patterns = { question: /[؟?]|كيف|واش|فين|علاش|متى|شنو|هل|why|how|where/iu, positive: /شكرا|رائع|زوين|ممتاز|واضح|برافو|love|great|good/iu, concern: /مشكل|ما خدام|ضعيف|خايف|تأخر|صوتك|الصوت|مقطوع|help|problem/iu, spam: /تابعني|رابط ربحي|جائزة مجانية|اضغط هنا|free|follow me|http[s]?:\/\//iu };
  const counts = Object.fromEntries(Object.keys(patterns).map((key) => [key, 0]));
  const examples = Object.fromEntries(Object.keys(patterns).map((key) => [key, []]));
  for (const line of lines) for (const [key, pattern] of Object.entries(patterns)) if (pattern.test(line)) { counts[key] += 1; if (examples[key].length < 2) examples[key].push(line.slice(0, 140)); }
  const labels = { question: 'أسئلة', positive: 'إيجابية', concern: 'مخاوف/مشاكل', spam: 'مزعجة' };
  const summary = Object.entries(labels).map(([key, label]) => `${label}: ${counts[key]}`).join(' · ');
  const focus = Object.entries(counts).sort((a, b) => b[1] - a[1]).find(([, count]) => count > 0)?.[0];
  const next = focus === 'question' ? 'الأولوية: أجب عن الأسئلة المتكررة يدويًا.' : focus === 'concern' ? 'الأولوية: وضّح المشكلة أو افحص الصوت والاتصال.' : focus === 'spam' ? 'الأولوية: تجاهل الرسائل المزعجة يدويًا.' : 'الأولوية: تابع البث وراجع التعليقات المهمة يدويًا.';
  elements.streamAnalysis.textContent = `حلّل المتصفح ${lines.length} تعليقًا.\n${summary}\n${next}`;
}
function sampleStreamComments() {
  elements.streamComments.value = 'كيفاش نبدأ؟\nالصوت واضح اليوم\nفين الرابط؟\nالصوت مقطوع عندي\nبرافو على البث\nتابعني واربح جائزة مجانية';
  analyzeStreamComments();
}
function clearStreamComments() { elements.streamComments.value = ''; elements.streamAnalysis.textContent = 'تم المسح. لم تُرسل التعليقات إلى أي خدمة.'; }

function analyzeCodeFix() {
  const code = String(elements.fixerCode.value || '');
  const error = String(elements.fixerError.value || '').trim();
  if (!error) { elements.fixerResult.textContent = 'ألصق رسالة الخطأ أولًا.'; return; }
  const suggestions = [];
  if (/NameError.*requests|name ['"]requests['"] is not defined/iu.test(error) && !/^\s*import\s+requests\b/mu.test(code)) suggestions.push('أضف `import requests` في أعلى الملف إذا كان استخدام المكتبة مقصودًا.');
  const missing = error.match(/No module named ['"]([^'"]+)['"]/iu);
  if (missing) suggestions.push(`المكتبة «${missing[1]}» غير موجودة. ثبّتها يدويًا داخل بيئة موثوقة بعد مراجعة اسمها، ولا تثبّت شيئًا تلقائيًا من الموقع.`);
  if (/SyntaxError/iu.test(error)) suggestions.push('راجع السطر المذكور، الأقواس، النقطتين، وعلامات الاقتباس. شغّل أداة الفحص محليًا بعد أخذ نسخة احتياطية.');
  if (/client[_ -]?key|redirect[_ -]?uri|oauth/iu.test(error)) suggestions.push('تحقق من Client Key وRedirect URI المطابقين حرفيًا، ومن إضافة الحساب إلى Test users في وضع Sandbox.');
  if (/undefined|null/iu.test(error)) suggestions.push('تحقق من قيمة المتغير قبل استعمالها، واستعمل قيمة افتراضية أو فحصًا صريحًا بدل تغيير الملف عشوائيًا.');
  if (!suggestions.length) suggestions.push('لم يتعرف الفاحص على نمط آمن محدد. راجع السطر المشار إليه، اختبر نسخة احتياطية، ولا تطبق تعديلًا قبل فهمه.');
  elements.fixerResult.textContent = `نتيجة الفحص\n${suggestions.map((item, i) => `${i + 1}. ${item}`).join('\n')}\n\nالفحص محلي فقط: لم يُنفّذ الكود، ولم تُكتب ملفات، ولم تُثبت حزم، ولم تُرسل البيانات إلى خدمة خارجية.`;
}
function sampleCodeFix() { elements.fixerCode.value = 'name = requests.get(url)'; elements.fixerError.value = "NameError: name 'requests' is not defined"; analyzeCodeFix(); }
function clearCodeFix() { elements.fixerCode.value = ''; elements.fixerError.value = ''; elements.fixerResult.textContent = 'تم المسح. لم يُنفّذ أي كود.'; }

function initialize() {
  const initialStatuses = Object.fromEntries(API_SOURCES.map((source) => [source.id, { text: 'بانتظار موافقتك', kind: '' }]));
  renderSourceStatuses(initialStatuses);
  loadNightTopics();
  updateNightStatus();
  updateStats();

  elements.ask.addEventListener('click', () => { void submitQuestion(); });
  elements.question.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      void submitQuestion();
    }
  });
  elements.voiceStart.addEventListener('click', startVoice);
  elements.voiceStop.addEventListener('click', stopVoice);
  elements.speechStop.addEventListener('click', () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setStatus('أُوقف إخراج الصوت.');
  });
  elements.showMemory.addEventListener('click', renderMemory);
  elements.clearMemory.addEventListener('click', clearMemory);
  elements.nightToggle.addEventListener('click', toggleNight);
  elements.morningReport.addEventListener('click', morningReport);
  elements.exportMemory.addEventListener('click', () => { void exportMemory(); });
  elements.importMemory.addEventListener('click', () => elements.importMemoryFile.click());
  elements.importMemoryFile.addEventListener('change', (event) => { void importMemoryFile(event.target.files?.[0]); event.target.value = ''; });
  elements.analyzeStreamComments.addEventListener('click', analyzeStreamComments);
  elements.sampleStreamComments.addEventListener('click', sampleStreamComments);
  elements.clearStreamComments.addEventListener('click', clearStreamComments);
  elements.fixerAnalyze.addEventListener('click', analyzeCodeFix);
  elements.fixerSample.addEventListener('click', sampleCodeFix);
  elements.fixerClear.addEventListener('click', clearCodeFix);
  elements.externalConsent.addEventListener('change', () => {
    if (!elements.externalConsent.checked) {
      if (state.busy) {
        state.searchCancelled = true;
        for (const controller of state.controllers) controller.abort();
        if (state.activeQuery) elements.question.value = state.activeQuery;
        if (state.nightOn) stopNight('سُحبت الموافقة؛ أُوقف السرب.');
        setStatus('سحبت الموافقة؛ أرسلت إلغاءً للاتصالات الجارية ومنعت بدء البقية. قد يكون المزود استلم الطلبات السابقة.', 'warning');
      } else {
        setStatus('الموافقة غير مفعّلة؛ لن يبدأ أي بحث خارجي.', 'warning');
      }
      return;
    }
    setStatus('الموافقة مفعّلة لهذه الجلسة فقط؛ اضغط «ابحث بالمراجع» لبدء طلب متعمد.');
  });
  elements.rememberQuestion.addEventListener('change', () => {
    if (elements.rememberQuestion.checked) {
      loadMemory();
      setStatus('الحفظ محلي على هذا الجهاز؛ استخدم زر مسح الذاكرة متى شئت.');
    } else {
      setStatus('لن تُحفظ الأسئلة الجديدة؛ العناصر المحفوظة سابقًا تبقى حتى تمسحها.');
    }
  });
  elements.voiceConsent.addEventListener('change', () => {
    if (!elements.voiceConsent.checked && state.voiceSession) stopVoice();
  });
  elements.speechConsent.addEventListener('change', () => {
    if (!elements.speechConsent.checked) {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      setStatus('أُوقف إخراج الصوت؛ يبقى المحتوى نصيًا.');
    } else {
      setStatus('موافقة إخراج الصوت مفعّلة؛ لا يُنطق النص إلا بعد سؤالك بالصوت.');
    }
  });
}

initialize();
