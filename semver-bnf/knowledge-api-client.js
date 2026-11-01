const KNOWLEDGE_API_META = document.querySelector('meta[name="knowledge-api"]');
const KNOWLEDGE_API_QUERY = new URLSearchParams(window.location.search).get('knowledgeApi') || '';
const KNOWLEDGE_API_BASE = (KNOWLEDGE_API_QUERY || KNOWLEDGE_API_META?.content || '').trim().replace(/\/$/, '');
const KNOWLEDGE_SYNC_LIMIT = 6600;

function knowledgeStatus(message, state = 'idle') {
  const label = document.querySelector('#knowledge-api-status');
  const dot = document.querySelector('.knowledge-connection-dot');
  if (label) label.textContent = message;
  if (dot) dot.dataset.state = state;
}

function knowledgeApiUrl(path) {
  return `${KNOWLEDGE_API_BASE}${path}`;
}

async function knowledgeApiFetch(path, options = {}) {
  if (!KNOWLEDGE_API_BASE) throw new Error('لم يتم ضبط عنوان خادم المعرفة بعد.');
  const response = await fetch(knowledgeApiUrl(path), { ...options, headers: { Accept: 'application/json', ...(options.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `فشل الاتصال بالخادم (${response.status}).`);
  return payload;
}

function knowledgeApplyNode(item) {
  const id = Number(item?.id);
  if (!Number.isInteger(id) || id < 1 || id > 6600) return false;
  const hasContent = String(item.content || '').trim() || String(item.url || '').trim();
  if (!hasContent) return false;
  const key = `semver-bnf-node-links-${id}`;
  const data = { url: String(item.url || ''), kind: String(item.sourceType || 'web'), html: '', active: true, label: String(item.title || ''), description: String(item.description || ''), domain: String(item.domain || 'general'), language: String(item.language || 'ar'), content: String(item.content || ''), updatedAt: item.updatedAt || new Date().toISOString(), central: true };
  try { localStorage.setItem(key, JSON.stringify(data)); return true; } catch { return false; }
}

async function syncKnowledgeNodes() {
  const button = document.querySelector('#knowledge-api-sync');
  if (!KNOWLEDGE_API_BASE) {
    knowledgeStatus('وضع محلي · أضف عنوان Worker في meta[name="knowledge-api"] للمزامنة', 'idle');
    return { synced: 0, skipped: true };
  }
  if (button) button.disabled = true;
  knowledgeStatus('جارٍ الاتصال بخادم المعرفة المركزي…', 'loading');
  try {
    const health = await knowledgeApiFetch('/health');
    const payload = await knowledgeApiFetch(`/api/nodes?limit=${KNOWLEDGE_SYNC_LIMIT}&offset=0`);
    const items = Array.isArray(payload.items) ? payload.items : [];
    let synced = 0;
    items.forEach((item) => { if (knowledgeApplyNode(item)) synced += 1; });
    knowledgeStatus(`متصل · ${health.nodeCount ?? items.length} عقدة في الخادم · تمت مزامنة ${synced} عقدة`, 'online');
    window.dispatchEvent(new CustomEvent('knowledge-nodes-synced', { detail: { synced, total: items.length } }));
    return { synced, total: items.length };
  } catch (error) {
    knowledgeStatus(`وضع محلي · تعذر الاتصال بالخادم: ${error.message}`, 'error');
    return { synced: 0, error: error.message };
  } finally {
    if (button) button.disabled = false;
  }
}

window.SlaksKnowledge = Object.freeze({ enabled: Boolean(KNOWLEDGE_API_BASE), sync: syncKnowledgeNodes, search: (query, limit = 10) => knowledgeApiFetch(`/api/search?q=${encodeURIComponent(query)}&limit=${encodeURIComponent(limit)}`) });

document.addEventListener('DOMContentLoaded', () => {
  const button = document.querySelector('#knowledge-api-sync');
  if (!button) return;
  button.addEventListener('click', syncKnowledgeNodes);
  if (KNOWLEDGE_API_BASE) syncKnowledgeNodes();
});
