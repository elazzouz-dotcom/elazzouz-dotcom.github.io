import { NODE_LEVELS, NODE_TOTAL, getNodeParent, mapConcurrent, parseNodeLink } from './graph-model.mjs';

const $ = (selector) => document.querySelector(selector);
const LINK_KEY = 'semver-bnf-node-links';
const UI_SETTINGS_KEY = 'semver-bnf-ui-settings';
const POSITIONS_KEY = 'semver-bnf-node-positions';
const BUILTIN_NODES = Object.freeze({
  600: {
    url: 'https://elazzouz-dotcom.github.io/satellite/',
    html: '',
    active: true,
    builtIn: true,
    label: 'VSAT Gateway'
  }
});
const NODE_SIZE = 44;
const NODE_SPACING_CM = 20;
const NODE_SPACING_PX = NODE_SPACING_CM * 37.7952755906;
const ROW_GAP = NODE_SPACING_PX;
const LEVEL_GAP = NODE_SPACING_PX;
const MAX_HTML_CHARS = 300_000;
const MAX_STORAGE_CHARS = 650_000;
const nodeViewport = $('#node-viewport');
const stageWrap = $('#network-stage-wrap');
const stage = $('#network-stage');
const nodeNetwork = $('#node-network');
const lines = $('#node-lines');
const nodeButtons = new Map();
const nodeTypeCache = new Map();
let filterFrame = 0;
const levelLabels = [];
const nodePositions = new Map();
let mapWidth = 0;
let mapHeight = 0;
let zoom = 1;
let latestReport = null;
let activeHub = { id: null, node: null };
let focusReturn = null;
let draggedNode = null;
let suppressNodeClick = false;
let focusedEdge = null;

function readJson(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function semverStorageChars(excludeKey = '') {
  let total = 0;
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key === excludeKey || !(key === LINK_KEY || key.startsWith(`${LINK_KEY}-`) || key === 'semver-hub-stem-data' || key.startsWith('semver-ai-analysis-'))) continue;
    total += key.length + (localStorage.getItem(key) || '').length;
  }
  return total;
}

function persistUiSettings() {
  writeJson(UI_SETTINGS_KEY, {
    zoom,
    query: $('#node-search')?.value || '',
    nodeFilter: $('#node-filter')?.value || 'all',
    softwareFilter: $('#software-filter')?.value || 'all',
    levelFilter: $('#level-filter')?.value || 'all'
  });
}
function restoreUiSettings() {
  const settings = readJson(UI_SETTINGS_KEY, {});
  if (Number.isFinite(settings.zoom)) zoom = Math.min(1.5, Math.max(.6, Number(settings.zoom)));
  if ($('#node-search')) {
    $('#node-search').value = String(settings.query || '');
    if ($('#node-search-clear')) $('#node-search-clear').hidden = !settings.query;
  }
  if ($('#node-filter') && ['all', 'active', 'empty'].includes(settings.nodeFilter)) $('#node-filter').value = settings.nodeFilter;
  if ($('#software-filter') && ['all', 'software', 'download', 'web', 'app', 'html'].includes(settings.softwareFilter)) $('#software-filter').value = settings.softwareFilter;
  if ($('#level-filter') && (settings.levelFilter === 'all' || /^[0-8]$/.test(String(settings.levelFilter)))) $('#level-filter').value = String(settings.levelFilter);
}
function getHubData(id) {
  try {
    const stored = localStorage.getItem(`${LINK_KEY}-${id}`);
    if (stored) {
      const value = JSON.parse(stored);
      if (typeof value === 'string') return { url: value, html: '', active: true };
      return value && typeof value === 'object' ? value : null;
    }
  } catch {
    return null;
  }
  const index = readJson(LINK_KEY, {});
  const legacy = index?.[id];
  if (typeof legacy === 'string' && /^https?:\/\//i.test(legacy)) return { url: legacy, html: '', active: true };
  return BUILTIN_NODES[id] || null;
}

function isConfigured(data) {
  return Boolean(data && (String(data.url || '').trim() || String(data.html || '').trim()));
}

function nodeLabel(id) {
  return `N-${String(id).padStart(3, '0')}`;
}

function refreshNode(id) {
  nodeTypeCache.delete(id);
  const button = nodeButtons.get(id);
  if (!button) return;
  const data = getHubData(id);
  const configured = isConfigured(data);
  button.dataset.active = String(configured);
  button.setAttribute('aria-pressed', String(configured));
  const badge = button.querySelector('.node-badge');
  if (!configured) {
    badge.hidden = true;
    badge.textContent = '';
    return;
  }
  let label = 'HTML';
  if (data.label) label = data.label;
  else if (data.url) {
    try { label = parseNodeLink(data.url).display; }
    catch { label = 'رابط'; }
  }
  badge.textContent = label;
  badge.hidden = false;
}

function updateStats() {
  let active = 0;
  for (let id = 1; id <= NODE_TOTAL; id += 1) {
    if (isConfigured(getHubData(id))) active += 1;
  }
  $('#active-count').textContent = String(active);
  $('#node-total').textContent = String(NODE_TOTAL);
  $('#relation-count').textContent = String(NODE_TOTAL - 1);
}

function readNodePositions() {
  const stored = readJson(POSITIONS_KEY, {});
  return stored && typeof stored === 'object' ? stored : {};
}
function saveNodePositions() {
  const positions = {};
  nodePositions.forEach((position, id) => { positions[id] = { x: Math.round(position.x), y: Math.round(position.y) }; });
  if (writeJson(POSITIONS_KEY, positions)) setNodeStatus('تم حفظ ترتيب العقد محليًا تلقائيًا.');
}
function fitMapToPositions() {
  let maxX = mapWidth;
  let maxY = mapHeight;
  nodePositions.forEach(({ x, y }) => {
    maxX = Math.max(maxX, x + NODE_SIZE / 2 + 40);
    maxY = Math.max(maxY, y + NODE_SIZE / 2 + 40);
  });
  mapWidth = Math.ceil(maxX);
  mapHeight = Math.ceil(maxY);
  nodeNetwork.style.width = `${mapWidth}px`;
  nodeNetwork.style.height = `${mapHeight}px`;
}
function beginNodeDrag(event, id, button) {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  if (draggedNode || event.isPrimary === false) return;
  const position = nodePositions.get(id);
  if (!position) return;
  event.preventDefault();
  draggedNode = { id, button, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: position.x, originY: position.y, moved: false };
  button.setPointerCapture?.(event.pointerId);
}
function moveNodeDrag(event) {
  if (!draggedNode || event.pointerId !== draggedNode.pointerId) return;
  const drag = draggedNode;
  event.preventDefault();
  const deltaX = (event.clientX - drag.startX) / zoom;
  const deltaY = (event.clientY - drag.startY) / zoom;
  if (!drag.moved && Math.hypot(deltaX, deltaY) < 5) return;
  drag.moved = true;
  suppressNodeClick = true;
  const next = nodePositions.get(drag.id);
  next.x = Math.max(NODE_SIZE / 2, drag.originX + deltaX);
  next.y = Math.max(NODE_SIZE / 2, drag.originY + deltaY);
  drag.button.classList.add('is-dragging');
  drag.button.style.left = `${next.x - NODE_SIZE / 2}px`;
  drag.button.style.top = `${next.y - NODE_SIZE / 2}px`;
  fitMapToPositions();
  drawEdges();
  applyZoom();
}
function endNodeDrag(event) {
  if (!draggedNode || (event.pointerId && event.pointerId !== draggedNode.pointerId)) return;
  const drag = draggedNode;
  event.preventDefault();
  drag.button.releasePointerCapture?.(drag.pointerId);
  drag.button.classList.remove('is-dragging');
  draggedNode = null;
  if (drag.moved) {
    saveNodePositions();
    window.setTimeout(() => { suppressNodeClick = false; }, 0);
  }
}
function createNodeElements() {
  let id = 1;
  NODE_LEVELS.forEach((count, level) => {
    const label = document.createElement('span');
    label.className = 'network-level-label';
    label.textContent = `المستوى ${level + 1} · ${count} عقدة`;
    label.dataset.level = String(level);
    nodeNetwork.appendChild(label);
    levelLabels.push(label);
    for (let position = 0; position < count; position += 1, id += 1) {
      const currentId = id;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'network-node';
      button.dataset.id = String(currentId);
      button.dataset.level = String(level);
      button.setAttribute('aria-label', `${nodeLabel(currentId)}، المستوى ${level + 1}، افتح الإعدادات`);
      button.setAttribute('aria-pressed', 'false');
      const plus = document.createElement('span');
      plus.className = 'node-plus';
      plus.setAttribute('aria-hidden', 'true');
      plus.textContent = '+';
      const number = document.createElement('span');
      number.className = 'node-id';
      number.textContent = nodeLabel(currentId);
      const badge = document.createElement('span');
      badge.className = 'node-badge';
      badge.hidden = true;
      button.append(plus, number, badge);
      button.addEventListener('click', () => {
        if (suppressNodeClick) return;
        openHubNode(currentId, button);
      });
      button.addEventListener('pointerdown', (event) => beginNodeDrag(event, currentId, button));
      button.addEventListener('pointermove', moveNodeDrag);
      button.addEventListener('pointerup', endNodeDrag);
      button.addEventListener('pointercancel', endNodeDrag);
      button.addEventListener('lostpointercapture', endNodeDrag);
      nodeNetwork.appendChild(button);
      nodeButtons.set(currentId, button);
      refreshNode(currentId);
    }
  });
  updateStats();
}

function clearEdgeFocus() {
  if (!focusedEdge) return;
  const previous = focusedEdge;
  previous.path?.classList.remove('edge-focused');
  nodeButtons.get(previous.parentId)?.classList.remove('edge-node-focused');
  nodeButtons.get(previous.childId)?.classList.remove('edge-node-focused');
  focusedEdge = null;
}
function focusEdge(path, parentId, childId, persist = false) {
  clearEdgeFocus();
  focusedEdge = { path, parentId, childId };
  path.classList.add('edge-focused');
  nodeButtons.get(parentId)?.classList.add('edge-node-focused');
  nodeButtons.get(childId)?.classList.add('edge-node-focused');
  if (persist) setNodeStatus(`العلاقة المحددة: ${nodeLabel(parentId)} ← ${nodeLabel(childId)}.`);
}
function drawEdges() {
  const svgNamespace = 'http://www.w3.org/2000/svg';
  const fragment = document.createDocumentFragment();
  for (let id = 2; id <= NODE_TOTAL; id += 1) {
    const parentId = getNodeParent(id);
    const parent = nodePositions.get(parentId);
    const child = nodePositions.get(id);
    if (!parent || !child) continue;
    const path = document.createElementNS(svgNamespace, 'path');
    const startY = parent.y + NODE_SIZE * .43;
    const endY = child.y - NODE_SIZE * .43;
    const curve = Math.max(18, Math.abs(endY - startY) * .38);
    path.setAttribute('class', 'network-connection');
    path.dataset.from = String(parentId);
    path.dataset.to = String(id);
    path.setAttribute('role', 'button');
    path.setAttribute('tabindex', '0');
    path.setAttribute('aria-label', `علاقة من ${nodeLabel(parentId)} إلى ${nodeLabel(id)}`);
    path.setAttribute('d', `M ${parent.x} ${startY} C ${parent.x} ${startY + curve}, ${child.x} ${endY - curve}, ${child.x} ${endY}`);
    path.addEventListener('pointerenter', () => focusEdge(path, parentId, id));
    path.addEventListener('pointerleave', () => { if (focusedEdge?.path === path) clearEdgeFocus(); });
    path.addEventListener('focus', () => focusEdge(path, parentId, id));
    path.addEventListener('blur', () => { if (focusedEdge?.path === path) clearEdgeFocus(); });
    path.addEventListener('click', () => focusEdge(path, parentId, id, true));
    path.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); focusEdge(path, parentId, id, true); } });
    fragment.appendChild(path);
  }
  lines.replaceChildren(fragment);
  focusedEdge = null;
  lines.setAttribute('viewBox', `0 0 ${mapWidth} ${mapHeight}`);
  lines.setAttribute('width', String(mapWidth));
  lines.setAttribute('height', String(mapHeight));
  lines.style.width = `${mapWidth}px`;
  lines.style.height = `${mapHeight}px`;
}

function applyZoom() {
  stage.style.width = `${mapWidth}px`;
  stage.style.height = `${mapHeight}px`;
  stage.style.transform = `scale(${zoom})`;
  stageWrap.style.width = `${mapWidth * zoom}px`;
  stageWrap.style.height = `${mapHeight * zoom}px`;
  $('#zoom-level').textContent = `${Math.round(zoom * 100)}%`;
}

function layoutNodes() {
  const viewportWidth = Math.max(280, Math.floor(nodeViewport.clientWidth - 8 || 720));
  mapWidth = viewportWidth;
  const columns = Math.max(3, Math.min(12, Math.floor((mapWidth - 16) / (NODE_SIZE + 14))));
  const cellWidth = mapWidth / columns;
  const storedPositions = readNodePositions();
  let cursor = 1;
  let top = 52;
  nodePositions.clear();
  NODE_LEVELS.forEach((count, level) => {
    const rows = Math.ceil(count / columns);
    const label = levelLabels[level];
    label.style.top = `${top - 30}px`;
    label.style.insetInlineStart = '12px';
    for (let position = 0; position < count; position += 1, cursor += 1) {
      const col = position % columns;
      const row = Math.floor(position / columns);
      const x = cellWidth * (col + .5);
      const y = top + row * ROW_GAP + 25;
      const saved = storedPositions[cursor];
      const position = saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)
        ? { x: Math.max(NODE_SIZE / 2, saved.x), y: Math.max(NODE_SIZE / 2, saved.y), level, row, col }
        : { x, y, level, row, col };
      nodePositions.set(cursor, position);
      const button = nodeButtons.get(cursor);
      button.style.left = `${x - NODE_SIZE / 2}px`;
      button.style.top = `${y - NODE_SIZE / 2}px`;
    }
    top += rows * ROW_GAP + LEVEL_GAP;
  });
  mapHeight = top + 24;
  fitMapToPositions();
  nodeNetwork.style.height = `${mapHeight}px`;
  drawEdges();
  applyZoom();
  applyNodeFilters();
}

function scheduleLayout() {
  if (scheduleLayout.frame) cancelAnimationFrame(scheduleLayout.frame);
  scheduleLayout.frame = requestAnimationFrame(layoutNodes);
}

function nodeContentType(data, id = null) {
  if (id !== null && nodeTypeCache.has(id)) return nodeTypeCache.get(id);
  let type = 'empty';
  if (data && isConfigured(data)) {
    if (data.html && !data.url) type = 'html';
    else if (data.url) {
      try {
        const link = parseNodeLink(data.url);
        type = link.kind !== 'web' ? 'app' : classifySoftwareUrl(link.url).kind;
      } catch { type = 'web'; }
    }
  }
  if (id !== null) nodeTypeCache.set(id, type);
  return type;
}
function applyNodeFilters() {
  const query = $('#node-search').value.trim().toLowerCase();
  const activeFilter = $('#node-filter').value;
  const softwareFilter = $('#software-filter').value;
  const levelFilter = $('#level-filter').value;
  let visible = 0;
  for (let id = 1; id <= NODE_TOTAL; id += 1) {
    const button = nodeButtons.get(id);
    const data = getHubData(id);
    const configured = isConfigured(data);
    const levelMatches = levelFilter === 'all' || button.dataset.level === levelFilter;
    const stateMatches = activeFilter === 'all' || (activeFilter === 'active' ? configured : !configured);
    const typeLabel = nodeContentType(data, id);
    const typeMatches = softwareFilter === 'all' || typeLabel === softwareFilter;
    const haystack = `${nodeLabel(id)} ${data?.url || ''} ${data?.html ? 'html' : ''} ${typeLabel}`.toLowerCase();
    const queryMatches = !query || haystack.includes(query);
    const show = levelMatches && stateMatches && typeMatches && queryMatches;
    button.hidden = !show;
    button.classList.toggle('is-highlighted', Boolean(query && queryMatches && show));
    if (show) visible += 1;
  }
  for (const path of lines.querySelectorAll('.network-connection')) {
    path.hidden = Boolean(nodeButtons.get(Number(path.dataset.from))?.hidden || nodeButtons.get(Number(path.dataset.to))?.hidden);
  }
  levelLabels.forEach((label, level) => {
    const anyVisible = [...nodeButtons.values()].some((button) => Number(button.dataset.level) === level && !button.hidden);
    label.hidden = !anyVisible;
  });
  $('#node-status').textContent = `يعرض ${visible} من ${NODE_TOTAL} عقدة · ${NODE_TOTAL - 1} علاقة في الشبكة.`;
  persistUiSettings();
}

function nodePath(id) {
  const path = [];
  let current = id;
  const seen = new Set();
  while (current !== null && !seen.has(current)) {
    seen.add(current);
    path.push(current);
    current = getNodeParent(current);
  }
  return path;
}

function highlightNodePath(id) {
  const path = new Set(nodePath(id));
  for (const button of nodeButtons.values()) button.classList.toggle('is-path', path.has(Number(button.dataset.id)));
  for (const edge of lines.querySelectorAll('.network-connection')) {
    edge.classList.toggle('path-active', path.has(Number(edge.dataset.from)) && path.has(Number(edge.dataset.to)));
  }
}

function animatePipeFlow(id) {
  const path = nodePath(id);
  path.forEach((nodeId, index) => {
    const button = nodeButtons.get(nodeId);
    if (button) {
      button.classList.add('is-flowing');
      window.setTimeout(() => button.classList.remove('is-flowing'), 1900 + index * 45);
    }
    if (index === 0) return;
    const childId = path[index - 1];
    const edge = lines.querySelector(`[data-from="${nodeId}"][data-to="${childId}"]`);
    if (edge) {
      edge.classList.add('flow-active');
      window.setTimeout(() => edge.classList.remove('flow-active'), 1900 + index * 45);
    }
  });
}

function setNodeStatus(message, good = true) {
  const status = $('#node-status');
  status.textContent = message;
  status.style.color = good ? 'var(--semver-muted)' : 'var(--semver-danger)';
}
function setHubStatus(message, good = true) {
  const status = $('#hub-status');
  status.textContent = message;
  status.style.color = good ? 'var(--semver-green)' : 'var(--semver-danger)';
}

function renderExtraction(payload) {
  const container = $('#hub-extraction');
  container.replaceChildren();
  if (!payload) {
    container.textContent = 'ستظهر هنا خلاصة النص والعنوان بعد بناء المعاينة.';
    return;
  }
  const title = document.createElement('strong');
  title.textContent = `العنوان: ${payload.title || 'بدون عنوان'}`;
  const detail = document.createElement('p');
  detail.textContent = `المصدر: ${payload.source || 'غير محدد'} · النوع: ${payload.contentType || payload.kind || 'HTML'} · العناصر: ${payload.elements || 0} · الروابط: ${payload.links || 0}`;
  detail.style.margin = '.35rem 0';
  const text = document.createElement('pre');
  text.textContent = payload.text || payload.error || 'لم يُعثر على نص قابل للاستخراج.';
  container.append(title, detail, text);
}

function classifySoftwareUrl(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return { kind: 'web', label: 'صفحة ويب' }; }
  const path = parsed.pathname.toLowerCase();
  const downloadExt = /\.(exe|msi|dmg|pkg|deb|rpm|appimage|apk|ipa|zip|tar|gz|7z|pdf|apk)(?:$|\?)/i;
  if (downloadExt.test(path)) return { kind: 'download', label: 'ملف برنامج قابل للتنزيل', host: parsed.hostname };
  if (/github\.com|gitlab\.com|npmjs\.com|pypi\.org|crates\.io|rubygems\.org|apps\.apple\.com|play\.google\.com|microsoft\.com/i.test(parsed.hostname)) {
    return { kind: 'software', label: 'صفحة برمجية أو متجر تطبيقات', host: parsed.hostname };
  }
  return { kind: 'web', label: 'تطبيق ويب أو صفحة خارجية', host: parsed.hostname };
}
function softwareDownloadPreview(link, info) {
  const safeUrl = link.url.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeHost = (info.host || link.host || 'مصدر خارجي').replace(/[&<>"']/g, '');
  return `<main style="box-sizing:border-box;min-height:100vh;padding:clamp(24px,6vw,72px);font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#e8f0ee;background:#071014;direction:rtl"><div style="max-width:720px;margin:auto;border:1px solid #315d57;border-radius:24px;padding:clamp(24px,5vw,48px);background:linear-gradient(145deg,#102127,#0b171b);box-shadow:0 20px 60px #0008"><div style="font-size:42px;color:#59e0a3">⌘</div><p style="color:#59e0a3;font-size:12px;font-weight:800;letter-spacing:.12em">SOFTWARE PREVIEW</p><h1 style="font-size:clamp(24px,5vw,42px);margin:.4em 0">${info.label}</h1><p style="color:#9cb0b2;line-height:1.8">هذا رابط ملف برمجي. يمكن عرض معلوماته داخل الموقع، لكن لا يمكن للمتصفح تشغيل ملف تنفيذي مباشرة لأسباب أمنية.</p><p style="color:#f4ce72;overflow-wrap:anywhere">المصدر: ${safeHost}</p><a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:16px;border-radius:12px;padding:12px 18px;color:#052117;background:#59e0a3;font-weight:800;text-decoration:none">فتح ملف البرنامج خارجيًا ↗</a></div></main>`;
}
function summarizeHtml(html, source = 'HTML محلي') {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,template').forEach((element) => element.remove());
  return {
    title: doc.title || doc.querySelector('h1')?.textContent?.trim() || 'بدون عنوان',
    text: (doc.body?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 1200),
    elements: doc.body?.querySelectorAll('*').length || 0,
    links: doc.body?.querySelectorAll('a[href]').length || 0,
    source,
    contentType: 'text/html'
  };
}

function fetchNodePayload(id) {
  const data = getHubData(id);
  if (!data) return null;
  if (data.url) {
    let link;
    try { link = parseNodeLink(data.url); }
    catch (error) {
      return { id, kind: 'invalid', url: String(data.url).slice(0, 8192), title: 'رابط غير صالح', text: error?.message || 'تعذر التحقق من الرابط.', source: 'فحص محلي', status: 'invalid', error: error?.message || 'رابط غير صالح.' };
    }
    if (link.kind !== 'web') {
      return { id, kind: link.kind, url: link.url, title: link.display, text: 'هذا رابط اتصال؛ لا يُجلب محتواه. استخدم الفتح الخارجي.', source: 'رابط خارجي', status: 'external-only' };
    }
    return {
      id,
      kind: 'web',
      url: link.url,
      title: link.host || link.display,
      text: 'رابط خارجي محفوظ محليًا. لم يُطلب محتواه من خادم.',
      previewable: false,
      source: 'بيانات الرابط فقط',
      status: 'external-only'
    };
  }
  if (data.html) {
    const summary = summarizeHtml(data.html);
    return { id, kind: 'html', url: '', ...summary, html: data.html, previewable: true, status: 'ok' };
  }
  return null;
}

function updateNodeStatsAndFilters(id) {
  refreshNode(id);
  updateStats();
  applyNodeFilters();
}

const hubModal = $('#hub-modal');
const hubDialog = $('#hub-dialog');
const hubUrl = $('#hub-url');
const hubHtml = $('#hub-html');
const hubPreview = $('#hub-preview');
const hubAddress = $('#hub-address');

function clearPreview() {
  hubPreview.removeAttribute('srcdoc');
  hubPreview.src = 'about:blank';
}

async function buildHub(silent = false) {
  const urlText = hubUrl.value.trim();
  const localHtml = hubHtml.value;
  try {
    if (urlText) {
      const link = parseNodeLink(urlText);
      if (link.kind !== 'web') {
        clearPreview();
        hubAddress.textContent = link.url;
        renderExtraction({ title: link.display, text: 'هذا الرابط يفتح في تطبيق خارجي ولا يمكن معاينته أو جلب محتواه داخل الشبكة.', source: 'فتح خارجي فقط', kind: link.kind });
        setHubStatus('الرابط صالح للفتح الخارجي، لكن المعاينة متاحة لصفحات HTTP/HTTPS فقط.');
        return;
      }
      const software = classifySoftwareUrl(link.url);
      hubAddress.textContent = `${software.label} · ${link.url}`;
      if (software.kind === 'download') {
        hubPreview.removeAttribute('src');
        hubPreview.srcdoc = softwareDownloadPreview(link, software);
        renderExtraction({ title: software.label, text: 'تم التعرف على ملف برمجي وعرض بطاقة آمنة داخل المعاينة. لا يتم تشغيل الملفات التنفيذية داخل المتصفح.', source: 'معاينة برمجية آمنة', kind: 'software' });
        setHubStatus('عُرضت معلومات البرنامج داخل الموقع. استخدم زر الفتح الخارجي لتنزيل الملف.');
        return;
      }
      hubPreview.removeAttribute('srcdoc');
      hubPreview.src = link.url;
      renderExtraction({ title: link.host || link.display, text: software.kind === 'software' ? 'هذه صفحة برمجية أو متجر تطبيقات وتُعرض داخل إطار المعاينة. قد يمنع الموقع الخارجي التضمين.' : 'جرت محاولة عرض الصفحة الخارجية داخل إطار معزول. قد تمنع بعض المواقع العرض داخل الإطارات؛ استخدم زر الفتح المباشر عند الحاجة.', source: software.label, kind: software.kind });
      setHubStatus(`جارية معاينة ${software.label} داخل الموقع. إذا رفض الموقع العرض، استخدم الفتح الخارجي.`);
      return;
    }
    if (localHtml.trim()) {
      if (localHtml.length > MAX_HTML_CHARS) throw new Error('حجم HTML أكبر من الحد المحلي البالغ 300 كيلوبايت.');
      hubAddress.textContent = `HTML محلي · ${nodeLabel(activeHub.id)}`;
      hubPreview.removeAttribute('src');
      hubPreview.srcdoc = localHtml;
      renderExtraction(summarizeHtml(localHtml));
      setHubStatus('عُرض HTML المحلي داخل إطار معزول.');
      return;
    }
    clearPreview();
    renderExtraction(null);
    throw new Error('أدخل رابطًا أو HTML محليًا أولًا.');
  } catch (error) {
    clearPreview();
    setHubStatus(error?.message || 'تعذر بناء المعاينة. جرّب فتح الرابط خارجيًا.', false);
    if (!silent) renderExtraction({ title: 'تعذر بناء المعاينة', text: error?.message || 'خطأ غير معروف', source: 'خدمة المعاينة' });
  }
}

function openHubNode(id, button) {
  focusReturn = button;
  activeHub = { id, node: button };
  highlightNodePath(id);
  $('#hub-node-number').textContent = `#${String(id).padStart(3, '0')}`;
  const data = getHubData(id);
  hubUrl.value = data?.url || '';
  hubHtml.value = data?.html || '';
  hubDialog.classList.remove('is-minimized', 'is-fullscreen');
  $('#hub-minimize').textContent = 'تصغير';
  hubModal.hidden = false;
  renderExtraction(data?.extracted || null);
  if (data?.url || data?.html) buildHub(true);
  else setHubStatus('الجلسة محلية؛ لم تُحفظ إعدادات لهذه العقدة بعد.');
  hubUrl.focus();
}

function closeHub() {
  hubModal.hidden = true;
  hubDialog.classList.remove('is-minimized', 'is-fullscreen');
  clearPreview();
  if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  if (focusReturn?.isConnected) focusReturn.focus();
}

function saveHub() {
  let link = null;
  const rawUrl = hubUrl.value.trim();
  const html = hubHtml.value;
  try {
    if (rawUrl) link = parseNodeLink(rawUrl);
    if (html.length > MAX_HTML_CHARS) throw new Error('حجم HTML أكبر من الحد المحلي البالغ 300 كيلوبايت.');
    if (!rawUrl && !html.trim()) {
      clearHub();
      return;
    }
    const data = { url: link?.url || '', kind: link?.kind || (html ? 'html' : ''), html, active: true, savedAt: new Date().toISOString() };
    const storageKey = `${LINK_KEY}-${activeHub.id}`;
    const serialized = JSON.stringify(data);
    if (semverStorageChars(storageKey) + storageKey.length + serialized.length > MAX_STORAGE_CHARS) throw new Error('وصلت بيانات مختبر العقد إلى سقف التخزين المحلي (نحو 650 كيلوبايت). امسح بعض العقد أو صغّر HTML.');
    if (!writeJson(storageKey, data)) throw new Error('تعذر الحفظ في هذا المتصفح؛ قد تكون مساحة التخزين ممتلئة.');
    const index = readJson(LINK_KEY, {});
    index[activeHub.id] = data.url || `#node-${String(activeHub.id).padStart(3, '0')}`;
    if (!writeJson(LINK_KEY, index)) throw new Error('تعذر تحديث فهرس الروابط المحلي.');
    updateNodeStatsAndFilters(activeHub.id);
    setHubStatus('حُفظت إعدادات العقدة في هذا المتصفح فقط.');
    buildHub(true);
  } catch (error) {
    setHubStatus(error?.message || 'تعذر حفظ إعدادات العقدة.', false);
  }
}

function clearHub() {
  try {
    localStorage.removeItem(`${LINK_KEY}-${activeHub.id}`);
    const index = readJson(LINK_KEY, {});
    delete index[activeHub.id];
    writeJson(LINK_KEY, index);
    localStorage.removeItem(`semver-ai-analysis-${activeHub.id}`);
    const central = readJson('semver-hub-stem-data', {});
    delete central[activeHub.id];
    writeJson('semver-hub-stem-data', central);
    updateNodeStatsAndFilters(activeHub.id);
    hubUrl.value = '';
    hubHtml.value = '';
    clearPreview();
    renderExtraction(null);
    setHubStatus('مُسحت إعدادات العقدة من هذا المتصفح.');
  } catch {
    setHubStatus('تعذر مسح الإعدادات المحلية.', false);
  }
}

async function transferNodeData() {
  const button = $('#hub-fetch');
  button.disabled = true;
  button.textContent = 'جارٍ حفظ الملخص…';
  try {
    const payload = await fetchNodePayload(activeHub.id);
    if (!payload) throw new Error('لا توجد بيانات قابلة للسحب في هذه العقدة.');
    if (payload.error) throw new Error(payload.error);
    const summary = { ...payload };
    delete summary.html;
    const central = readJson('semver-hub-stem-data', {});
    central[activeHub.id] = { ...summary, receivedAt: new Date().toISOString() };
    const centralKey = 'semver-hub-stem-data';
    const serializedCentral = JSON.stringify(central);
    if (semverStorageChars(centralKey) + centralKey.length + serializedCentral.length > MAX_STORAGE_CHARS) throw new Error('وصلت بيانات مختبر العقد إلى سقف التخزين المحلي. امسح بعض العقد قبل حفظ ملخص آخر.');
    if (!writeJson(centralKey, central)) throw new Error('تعذر حفظ ملخص البيانات محليًا.');
    renderExtraction(summary);
    animatePipeFlow(activeHub.id);
    const pathLabel = `عبر ${nodePath(activeHub.id).length - 1} علاقة حتى العقدة الجذرية #001`;
    setHubStatus(payload.status === 'external-only'
      ? `حُفظ سجل الرابط فقط محليًا (${pathLabel})؛ لم يتم جلب محتوى الموقع الخارجي.`
      : `حُفظ ملخص HTML المحلي (${pathLabel}).`);
  } catch (error) {
    setHubStatus(error?.message || 'تعذر سحب البيانات.', false);
  } finally {
    button.disabled = false;
    button.textContent = 'حفظ الملخص في مسار العقد';
  }
}

function openExternally() {
  const raw = hubUrl.value.trim() || getHubData(activeHub.id)?.url || '';
  try {
    const link = parseNodeLink(raw);
    // الروابط العامة تُفتح في تبويب مستقل حتى تبقى شبكة العقد والتحليل مفتوحين.
    // روابط التطبيقات والبريد والهاتف تُسلّم للنظام مباشرة على الهاتف.
    if (link.kind === 'web') {
      const opened = window.open(link.url, '_blank', 'noopener,noreferrer');
      if (!opened) window.location.assign(link.url);
    } else {
      window.location.assign(link.url);
    }
    setHubStatus('فُتح الرابط الخارجي. يمكنك العودة إلى شبكة العقد في التبويب الحالي.');
  } catch (error) {
    setHubStatus(error?.message || 'أدخل رابطًا صالحًا للفتح الخارجي.', false);
  }
}

function stopHub() {
  clearPreview();
  setHubStatus('أُوقفت المعاينة؛ الإعدادات المحفوظة لم تتغير.');
}

function activeItems() {
  const items = [];
  for (let id = 1; id <= NODE_TOTAL; id += 1) {
    const data = getHubData(id);
    if (isConfigured(data)) items.push({ id, ...data });
  }
  return items;
}

function appendReportText(parent, tag, text, className = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = String(text ?? '');
  parent.appendChild(element);
  return element;
}

function openReportInside(id) {
  const button = nodeButtons.get(Number(id));
  if (button) {
    openHubNode(Number(id), button);
    setHubStatus('تُعرض هذه الصفحة داخل الموقع. قد تمنع بعض المواقع التضمين، لكنك لن تغادر الصفحة تلقائيًا.');
    return;
  }
  setHubStatus('تعذر العثور على العقدة المطلوبة.', false);
}
function renderInfoChat(results) {
  const log = $('#info-chat-log');
  if (!log) return;
  log.replaceChildren();
  const intro = document.createElement('div');
  intro.className = 'info-chat-message info-chat-system';
  intro.textContent = `تم ضخ ${results.length} ملخصًا إلى نفق المعلومات من أصل ${NODE_TOTAL} عقدة.`;
  log.appendChild(intro);
  results.forEach((item) => {
    const message = document.createElement('article');
    message.className = 'info-chat-message';
    const title = document.createElement('strong');
    title.textContent = `${nodeLabel(item.id)} · ${item.title || item.url || 'معلومة عقدة'}`;
    const detail = document.createElement('p');
    detail.textContent = item.error || (item.status === 'external-only' ? 'رابط خارجي جاهز للعرض داخل الموقع.' : item.text || 'اكتمل التحليل المحلي.');
    const actions = document.createElement('div');
    actions.className = 'info-chat-actions';
    const preview = document.createElement('button');
    preview.type = 'button';
    preview.className = 'info-chat-preview';
    preview.textContent = '◉ عرض الرابط داخل الموقع';
    preview.addEventListener('click', () => openReportInside(item.id));
    actions.appendChild(preview);
    message.append(title, detail, actions);
    log.appendChild(message);
  });
  log.scrollTop = log.scrollHeight;
}
function renderReport(results) {
  renderInfoChat(results);
  const output = $('#network-report');
  output.replaceChildren();
  const successCount = results.filter((item) => !item.error && item.status !== 'external-only').length;
  const externalOnly = results.filter((item) => item.status === 'external-only').length;
  const errorCount = results.filter((item) => item.error).length;
  const summary = document.createElement('div');
  summary.className = 'report-summary';
  [[NODE_TOTAL, 'إجمالي العقد'], [results.length, 'عقد مهيأة'], [successCount, 'مصادر مقروءة'], [externalOnly + errorCount, 'روابط خارجية أو متعذرة']].forEach(([value, label]) => {
    const metric = document.createElement('div');
    metric.className = 'report-metric';
    appendReportText(metric, 'strong', value);
    appendReportText(metric, 'span', label);
    summary.appendChild(metric);
  });
  output.appendChild(summary);
  const cards = document.createElement('div');
  cards.className = 'report-grid';
  results.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'report-card';
    const status = item.error
      ? 'تعذر إعداد الملخص المحلي'
      : item.status === 'external-only'
        ? (item.kind === 'web' ? 'رابط ويب — بيانات الرابط فقط' : 'رابط اتصال — فتح خارجي فقط')
        : 'اكتمل الملخص المحلي';
    appendReportText(card, 'strong', `${nodeLabel(item.id)} · ${status}`);
    appendReportText(card, 'small', `${item.source || ''} · ${item.url || item.kind || 'HTML محلي'}`);
    if (item.title) appendReportText(card, 'small', item.title);
    if (item.contentType) appendReportText(card, 'small', `نوع المحتوى: ${item.contentType}`);
    appendReportText(card, 'p', item.error || item.text || 'لا يوجد نص قابل للعرض.');
    if (item.url) {
      const previewButton = document.createElement('button');
      previewButton.type = 'button';
      previewButton.className = 'report-preview-button';
      previewButton.textContent = '◉ عرض الرابط داخل الموقع';
      previewButton.addEventListener('click', () => openReportInside(item.id));
      card.appendChild(previewButton);
    }
    cards.appendChild(card);
  });
  output.appendChild(cards);
}

async function collectReport() {
  const status = $('#report-status');
  const button = $('#collect-report');
  const exportButton = $('#export-report');
  const active = activeItems();
  if (!active.length) {
    status.textContent = 'لا توجد عقد مهيأة بعد. افتح أي عقدة وأضف رابطًا أو HTML.';
    $('#network-report').replaceChildren();
    exportButton.disabled = true;
    return;
  }
  button.disabled = true;
  exportButton.disabled = true;
  status.textContent = `جارٍ إعداد ملخص محلي لـ ${active.length} عقدة…`;
  const results = await mapConcurrent(active, 4, async (item) => {
    try { return await fetchNodePayload(item.id) || { id: item.id, error: 'لا توجد بيانات.' }; }
    catch (error) { return { id: item.id, url: item.url || '', error: error?.message || 'تعذر إعداد الملخص المحلي.', source: 'فحص محلي' }; }
  }, (completed, total) => {
    status.textContent = `إعداد الملخص المحلي: ${completed} من ${total} عقدة…`;
  });
  latestReport = {
    generatedAt: new Date().toISOString(),
    totalNodes: NODE_TOTAL,
    activeNodes: results.length,
    maxConcurrency: 4,
    results: results.map((item) => {
      const { html, ...summary } = item || {};
      return summary;
    })
  };
  renderReport(latestReport.results);
  status.textContent = `اكتمل التقرير · ${new Date().toLocaleString('ar')}`;
  exportButton.disabled = !latestReport.results.length;
  button.disabled = false;
}

function configuredNodeData() {
  const nodes = {};
  for (let id = 1; id <= NODE_TOTAL; id += 1) {
    const data = getHubData(id);
    if (isConfigured(data)) nodes[id] = { url: data.url || '', html: data.html || '', kind: data.kind || '', active: true };
  }
  return nodes;
}
function exportNodes() {
  const payload = { format: 'slaks-semver-node-data', version: 1, exportedAt: new Date().toISOString(), totalNodes: NODE_TOTAL, nodes: configuredNodeData() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'semver-node-data.json';
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  setNodeStatus(`تم تصدير ${Object.keys(payload.nodes).length} عقدة إلى ملف JSON.`);
}
function importNodes(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(String(reader.result || ''));
      if (!payload || payload.format !== 'slaks-semver-node-data' || !payload.nodes || typeof payload.nodes !== 'object') throw new Error('ملف JSON ليس ملف عقد صالحًا.');
      const imported = [];
      for (const [rawId, rawData] of Object.entries(payload.nodes)) {
        const id = Number(rawId);
        if (!Number.isInteger(id) || id < 1 || id > NODE_TOTAL || !rawData || typeof rawData !== 'object') continue;
        const rawUrl = String(rawData.url || '').trim();
        const html = String(rawData.html || '');
        let link = null;
        if (rawUrl) link = parseNodeLink(rawUrl);
        if (html.length > MAX_HTML_CHARS) throw new Error(`HTML العقدة ${id} يتجاوز الحد المسموح.`);
        if (!rawUrl && !html.trim()) continue;
        const data = { url: link?.url || '', kind: link?.kind || (html ? 'html' : ''), html, active: true, savedAt: new Date().toISOString() };
        const storageKey = `${LINK_KEY}-${id}`;
        if (semverStorageChars(storageKey) + storageKey.length + JSON.stringify(data).length > MAX_STORAGE_CHARS) throw new Error('تجاوزت بيانات العقد سقف التخزين المحلي.');
        if (!writeJson(storageKey, data)) throw new Error('تعذر حفظ بيانات العقد في المتصفح.');
        imported.push(id);
      }
      const index = readJson(LINK_KEY, {});
      imported.forEach((id) => { const data = getHubData(id); index[id] = data?.url || `#node-${String(id).padStart(3, '0')}`; });
      if (!writeJson(LINK_KEY, index)) throw new Error('تعذر تحديث فهرس العقد.');
      nodeButtons.forEach((_, id) => refreshNode(id));
      updateStats();
      applyNodeFilters();
      setNodeStatus(`تم استيراد ${imported.length} عقدة بنجاح.`);
    } catch (error) { setNodeStatus(error?.message || 'تعذر استيراد ملف JSON.', false); }
  };
  reader.onerror = () => setNodeStatus('تعذر قراءة ملف JSON.', false);
  reader.readAsText(file);
}
function exportReport() {
  if (!latestReport) return;
  const blob = new Blob([JSON.stringify(latestReport, null, 2)], { type: 'application/json' });
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = 'semver-hub-report.json';
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
}

function scheduleNodeFilters() {
  if (filterFrame) cancelAnimationFrame(filterFrame);
  filterFrame = requestAnimationFrame(() => { filterFrame = 0; applyNodeFilters(); });
}
function initializeNetwork() {
  restoreUiSettings();
  createNodeElements();
  layoutNodes();
  const observer = new ResizeObserver(scheduleLayout);
  observer.observe(nodeViewport);
  $('#node-search').addEventListener('input', () => {
    $('#node-search-clear').hidden = !$('#node-search').value;
    scheduleNodeFilters();
  });
  $('#node-search-clear').addEventListener('click', () => {
    $('#node-search').value = '';
    $('#node-search-clear').hidden = true;
    scheduleNodeFilters();
    $('#node-search').focus();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && !/input|textarea|select/i.test(document.activeElement?.tagName || '')) {
      event.preventDefault();
      $('#node-search').focus();
    }
  });
  $('#node-filter').addEventListener('change', applyNodeFilters);
  $('#software-filter').addEventListener('change', applyNodeFilters);
  $('#level-filter').addEventListener('change', applyNodeFilters);
  $('#map-zoom-in').addEventListener('click', () => { zoom = Math.min(1.5, Math.round((zoom + .1) * 10) / 10); applyZoom(); persistUiSettings(); });
  $('#map-zoom-out').addEventListener('click', () => { zoom = Math.max(.6, Math.round((zoom - .1) * 10) / 10); applyZoom(); persistUiSettings(); });
  $('#map-reset').addEventListener('click', () => { zoom = 1; applyZoom(); persistUiSettings(); nodeViewport.scrollTo({ top: 0, left: 0, behavior: 'smooth' }); });
  $('#map-root').addEventListener('click', () => {
    const root = nodeButtons.get(1);
    if (!root) return;
    $('#node-search').value = '';
    $('#node-filter').value = 'all';
    $('#software-filter').value = 'all';
    $('#level-filter').value = 'all';
    applyNodeFilters();
    nodeViewport.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    root.focus({ preventScroll: true });
  });
  $('#export-nodes').addEventListener('click', exportNodes);
  $('#import-nodes').addEventListener('click', () => $('#node-import-file').click());
  $('#node-import-file').addEventListener('change', (event) => {
    importNodes(event.target.files?.[0]);
    event.target.value = '';
  });
}

function setupHubModal() {
  $('#hub-close').addEventListener('click', closeHub);
  $('#hub-build').addEventListener('click', () => buildHub());
  $('#hub-save').addEventListener('click', saveHub);
  let autoSaveTimer = 0;
  hubUrl.addEventListener('input', () => {
    window.clearTimeout(autoSaveTimer);
    autoSaveTimer = window.setTimeout(() => {
      const value = hubUrl.value.trim();
      if (!value) return;
      try {
        parseNodeLink(value);
        saveHub();
        setHubStatus('حُفظ الرابط تلقائيًا في استضافة العقدة وعُرض داخل الموقع.');
      } catch {
        setHubStatus('اكتب رابطًا صالحًا لإضافته تلقائيًا إلى الاستضافة.', false);
      }
    }, 650);
  });
  $('#hub-fetch').addEventListener('click', transferNodeData);
  $('#hub-open').addEventListener('click', openExternally);
  $('#hub-stop').addEventListener('click', stopHub);
  $('#hub-clear').addEventListener('click', clearHub);
  hubModal.addEventListener('click', (event) => { if (event.target === hubModal) closeHub(); });
  const minimizeButton = $('#hub-minimize');
  $('.hub-dialog-head').appendChild(minimizeButton);
  minimizeButton.addEventListener('click', () => {
    const minimized = hubDialog.classList.toggle('is-minimized');
    minimizeButton.textContent = minimized ? 'استعادة' : 'تصغير';
  });
  $('#hub-fullscreen').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (hubDialog.requestFullscreen) await hubDialog.requestFullscreen();
      else hubDialog.classList.toggle('is-fullscreen');
    } catch {
      hubDialog.classList.toggle('is-fullscreen');
    }
    $('#hub-fullscreen').textContent = hubDialog.classList.contains('is-fullscreen') || document.fullscreenElement ? 'إنهاء ملء الشاشة' : 'ملء الشاشة';
  });
  document.addEventListener('fullscreenchange', () => {
    $('#hub-fullscreen').textContent = document.fullscreenElement ? 'إنهاء ملء الشاشة' : 'ملء الشاشة';
  });
  document.addEventListener('keydown', (event) => {
    if (hubModal.hidden) return;
    if (event.key === 'Escape') closeHub();
    if (event.key === 'Tab') {
      const focusable = [...hubDialog.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href]')].filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
    }
  });
}

const strictSemver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
function validateVersion() {
  const value = $('#version-input').value.trim();
  const valid = strictSemver.test(value);
  const result = $('#version-result');
  result.className = `version-result ${valid ? 'valid' : 'invalid'}`;
  result.textContent = valid ? `✓ إصدار صالح: ${value}` : '✕ صيغة غير صالحة. استخدم major.minor.patch، مثل 1.2.3 أو 1.2.3-beta.1.';
}

function setupValidator() {
  $('#validate-version').addEventListener('click', validateVersion);
  $('#version-input').addEventListener('keydown', (event) => { if (event.key === 'Enter') validateVersion(); });
  document.querySelectorAll('[data-example]').forEach((button) => button.addEventListener('click', () => {
    $('#version-input').value = button.dataset.example;
    validateVersion();
  }));
  validateVersion();
}

function setupExternalLinkModal() {
  const modal = $('#external-link-modal');
  const frame = $('#external-link-frame');
  const title = $('#external-link-title');
  const address = $('#external-link-address');
  const open = $('#external-link-open');
  const close = () => { modal.hidden = true; frame.removeAttribute('src'); };
  const show = (url) => {
    try {
      const link = parseNodeLink(url);
      if (link.kind !== 'web') return false;
      title.textContent = link.host || 'رابط خارجي';
      address.textContent = link.url;
      open.href = link.url;
      frame.src = link.url;
      modal.hidden = false;
      return true;
    } catch { return false; }
  };
  $('#external-link-close').addEventListener('click', close);
  modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
  document.addEventListener('keydown', (event) => { if (!modal.hidden && event.key === 'Escape') close(); });
  document.addEventListener('click', (event) => {
    const anchor = event.target.closest('a[href]');
    if (!anchor || modal.contains(anchor) || anchor.dataset.noInternalPreview !== undefined) return;
    let url;
    try { url = new URL(anchor.href, window.location.href); } catch { return; }
    if (!['http:', 'https:'].includes(url.protocol) || url.origin === window.location.origin) return;
    if (show(url.href)) event.preventDefault();
  });
}
function setupMobileNavigation() {
  const toggle = $('#menu-toggle');
  const nav = $('#site-nav');
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'إغلاق قائمة التنقل' : 'فتح قائمة التنقل');
    nav.classList.toggle('is-open', open);
  });
  nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    toggle.setAttribute('aria-expanded', 'false');
    nav.classList.remove('is-open');
  }));
}

function setupOrbit() {
  const canvas = $('#orbit-canvas');
  const context = canvas.getContext('2d');
  const toggle = $('#orbit-toggle');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let playing = !reducedMotion;
  let visible = false;
  let frame = 0;
  let startTime = performance.now();
  let pixelRatio = 1;

  function draw(timestamp = performance.now()) {
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    if (!width || !height) return;
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const targetWidth = Math.round(width * pixelRatio);
    const targetHeight = Math.round(height * pixelRatio);
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    const origin = { x: width / 2, y: height / 2 };
    const scale = Math.min(width, height) * .39;
    const radius = 1.2;
    context.lineWidth = 1;
    context.strokeStyle = 'rgba(156,176,178,.15)';
    for (let x = origin.x % 28; x < width; x += 28) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke(); }
    for (let y = origin.y % 28; y < height; y += 28) { context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke(); }
    context.strokeStyle = 'rgba(220,236,231,.55)';
    context.lineWidth = 1.2;
    context.beginPath(); context.moveTo(18, origin.y); context.lineTo(width - 18, origin.y); context.moveTo(origin.x, 18); context.lineTo(origin.x, height - 18); context.stroke();
    context.fillStyle = '#9cb0b2';
    context.font = '12px system-ui, sans-serif';
    context.textAlign = 'right';
    context.fillText('Re(t)', width - 17, origin.y - 9);
    context.textAlign = 'left';
    context.fillText('Im(t)', origin.x + 8, 20);
    context.save();
    context.setLineDash([6, 6]);
    context.strokeStyle = '#ff6670';
    context.lineWidth = 2;
    context.beginPath(); context.moveTo(18, origin.y); context.lineTo(origin.x, origin.y); context.stroke();
    context.restore();
    const cycle = ((timestamp - startTime) % 6250) / 6250;
    const theta = playing ? cycle * Math.PI * 2 : 0;
    context.beginPath();
    context.strokeStyle = 'rgba(89,224,163,.2)';
    context.lineWidth = 1;
    context.arc(origin.x, origin.y, radius * scale, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.strokeStyle = '#60b8ff';
    context.lineWidth = 2.7;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(origin.x + radius * scale, origin.y);
    context.arc(origin.x, origin.y, radius * scale, 0, -theta, true);
    context.stroke();
    const point = { x: origin.x + radius * scale * Math.cos(theta), y: origin.y - radius * scale * Math.sin(theta) };
    context.beginPath(); context.fillStyle = '#60b8ff'; context.shadowColor = '#60b8ff'; context.shadowBlur = 14; context.arc(point.x, point.y, 5, 0, Math.PI * 2); context.fill(); context.shadowBlur = 0;
    context.beginPath(); context.fillStyle = '#f4ce72'; context.arc(origin.x, origin.y, 4, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#f4ce72'; context.textAlign = 'left'; context.font = '11px system-ui, sans-serif'; context.fillText('نقطة التفرد', origin.x + 9, origin.y + 16);
    context.fillStyle = '#ff9090'; context.fillText('القطع الفرعي', 22, origin.y - 10);
  }

  function stopFrame() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }
  function tick(time) {
    frame = 0;
    draw(time);
    if (playing && visible && !document.hidden) frame = requestAnimationFrame(tick);
  }
  function sync() {
    toggle.textContent = playing ? 'إيقاف الحركة' : 'تشغيل الحركة';
    toggle.setAttribute('aria-pressed', String(playing));
    if (playing && visible && !document.hidden && !frame) frame = requestAnimationFrame(tick);
    if (!playing) { stopFrame(); draw(); }
  }
  const observer = new IntersectionObserver((entries) => {
    visible = entries[0]?.isIntersecting || false;
    if (visible) sync(); else stopFrame();
  }, { threshold: .05 });
  observer.observe(canvas);
  toggle.addEventListener('click', () => {
    playing = !playing;
    if (playing) startTime = performance.now();
    sync();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopFrame(); else sync(); });
  new ResizeObserver(() => draw()).observe(canvas);
  draw();
  sync();
}

function setupActions() {
  $('#collect-report').addEventListener('click', collectReport);
  $('#export-report').addEventListener('click', exportReport);
  setupHubModal();
  setupValidator();
  setupMobileNavigation();
  setupExternalLinkModal();
  setupOrbit();
  // تشغيل نفق المعلومات تلقائيًا عند وجود عقد مهيأة، دون طلب إضافي من المستخدم.
  window.setTimeout(() => collectReport(), 250);
}

initializeNetwork();
setupActions();
