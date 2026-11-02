let records = [];
let indexVersion = 0;
const FILTER_CACHE_LIMIT = 80;
const filterCache = new Map();

function tokenize(query) {
  const terms = [];
  const matcher = /"([^"]+)"|(\S+)/g;
  let match;
  const normalized = String(query || '').toLocaleLowerCase();
  while ((match = matcher.exec(normalized))) {
    const term = (match[1] || match[2]).trim();
    if (term) terms.push(term);
  }
  return terms;
}

function matchesQuery(text, terms, mode) {
  if (!terms.length) return true;
  return mode === 'any'
    ? terms.some((term) => text.includes(term))
    : terms.every((term) => text.includes(term));
}

function filterCacheKey(message) {
  return JSON.stringify([
    indexVersion,
    String(message.query || '').trim().toLocaleLowerCase(),
    message.searchMode === 'any' ? 'any' : 'all',
    message.sort || 'id',
    message.nodeFilter || 'all',
    message.softwareFilter || 'all',
    message.levelFilter || 'all'
  ]);
}

function cacheResult(key, result) {
  filterCache.delete(key);
  filterCache.set(key, result);
  while (filterCache.size > FILTER_CACHE_LIMIT) {
    filterCache.delete(filterCache.keys().next().value);
  }
}

function filterRecords(message) {
  const query = String(message.query || '').trim();
  const terms = tokenize(query);
  const searchMode = message.searchMode === 'any' ? 'any' : 'all';
  const nodeFilter = message.nodeFilter || 'all';
  const softwareFilter = message.softwareFilter || 'all';
  const levelFilter = message.levelFilter || 'all';
  const visibleIds = [];
  const visibleLevels = new Set();

  for (const record of records) {
    const levelMatches = levelFilter === 'all' || String(record.level) === String(levelFilter);
    const stateMatches = nodeFilter === 'all'
      || (nodeFilter === 'active' && record.configured)
      || (nodeFilter === 'empty' && !record.configured);
    const typeMatches = softwareFilter === 'all' || record.type === softwareFilter;
    const queryMatches = matchesQuery(record.searchText, terms, searchMode);
    if (!levelMatches || !stateMatches || !typeMatches || !queryMatches) continue;
    visibleIds.push(record.id);
    visibleLevels.add(record.level);
  }

  if (message.sort === 'level') {
    visibleIds.sort((a, b) => records[a - 1].level - records[b - 1].level || a - b);
  } else if (message.sort === 'active') {
    visibleIds.sort((a, b) => Number(records[b - 1].configured) - Number(records[a - 1].configured) || a - b);
  }

  return { visibleIds, visibleLevels: [...visibleLevels], total: visibleIds.length };
}

self.addEventListener('message', (event) => {
  const message = event.data || {};
  if (message.type === 'init') {
    records = Array.isArray(message.records) ? message.records : [];
    indexVersion = Number(message.indexVersion || 0);
    filterCache.clear();
    self.postMessage({ type: 'ready', total: records.length, indexVersion, cacheLimit: FILTER_CACHE_LIMIT });
    return;
  }
  if (message.type !== 'filter') return;

  const key = filterCacheKey(message);
  const cached = filterCache.get(key);
  if (cached) {
    cacheResult(key, cached);
    self.postMessage({ type: 'result', requestId: message.requestId, ...cached, cached: true });
    return;
  }

  const result = filterRecords(message);
  cacheResult(key, result);
  self.postMessage({ type: 'result', requestId: message.requestId, ...result, cached: false });
});
