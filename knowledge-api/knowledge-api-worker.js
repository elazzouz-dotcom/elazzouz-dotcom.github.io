const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };
const MAX_BODY_BYTES = 64 * 1024;
const MAX_QUERY_CHARS = 500;
const MAX_RESULTS = 20;
const MAX_NODE_LIST_RESULTS = 6600;

function cors(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = new Set((env.ALLOWED_ORIGINS || 'https://elazzouz-dotcom.github.io').split(',').map((item) => item.trim()).filter(Boolean));
  return {
    ...JSON_HEADERS,
    'Access-Control-Allow-Origin': allowed.has(origin) ? origin : [...allowed][0],
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  };
}

function reply(request, env, payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: cors(request, env) });
}

function cleanText(value, max = 20_000) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}

function nodeKey(id) {
  return `N-${String(id).padStart(3, '0')}`;
}

function parseLimit(value, maximum = MAX_RESULTS) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(1, number)) : 10;
}

function normalizeNode(row) {
  if (!row) return null;
  return {
    id: row.id,
    nodeKey: row.node_key,
    title: row.title,
    description: row.description,
    content: row.content,
    url: row.url,
    language: row.language,
    domain: row.domain,
    trustScore: row.trust_score,
    status: row.status,
    sourceType: row.source_type,
    parentId: row.parent_id,
    metadata: (() => { try { return JSON.parse(row.metadata_json || '{}'); } catch { return {}; } })(),
    updatedAt: row.updated_at
  };
}

async function readJson(request) {
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > MAX_BODY_BYTES) throw new Error('حجم الطلب أكبر من الحد المسموح.');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new Error('حجم الطلب أكبر من الحد المسموح.');
  return JSON.parse(text || '{}');
}

function requireAdmin(request, env) {
  const configured = cleanText(env.ADMIN_TOKEN, 512);
  if (!configured) return true;
  return request.headers.get('Authorization') === `Bearer ${configured}`;
}

async function health(request, env) {
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM nodes').first();
  return reply(request, env, { ok: true, service: 'slaks-knowledge-api', nodeCount: Number(row?.count || 0), timestamp: new Date().toISOString() });
}

async function listNodes(request, env, url) {
  const limit = parseLimit(url.searchParams.get('limit'), MAX_NODE_LIST_RESULTS);
  const offset = Math.max(0, Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0);
  const domain = cleanText(url.searchParams.get('domain'), 80);
  const language = cleanText(url.searchParams.get('language'), 20);
  const where = ['status = \'active\''];
  const bindings = [];
  if (domain) { where.push('domain = ?'); bindings.push(domain); }
  if (language) { where.push('language = ?'); bindings.push(language); }
  const statement = `SELECT id,node_key,title,description,content,url,language,domain,trust_score,status,source_type,parent_id,metadata_json,updated_at FROM nodes WHERE ${where.join(' AND ')} ORDER BY id LIMIT ? OFFSET ?`;
  const result = await env.DB.prepare(statement).bind(...bindings, limit, offset).all();
  return reply(request, env, { items: (result.results || []).map(normalizeNode), limit, offset });
}

async function getNode(request, env, id) {
  const row = await env.DB.prepare('SELECT id,node_key,title,description,content,url,language,domain,trust_score,status,source_type,parent_id,metadata_json,updated_at FROM nodes WHERE id = ? OR node_key = ?').bind(id, id).first();
  if (!row) return reply(request, env, { error: 'العقدة غير موجودة.' }, 404);
  return reply(request, env, { node: normalizeNode(row) });
}

async function searchNodes(request, env, url) {
  const query = cleanText(url.searchParams.get('q'), MAX_QUERY_CHARS);
  if (!query) return reply(request, env, { items: [], query: '', sources: [] });
  const limit = parseLimit(url.searchParams.get('limit'));
  const domain = cleanText(url.searchParams.get('domain'), 80);
  const language = cleanText(url.searchParams.get('language'), 20);
  const terms = query.replace(/["'(){}:*^~]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 12);
  const match = terms.map((term) => `"${term.replace(/"/g, '')}"*`).join(' AND ');
  const filters = ['nodes_fts MATCH ?', 'n.status = \'active\''];
  const bindings = [match];
  if (domain) { filters.push('n.domain = ?'); bindings.push(domain); }
  if (language) { filters.push('n.language = ?'); bindings.push(language); }
  const statement = `SELECT n.id,n.node_key,n.title,n.description,n.content,n.url,n.language,n.domain,n.trust_score,n.status,n.source_type,n.parent_id,n.metadata_json,n.updated_at, bm25(nodes_fts, 2, 1, 1, 3, 2, 1) AS rank FROM nodes_fts JOIN nodes n ON n.id = nodes_fts.rowid WHERE ${filters.join(' AND ')} ORDER BY rank ASC, n.trust_score DESC, n.updated_at DESC LIMIT ?`;
  const result = await env.DB.prepare(statement).bind(...bindings, limit).all();
  const items = (result.results || []).map(normalizeNode);
  return reply(request, env, { query, items, sources: items.map((item) => ({ id: item.id, nodeKey: item.nodeKey, title: item.title, url: item.url, trustScore: item.trustScore })) });
}

async function createNode(request, env) {
  if (!requireAdmin(request, env)) return reply(request, env, { error: 'غير مصرح.' }, 401);
  const body = await readJson(request);
  const id = Number(body.id);
  if (!Number.isInteger(id) || id < 1 || id > 6600) return reply(request, env, { error: 'رقم العقدة يجب أن يكون بين 1 و6600.' }, 400);
  const values = {
    nodeKey: nodeKey(id), title: cleanText(body.title, 500), description: cleanText(body.description, 4_000), content: cleanText(body.content, 100_000), url: cleanText(body.url, 8_192), language: cleanText(body.language || 'ar', 20), domain: cleanText(body.domain || 'general', 80), trustScore: Math.min(1, Math.max(0, Number(body.trustScore ?? 0.5))), status: ['active','paused','review','unavailable'].includes(body.status) ? body.status : 'active', sourceType: cleanText(body.sourceType || 'web', 40), parentId: Number.isInteger(Number(body.parentId)) ? Number(body.parentId) : null, metadata: JSON.stringify(body.metadata && typeof body.metadata === 'object' ? body.metadata : {})
  };
  await env.DB.prepare(`INSERT INTO nodes (id,node_key,title,description,content,url,language,domain,trust_score,status,source_type,parent_id,metadata_json,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET node_key=excluded.node_key,title=excluded.title,description=excluded.description,content=excluded.content,url=excluded.url,language=excluded.language,domain=excluded.domain,trust_score=excluded.trust_score,status=excluded.status,source_type=excluded.source_type,parent_id=excluded.parent_id,metadata_json=excluded.metadata_json,updated_at=CURRENT_TIMESTAMP`).bind(id, values.nodeKey, values.title, values.description, values.content, values.url, values.language, values.domain, values.trustScore, values.status, values.sourceType, values.parentId, values.metadata).run();
  return reply(request, env, { ok: true, node: await getNodeObject(env, id) }, 201);
}

async function getNodeObject(env, id) {
  const row = await env.DB.prepare('SELECT id,node_key,title,description,content,url,language,domain,trust_score,status,source_type,parent_id,metadata_json,updated_at FROM nodes WHERE id = ?').bind(id).first();
  return normalizeNode(row);
}

async function createConversation(request, env) {
  const body = await readJson(request);
  const sessionId = cleanText(body.sessionId || crypto.randomUUID(), 128);
  const userMessage = cleanText(body.message, 8_000);
  if (!userMessage) return reply(request, env, { error: 'أدخل رسالة أولًا.' }, 400);
  const id = crypto.randomUUID();
  const sourceIds = Array.isArray(body.sourceIds) ? body.sourceIds.filter((id) => Number.isInteger(Number(id))).slice(0, 50).map(Number) : [];
  const assistantMessage = cleanText(body.answer, 20_000);
  const confidence = Math.min(1, Math.max(0, Number(body.confidence || 0)));
  await env.DB.prepare('INSERT INTO conversations (id,session_id,user_message,assistant_message,source_ids_json,confidence) VALUES (?,?,?,?,?,?)').bind(id, sessionId, userMessage, assistantMessage, JSON.stringify(sourceIds), confidence).run();
  return reply(request, env, { ok: true, id, sessionId });
}

async function conversationHistory(request, env, url) {
  const sessionId = cleanText(url.searchParams.get('sessionId'), 128);
  if (!sessionId) return reply(request, env, { error: 'sessionId مطلوب.' }, 400);
  const result = await env.DB.prepare('SELECT id,user_message,assistant_message,source_ids_json,confidence,created_at FROM conversations WHERE session_id = ? ORDER BY created_at DESC LIMIT 50').bind(sessionId).all();
  return reply(request, env, { items: (result.results || []).map((row) => ({ ...row, sourceIds: JSON.parse(row.source_ids_json || '[]') })) });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors(request, env) });
    try {
      if (!env.DB) return reply(request, env, { error: 'D1 binding DB غير مضبوط بعد.' }, 503);
      if (url.pathname === '/health' && request.method === 'GET') return health(request, env);
      if (url.pathname === '/api/nodes' && request.method === 'GET') return listNodes(request, env, url);
      if (url.pathname === '/api/nodes' && request.method === 'POST') return createNode(request, env);
      if (url.pathname.startsWith('/api/nodes/') && request.method === 'GET') return getNode(request, env, url.pathname.split('/').pop());
      if (url.pathname === '/api/search' && request.method === 'GET') return searchNodes(request, env, url);
      if (url.pathname === '/api/conversations' && request.method === 'GET') return conversationHistory(request, env, url);
      if (url.pathname === '/api/conversations' && request.method === 'POST') return createConversation(request, env);
      return reply(request, env, { error: 'المسار غير موجود.' }, 404);
    } catch (error) {
      console.error(error);
      return reply(request, env, { error: 'حدث خطأ داخلي في خادم المعرفة.' }, 500);
    }
  }
};
