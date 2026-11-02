import { NODE_LEVELS, NODE_TOTAL, getNodeParent, mapConcurrent, parseNodeLink } from './graph-model.mjs';
import { QURAN_STATISTICS, QURAN_SURAH_METRICS, quranMetricForNode } from './quran-node-metrics.mjs';

const $ = (selector) => document.querySelector(selector);
const LINK_KEY = 'semver-bnf-node-links';
const UI_SETTINGS_KEY = 'semver-bnf-ui-settings';
const VIEW_STATE_VERSION = 7;
const POSITIONS_KEY = 'semver-bnf-node-positions-grid-v5-8cm';
const RELATION_STYLE_KEY = 'semver-bnf-relation-styles';
const REPORT_CACHE_KEY = 'semver-bnf-report-cache';
const REPORT_CACHE_TTL = 10 * 60 * 1000;
const LINK_CACHE_DB = 'slaks-link-cache-db';
const LINK_CACHE_STORE = 'payloads';
const pendingLinkLoads = new Map();
const BUILTIN_NODES = Object.freeze({
  600: {
    url: 'https://elazzouz-dotcom.github.io/satellite/',
    html: '',
    active: true,
    builtIn: true,
    label: 'VSAT Gateway'
  }
});
const NODE_SIZE = 60;
const NODE_SPACING_CM = 8;
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
const networkCanvas = $('#network-canvas');
const canvasContext = networkCanvas.getContext('2d');
let canvasPointer = null;
const nodeButtons = new Map();
const nodeCentrality = new Map();
const nodeTypeCache = new Map();
let filterFrame = 0;
let filterDebounceTimer = 0;
const FILTER_DEBOUNCE_MS = 100;
const nodeFilterWorker = typeof Worker === 'function'
  ? new Worker(new URL('./node-filter-worker.js', import.meta.url), { type: 'module' })
  : null;
let nodeFilterWorkerReady = false;
let nodeFilterRequestId = 0;
let latestNodeFilterRequestId = 0;
let nodeFilterIndexVersion = 0;
let visibleNodeUpdateFrame = 0;
let visibleNodeUpdateToken = 0;
const levelLabels = [];
const nodePositions = new Map();
const visibleNodeIds = new Set();
const visibleEdgeIds = new Set();
let edgeVisibilityFrame = 0;
let edgeVisibilityToken = 0;
let mapWidth = 0;
let mapHeight = 0;
let zoom = 1;
let latestReport = null;
let activeHub = { id: null, node: null };
let focusReturn = null;
const nodeChatRoomRecords = new Map();
let nodeChatRoomSelected = null;
let draggedNode = null;
let suppressNodeClick = false;
let focusedEdge = null;
let pipeFlowEnabled = true;
let pipeFlowFrame = 0;
let pipeFlowStartedAt = performance.now();

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
    levelFilter: $('#level-filter')?.value || 'all',
    searchMode: $('#node-search-mode')?.value || 'all',
    sort: $('#node-sort')?.value || 'id',
    resultLimit: $('#node-result-limit')?.value || '16'
  });
}
function restoreUiSettings() {
  const settings = readJson(UI_SETTINGS_KEY, {});
  const showAll = settings.viewVersion !== VIEW_STATE_VERSION;
  if (Number.isFinite(settings.zoom)) zoom = Math.min(1.5, Math.max(.05, Number(settings.zoom)));
  if ($('#node-search')) {
    $('#node-search').value = showAll ? '' : String(settings.query || '');
    if ($('#node-search-clear')) $('#node-search-clear').hidden = !$('#node-search').value;
  }
  if ($('#node-filter')) $('#node-filter').value = showAll ? 'all' : (['all', 'active', 'empty'].includes(settings.nodeFilter) ? settings.nodeFilter : 'all');
  if ($('#software-filter')) $('#software-filter').value = showAll ? 'all' : (['all', 'software', 'download', 'web', 'app', 'matrix', 'html'].includes(settings.softwareFilter) ? settings.softwareFilter : 'all');
  if ($('#level-filter')) $('#level-filter').value = showAll ? 'all' : ((settings.levelFilter === 'all' || /^\d+$/.test(String(settings.levelFilter)) && Number(settings.levelFilter) < NODE_LEVELS.length) ? String(settings.levelFilter) : 'all');
  if ($('#node-search-mode')) $('#node-search-mode').value = showAll ? 'all' : (['all', 'any'].includes(settings.searchMode) ? settings.searchMode : 'all');
  if ($('#node-sort')) $('#node-sort').value = showAll ? 'id' : (['id', 'level', 'active'].includes(settings.sort) ? settings.sort : 'id');
  if ($('#node-result-limit')) $('#node-result-limit').value = showAll ? '16' : (['8', '16', '32'].includes(String(settings.resultLimit)) ? String(settings.resultLimit) : '16');
  if (showAll) writeJson(UI_SETTINGS_KEY, { ...settings, viewVersion: VIEW_STATE_VERSION, query: '', nodeFilter: 'all', softwareFilter: 'all', levelFilter: 'all', searchMode: 'all', sort: 'id', resultLimit: '16' });
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

function calculateNodeCentrality() {
  const children = Array.from({ length: NODE_TOTAL + 1 }, () => []);
  const parents = new Int32Array(NODE_TOTAL + 1);
  for (let id = 2; id <= NODE_TOTAL; id += 1) {
    const parent = getNodeParent(id);
    parents[id] = parent;
    children[parent].push(id);
  }
  const subtree = new Int32Array(NODE_TOTAL + 1);
  subtree.fill(1);
  for (let id = NODE_TOTAL; id > 1; id -= 1) subtree[parents[id]] += subtree[id];
  const normalization = ((NODE_TOTAL - 1) * (NODE_TOTAL - 2)) / 2;
  for (let id = 1; id <= NODE_TOTAL; id += 1) {
    const components = children[id].map((child) => subtree[child]);
    if (parents[id]) components.push(NODE_TOTAL - subtree[id]);
    const pairCount = (NODE_TOTAL ** 2 - components.reduce((sum, size) => sum + size ** 2, 0)) / 2;
    nodeCentrality.set(id, {
      degree: children[id].length + (parents[id] ? 1 : 0),
      betweenness: normalization ? pairCount / normalization : 0,
      subtreeSize: subtree[id]
    });
  }
}

function centralityLabel(id, metric) {
  const metrics = nodeCentrality.get(id) || { degree: 0, betweenness: 0 };
  const value = metric === 'degree' ? String(metrics.degree) : metrics.betweenness.toFixed(4);
  return `${nodeLabel(id)} · ${metric === 'degree' ? 'الدرجة' : 'الوساطة'} ${value}`;
}

function renderNodeCentrality() {
  const entries = [...nodeCentrality.entries()];
  [['#centrality-degree-list', 'degree'], ['#centrality-betweenness-list', 'betweenness']].forEach(([selector, metric]) => {
    const list = $(selector);
    if (!list) return;
    list.replaceChildren();
    entries.sort((a, b) => b[1][metric] - a[1][metric] || a[0] - b[0]).slice(0, 8).forEach(([id]) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${centralityLabel(id, metric)} · المستوى ${(nodeButtons.get(id)?.dataset.level ? Number(nodeButtons.get(id).dataset.level) + 1 : 0)}`;
      button.addEventListener('click', () => {
        const node = nodeButtons.get(id);
        const position = nodePositions.get(id);
        if (!node || !position) return;
        nodeButtons.forEach((candidate) => candidate.classList.remove('centrality-focus'));
        node.classList.add('centrality-focus');
        nodeViewport.scrollTo({ left: Math.max(0, position.x * zoom - nodeViewport.clientWidth / 2), top: Math.max(0, position.y * zoom - nodeViewport.clientHeight / 2), behavior: 'smooth' });
        setNodeStatus(`تم تحديد ${centralityLabel(id, metric)}؛ حجم الفرع ${nodeCentrality.get(id).subtreeSize} عقدة.`);
      });
      item.appendChild(button);
      list.appendChild(item);
    });
  });
}

function refreshNode(id) {
  nodeTypeCache.delete(id);
  const button = nodeButtons.get(id);
  if (!button) return;
  const data = getHubData(id);
  const configured = isConfigured(data);
  button.dataset.active = String(configured);
  button.dataset.linkUrl = data?.url || '';
  button.dataset.linkKind = data?.kind || (data?.html ? 'html' : '');
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
function updateNodeChatRoomRecord(id) {
  const data = getHubData(id);
  const type = nodeContentType(data, id);
  const quran = quranMetricForNode(id);
  const level = NODE_LEVELS.findIndex((count, levelIndex) => { const start = NODE_LEVELS.slice(0, levelIndex).reduce((sum, value) => sum + value, 0) + 1; return id >= start && id < start + count; }) + 1;
  nodeChatRoomRecords.set(id, { id, type, level, configured: isConfigured(data), url: data?.url || '', html: data?.html || '', parent: id > 1 ? getNodeParent(id) : null, quran });
}
function renderNodeChatRoom() {
  const log = $('#node-chat-room-log');
  if (!log) return;
  const query = ($('#node-chat-room-search')?.value || '').trim().toLowerCase();
  const records = [...nodeChatRoomRecords.values()].filter((record) => !query || `${nodeLabel(record.id)} ${record.url} ${record.type} ${record.html ? 'html' : ''}`.toLowerCase().includes(query));
  const visible = records.slice(0, 160);
  log.replaceChildren();
  visible.forEach((record) => {
    const message = document.createElement('article');
    message.className = `node-chat-message ${record.id === nodeChatRoomSelected ? 'is-selected' : ''}`;
    const title = document.createElement('strong');
    title.textContent = `${nodeLabel(record.id)} · المستوى ${record.level}`;
    const details = document.createElement('span');
    details.textContent = `${record.configured ? (record.type === 'html' ? 'HTML محلي' : record.url || 'بيانات محلية') : 'عقدة فارغة'} · ${record.quran.surah_name} · الجذر المركب ${record.quran.combined_root} · الأب: ${record.parent ? nodeLabel(record.parent) : 'الجذر'}`;
    message.append(title, details);
    message.addEventListener('click', () => { nodeChatRoomSelected = record.id; const button = nodeButtons.get(record.id); if (button) { button.scrollIntoView({ block: 'center', inline: 'center' }); openHubNode(record.id, button); } renderNodeChatRoom(); });
    log.appendChild(message);
  });
  const active = [...nodeChatRoomRecords.values()].filter((record) => record.configured).length;
  $('#node-chat-room-status').textContent = `تم ربط ${nodeChatRoomRecords.size} عقدة · ${active} مهيأة · يعرض ${visible.length}${records.length > visible.length ? ` من ${records.length}` : ''} · البيانات محلية`;
}
function setupNodeChatRoom() {
  for (let id = 1; id <= NODE_TOTAL; id += 1) updateNodeChatRoomRecord(id);
  $('#node-chat-room-search').addEventListener('input', renderNodeChatRoom);
  renderNodeChatRoom();
}
function createNodeElements() {
  let id = 1;
  NODE_LEVELS.forEach((count, level) => {
    const label = document.createElement('span');
    label.className = `network-level-label${level < 6 ? ' network-level-intro' : ''}`;
    label.textContent = level < 6 ? `المستوى ${level + 1} · ${count} ${count === 1 ? 'عقدة' : count === 2 ? 'عقدتان' : 'عقد'}` : `المستوى ${level + 1} · ${count} عقدة`;
    label.dataset.level = String(level);
    nodeNetwork.appendChild(label);
    levelLabels.push(label);
    for (let position = 0; position < count; position += 1, id += 1) {
      const currentId = id;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'network-node';
      button.dataset.id = String(currentId);
      button.dataset.nodeNumber = String(currentId);
      button.dataset.level = String(level);
      const nodeMetric = quranMetricForNode(currentId);
      button.dataset.nodeName = nodeMetric.surah_name;
      button.dataset.nodeAbjad = String(nodeMetric.abjad_value);
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
  calculateNodeCentrality();
  renderNodeCentrality();
  updateStats();
}

const DEFAULT_RELATION_STYLES = Object.freeze({ hierarchy: { color: '#59e0a3', style: 'solid' }, content: { color: '#55b8e8', style: 'dashed' }, software: { color: '#f4ce72', style: 'dotted' } });
function relationType(parentId, childId) {
  const childType = nodeContentType(getHubData(childId), childId);
  const parentType = nodeContentType(getHubData(parentId), parentId);
  if (['software', 'download', 'app', 'matrix'].includes(childType) || ['software', 'download', 'app', 'matrix'].includes(parentType)) return 'software';
  if (childType !== 'empty' || parentType !== 'empty') return 'content';
  return 'hierarchy';
}
function applyRelationCustomization() {
  const saved = readJson(RELATION_STYLE_KEY, {});
  Object.keys(DEFAULT_RELATION_STYLES).forEach((type) => {
    const config = { ...DEFAULT_RELATION_STYLES[type], ...(saved[type] || {}) };
    document.documentElement.style.setProperty(`--edge-${type}`, config.color);
    document.documentElement.style.setProperty(`--edge-${type}-dash`, config.style === 'dashed' ? '10 7' : config.style === 'dotted' ? '2 7' : 'none');
    const color = document.querySelector(`.relation-color[data-relation="${type}"]`);
    const style = document.querySelector(`.relation-style[data-relation="${type}"]`);
    if (color) color.value = config.color;
    if (style) style.value = config.style;
  });
}
function saveRelationCustomization() {
  const styles = {};
  document.querySelectorAll('.relation-color').forEach((input) => {
    const type = input.dataset.relation;
    const style = document.querySelector(`.relation-style[data-relation="${type}"]`);
    styles[type] = { color: input.value, style: style?.value || 'solid' };
  });
  writeJson(RELATION_STYLE_KEY, styles);
  applyRelationCustomization();
  drawEdges();
}
function setupRelationCustomization() {
  applyRelationCustomization();
  document.querySelectorAll('.relation-color, .relation-style').forEach((control) => control.addEventListener('input', saveRelationCustomization));
  $('#relation-reset').addEventListener('click', () => { writeJson(RELATION_STYLE_KEY, DEFAULT_RELATION_STYLES); applyRelationCustomization(); drawEdges(); });
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
function canvasPointFromEvent(event) {
  const rect = networkCanvas.getBoundingClientRect();
  return { x: (event.clientX - rect.left + nodeViewport.scrollLeft) / zoom, y: (event.clientY - rect.top + nodeViewport.scrollTop) / zoom };
}
function canvasNodeAt(point) {
  let hit = null;
  for (let id = NODE_TOTAL; id >= 1; id -= 1) {
    const button = nodeButtons.get(id); const position = nodePositions.get(id);
    if (!button || button.hidden || !position) continue;
    const dx = point.x - position.x; const dy = point.y - position.y;
    if (dx * dx + dy * dy <= (NODE_SIZE / 2 + 5) ** 2) { hit = id; break; }
  }
  return hit;
}
function resizeNetworkCanvas() {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, nodeViewport.clientWidth);
  const height = Math.max(1, nodeViewport.clientHeight);
  networkCanvas.width = Math.ceil(width * ratio);
  networkCanvas.height = Math.ceil(height * ratio);
  networkCanvas.style.width = `${width}px`;
  networkCanvas.style.height = `${height}px`;
  networkCanvas.style.left = `${nodeViewport.scrollLeft}px`;
  networkCanvas.style.top = `${nodeViewport.scrollTop}px`;
  canvasContext.setTransform(ratio, 0, 0, ratio, 0, 0);
}
function pointOnPolyline(points, progress) {
  const lengths = [];
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const length = Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
    lengths.push(length);
    total += length;
  }
  let distance = total * Math.max(0, Math.min(1, progress));
  for (let index = 0; index < lengths.length; index += 1) {
    if (distance <= lengths[index]) {
      const start = points[index]; const end = points[index + 1];
      const ratio = lengths[index] ? distance / lengths[index] : 0;
      return { x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio };
    }
    distance -= lengths[index];
  }
  return points.at(-1);
}
function drawPipePump(parent, child, seed) {
  if (!pipeFlowEnabled) return;
  const midY = parent.y + (child.y - parent.y) * .5;
  const points = [{ x: parent.x, y: parent.y }, { x: parent.x, y: midY }, { x: child.x, y: midY }, { x: child.x, y: child.y }];
  const center = pointOnPolyline(points, .5);
  const pulse = pointOnPolyline(points, ((performance.now() - pipeFlowStartedAt) / 1800 + seed * .013) % 1);
  canvasContext.save();
  canvasContext.globalAlpha = .82;
  canvasContext.strokeStyle = '#f4ce72';
  canvasContext.fillStyle = '#f4ce72';
  canvasContext.lineWidth = 1.5 / zoom;
  canvasContext.beginPath(); canvasContext.arc(center.x, center.y, 5 / zoom, 0, Math.PI * 2); canvasContext.stroke();
  canvasContext.beginPath(); canvasContext.arc(pulse.x, pulse.y, 2.7 / zoom, 0, Math.PI * 2); canvasContext.fill();
  canvasContext.restore();
}
function requestPipeFlowFrame() {
  if (pipeFlowFrame) return;
  pipeFlowFrame = window.requestAnimationFrame(() => {
    pipeFlowFrame = 0;
    if (pipeFlowEnabled) {
      renderCanvasNetwork();
      requestPipeFlowFrame();
    }
  });
}
function renderCanvasNetwork() {
  if (!networkCanvas || !canvasContext) return;
  resizeNetworkCanvas();
  const root = getComputedStyle(document.documentElement);
  const colors = { hierarchy: root.getPropertyValue('--edge-hierarchy').trim() || '#59e0a3', content: root.getPropertyValue('--edge-content').trim() || '#55b8e8', software: root.getPropertyValue('--edge-software').trim() || '#f4ce72' };
  const offsetX = nodeViewport.scrollLeft;
  const offsetY = nodeViewport.scrollTop;
  canvasContext.clearRect(0, 0, nodeViewport.clientWidth, nodeViewport.clientHeight);
  canvasContext.save();
  canvasContext.scale(zoom, zoom);
  canvasContext.translate(-offsetX / zoom, -offsetY / zoom);
  canvasContext.lineWidth = 4 / zoom;
  canvasContext.lineCap = 'round';
  canvasContext.lineJoin = 'round';
  for (const edgeKey of visibleEdgeIds) {
    const [parentRaw, childRaw] = edgeKey.split(':');
    const id = Number(childRaw);
    const parentId = Number(parentRaw);
    const parent = nodePositions.get(parentId); const child = nodePositions.get(id);
    const parentButton = nodeButtons.get(parentId); const childButton = nodeButtons.get(id);
    if (!parent || !child || parentButton?.hidden || childButton?.hidden) continue;
    const visibleLeft = offsetX / zoom - NODE_SIZE;
    const visibleTop = offsetY / zoom - NODE_SIZE;
    const visibleRight = (offsetX + nodeViewport.clientWidth) / zoom + NODE_SIZE;
    const visibleBottom = (offsetY + nodeViewport.clientHeight) / zoom + NODE_SIZE;
    if (Math.max(parent.x, child.x) < visibleLeft || Math.min(parent.x, child.x) > visibleRight || Math.max(parent.y, child.y) < visibleTop || Math.min(parent.y, child.y) > visibleBottom) continue;
    const type = relationType(parentId, id); canvasContext.strokeStyle = colors[type === 'software' ? 'software' : type === 'content' ? 'content' : 'hierarchy'];
    const emphasized = parentButton.classList.contains('is-path') && childButton.classList.contains('is-path');
    canvasContext.globalAlpha = emphasized ? .9 : .12;
    const style = readJson(RELATION_STYLE_KEY, {})[type === 'software' ? 'software' : type] || {};
    canvasContext.setLineDash(style.style === 'dashed' ? [7, 6] : style.style === 'dotted' ? [2, 6] : []);
    const midY = parent.y + (child.y - parent.y) * .5;
    canvasContext.beginPath(); canvasContext.moveTo(parent.x, parent.y); canvasContext.lineTo(parent.x, midY); canvasContext.lineTo(child.x, midY); canvasContext.lineTo(child.x, child.y); canvasContext.stroke();
    drawPipePump(parent, child, id);
    canvasContext.globalAlpha = 1;
  }
  canvasContext.setLineDash([]);
  const introLevels = NODE_LEVELS.slice(0, 6);
  let introCursor = 1;
  introLevels.forEach((count, level) => {
    const first = nodePositions.get(introCursor);
    const last = nodePositions.get(introCursor + count - 1);
    if (first && last) {
      const y = first.y;
      canvasContext.save();
      canvasContext.strokeStyle = 'rgba(89, 224, 163, .16)';
      canvasContext.setLineDash([5, 8]);
      canvasContext.lineWidth = 1;
      canvasContext.beginPath(); canvasContext.moveTo(34, y); canvasContext.lineTo(mapWidth - 34, y); canvasContext.stroke();
      canvasContext.setLineDash([]);
      canvasContext.fillStyle = 'rgba(168, 255, 211, .82)';
      canvasContext.font = '800 12px system-ui,sans-serif';
      canvasContext.textAlign = 'start'; canvasContext.textBaseline = 'middle';
      const countLabel = count === 1 ? 'عقدة' : count === 2 ? 'عقدتان' : 'عقد';
      canvasContext.fillText(`المستوى ${level + 1} · ${count} ${countLabel}`, 38, y - 31);
      canvasContext.restore();
    }
    introCursor += count;
  });
  for (const id of visibleNodeIds) {
    const button = nodeButtons.get(id); const point = nodePositions.get(id); if (!button || button.hidden || !point) continue;
    const visibleLeft = offsetX / zoom - NODE_SIZE;
    const visibleTop = offsetY / zoom - NODE_SIZE;
    const visibleRight = (offsetX + nodeViewport.clientWidth) / zoom + NODE_SIZE;
    const visibleBottom = (offsetY + nodeViewport.clientHeight) / zoom + NODE_SIZE;
    if (point.x < visibleLeft || point.x > visibleRight || point.y < visibleTop || point.y > visibleBottom) continue;
    const active = button.dataset.active === 'true'; const highlighted = button.classList.contains('is-highlighted') || button.classList.contains('is-path');
    const introNode = Number(button.dataset.level) < 6;
    const nodeRadius = introNode ? 25 : NODE_SIZE / 2;
    canvasContext.beginPath(); canvasContext.arc(point.x, point.y, nodeRadius, 0, Math.PI * 2);
    if (introNode) { canvasContext.fillStyle = 'rgba(89, 224, 163, .08)'; canvasContext.fill(); canvasContext.beginPath(); canvasContext.arc(point.x, point.y, nodeRadius + 5, 0, Math.PI * 2); canvasContext.strokeStyle = 'rgba(244, 206, 114, .38)'; canvasContext.lineWidth = 1.5; canvasContext.stroke(); canvasContext.beginPath(); canvasContext.arc(point.x, point.y, nodeRadius, 0, Math.PI * 2); }
    canvasContext.fillStyle = active ? '#17140b' : '#081411'; canvasContext.fill(); canvasContext.lineWidth = highlighted ? 4 : 2; canvasContext.strokeStyle = active ? '#f4ce72' : highlighted ? '#f4ce72' : '#59e0a3'; canvasContext.stroke();
    canvasContext.fillStyle = '#59e0a3'; canvasContext.font = '900 16px system-ui,sans-serif'; canvasContext.textAlign = 'center'; canvasContext.textBaseline = 'middle'; canvasContext.fillText('+', point.x, point.y - 4);
    canvasContext.fillStyle = '#e5fff3'; canvasContext.font = '900 7px system-ui,sans-serif'; canvasContext.fillText(nodeLabel(id), point.x, point.y + 10);
  }
  canvasContext.restore();
}
function setupCanvasInteraction() {
  networkCanvas.addEventListener('wheel', (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const rect = networkCanvas.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const worldX = (pointerX + nodeViewport.scrollLeft) / zoom;
    const worldY = (pointerY + nodeViewport.scrollTop) / zoom;
    zoom = Math.max(.05, Math.min(1.5, Math.round((zoom + (event.deltaY < 0 ? .1 : -.1)) * 10) / 10));
    applyZoom();
    nodeViewport.scrollLeft = Math.max(0, worldX * zoom - pointerX);
    nodeViewport.scrollTop = Math.max(0, worldY * zoom - pointerY);
    renderCanvasNetwork();
  }, { passive: false });
  networkCanvas.addEventListener('pointerdown', (event) => {
    const point = canvasPointFromEvent(event); const id = canvasNodeAt(point); if (!id) return;
    canvasPointer = { id, startX: point.x, startY: point.y, moved: false }; networkCanvas.setPointerCapture?.(event.pointerId); event.preventDefault();
  });
  networkCanvas.addEventListener('pointermove', (event) => {
    if (!canvasPointer) return; const point = canvasPointFromEvent(event); const position = nodePositions.get(canvasPointer.id); if (!position) return;
    const dx = point.x - canvasPointer.startX; const dy = point.y - canvasPointer.startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) canvasPointer.moved = true;
    if (!canvasPointer.moved) return;
    position.x = Math.max(NODE_SIZE / 2, position.x + dx); position.y = Math.max(NODE_SIZE / 2, position.y + dy); canvasPointer.startX = point.x; canvasPointer.startY = point.y;
    const button = nodeButtons.get(canvasPointer.id); button.style.left = `${position.x - NODE_SIZE / 2}px`; button.style.top = `${position.y - NODE_SIZE / 2}px`; fitMapToPositions(); updateEdgesForNode(canvasPointer.id); renderCanvasNetwork();
  });
  const end = (event) => { if (!canvasPointer) return; const id = canvasPointer.id; const moved = canvasPointer.moved; canvasPointer = null; if (!moved) openHubNode(id, nodeButtons.get(id)); else saveNodePositions(); networkCanvas.releasePointerCapture?.(event.pointerId); };
  networkCanvas.addEventListener('pointerup', end); networkCanvas.addEventListener('pointercancel', end);
}
function scheduleEdgeVisibilityUpdate() {
  const token = ++edgeVisibilityToken;
  if (edgeVisibilityFrame) cancelAnimationFrame(edgeVisibilityFrame);
  visibleEdgeIds.clear();
  const paths = [...lines.querySelectorAll('.network-connection')];
  let cursor = 0;
  const processBatch = () => {
    if (token !== edgeVisibilityToken) return;
    const startedAt = performance.now();
    const batchEnd = Math.min(paths.length, cursor + 240);
    while (cursor < batchEnd && performance.now() - startedAt < 6) {
      const path = paths[cursor];
      const from = nodeButtons.get(Number(path.dataset.from));
      const to = nodeButtons.get(Number(path.dataset.to));
      const visible = !from?.hidden && !to?.hidden;
      path.hidden = !visible;
      if (visible) visibleEdgeIds.add(`${path.dataset.from}:${path.dataset.to}`);
      cursor += 1;
    }
    if (cursor < paths.length) {
      edgeVisibilityFrame = requestAnimationFrame(processBatch);
      return;
    }
    edgeVisibilityFrame = 0;
    renderCanvasNetwork();
  };
  edgeVisibilityFrame = requestAnimationFrame(processBatch);
}
function updateEdgeGeometry(path, parentId, childId) {
  const parent = nodePositions.get(parentId);
  const child = nodePositions.get(childId);
  if (!parent || !child) return;
  const startY = parent.y + NODE_SIZE * .43;
  const endY = child.y - NODE_SIZE * .43;
  const curve = Math.max(18, Math.abs(endY - startY) * .38);
  path.setAttribute('d', `M ${parent.x} ${startY} C ${parent.x} ${startY + curve}, ${child.x} ${endY - curve}, ${child.x} ${endY}`);
}
function updateEdgesForNode(id) {
  const paths = new Set([
    ...lines.querySelectorAll(`[data-from="${id}"]`),
    ...lines.querySelectorAll(`[data-to="${id}"]`)
  ]);
  paths.forEach((path) => updateEdgeGeometry(path, Number(path.dataset.from), Number(path.dataset.to)));
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
    const edgeType = relationType(parentId, id);
    path.setAttribute('class', `network-connection edge-${edgeType}`);
    path.dataset.relation = edgeType;
    path.dataset.from = String(parentId);
    path.dataset.to = String(id);
    path.setAttribute('role', 'button');
    path.setAttribute('tabindex', '0');
    path.setAttribute('aria-label', `علاقة من ${nodeLabel(parentId)} إلى ${nodeLabel(id)}`);
    updateEdgeGeometry(path, parentId, id);
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
  visibleEdgeIds.clear();
  scheduleEdgeVisibilityUpdate();
  renderCanvasNetwork();
}

function applyZoom() {
  stage.style.width = `${mapWidth}px`;
  stage.style.height = `${mapHeight}px`;
  stage.style.transform = `scale(${zoom})`;
  stageWrap.style.width = `${mapWidth * zoom}px`;
  stageWrap.style.height = `${mapHeight * zoom}px`;
  $('#zoom-level').textContent = `${Math.round(zoom * 100)}%`;
  renderCanvasNetwork();
}

function centerMapViewport(behavior = 'auto') {
  // يبدأ المسار من الجذر في أعلى الخريطة؛ تمركز الارتفاع الكامل كان يضع
  // المستخدم في منتصف شبكة بارتفاع آلاف البكسلات، فيبدو أن الشبكة فارغة.
  nodeViewport.scrollTo({ left: Math.max(0, (mapWidth - nodeViewport.clientWidth) / 2), top: 0, behavior });
}
function resetNodeLayout() {
  localStorage.removeItem(POSITIONS_KEY);
  nodePositions.clear();
  layoutNodes();
  centerMapViewport('smooth');
  setNodeStatus('تمت استعادة ترتيب 6600 عقدة بمسافة 8 سم ومسارات هرمية متماسكة.');
}
function layoutNodes() {
  const viewportWidth = Math.max(280, Math.floor(nodeViewport.clientWidth - 8 || 720));
  const gridCell = NODE_SPACING_PX;
  const columns = 60;
  const sidePadding = Math.max(NODE_SPACING_PX, 2 * gridCell);
  const storedPositions = readNodePositions();
  const rowsByLevel = NODE_LEVELS.map((count) => Math.max(1, Math.ceil(count / columns)));
  const totalRows = rowsByLevel.reduce((sum, rows) => sum + rows, 0) + NODE_LEVELS.length * .35 + 1;
  mapWidth = Math.max(viewportWidth, columns * gridCell + sidePadding * 2);
  mapHeight = Math.max(nodeViewport.clientHeight, totalRows * gridCell + sidePadding * 2);
  let cursor = 1;
  let rowCursor = 0;
  nodePositions.clear();
  NODE_LEVELS.forEach((count, level) => {
    const rows = rowsByLevel[level];
    const levelWidth = Math.min(columns, count) * gridCell;
    const startX = Math.max(sidePadding, (mapWidth - levelWidth) / 2 + gridCell / 2);
    const label = levelLabels[level];
    const levelTop = sidePadding + rowCursor * gridCell;
    label.style.top = `${levelTop - gridCell * .48}px`;
    label.style.insetInlineStart = `${Math.max(12, startX - gridCell / 2)}px`;
    for (let position = 0; position < count; position += 1, cursor += 1) {
      const col = position % columns;
      const row = Math.floor(position / columns);
      // Alternate row lanes by half a cell to reduce long vertical collisions.
      const rowOffset = row % 2 === 0 ? 0 : gridCell / 2;
      const gridX = startX + col * gridCell + rowOffset;
      const gridY = levelTop + row * gridCell;
      const saved = storedPositions[cursor];
      const point = saved && Number.isFinite(saved.x) && Number.isFinite(saved.y) && saved.x <= mapWidth && saved.y <= mapHeight
        ? { x: Math.max(NODE_SIZE / 2, saved.x), y: Math.max(NODE_SIZE / 2, saved.y), level, row, col }
        : { x: gridX, y: gridY, level, row, col, rowOffset };
      nodePositions.set(cursor, point);
      const button = nodeButtons.get(cursor);
      button.style.left = `${point.x - NODE_SIZE / 2}px`;
      button.style.top = `${point.y - NODE_SIZE / 2}px`;
    }
    rowCursor += rows + 1.35;
  });
  fitMapToPositions();
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
function getNodeSearchTerms(query) {
  const terms = [];
  const matcher = /"([^"]+)"|(\S+)/g;
  let match;
  while ((match = matcher.exec(query.toLocaleLowerCase()))) terms.push((match[1] || match[2]).trim());
  return terms.filter(Boolean);
}
function nodeSearchText(id, data, typeLabel) {
  return `${nodeLabel(id)} ${id} ${data?.label || ''} ${data?.url || ''} ${data?.html ? 'html محلي' : ''} ${typeLabel}`.toLocaleLowerCase();
}
function renderAdvancedNodeResults(ids, query) {
  const container = $('#advanced-node-results');
  if (!container) return;
  const limit = Number($('#node-result-limit')?.value || 16);
  const shown = ids.slice(0, limit);
  container.replaceChildren();
  if (!query.trim() && ids.length === NODE_TOTAL) {
    const hint = document.createElement('p');
    hint.className = 'advanced-node-result-empty';
    hint.textContent = `اكتب كلمات البحث لعرض بطاقات مطابقة من أصل ${NODE_TOTAL} عقدة.`;
    container.appendChild(hint);
    return;
  }
  if (!shown.length) {
    const empty = document.createElement('p');
    empty.className = 'advanced-node-result-empty';
    empty.textContent = 'لا توجد عقد مطابقة لهذه الشروط.';
    container.appendChild(empty);
    return;
  }
  shown.forEach((id) => {
    const data = getHubData(id);
    const type = nodeContentType(data, id);
    const result = document.createElement('button');
    result.type = 'button';
    result.className = 'advanced-node-result';
    const title = document.createElement('strong');
    title.textContent = `${nodeLabel(id)} · المستوى ${Number(nodeButtons.get(id)?.dataset.level || 0) + 1}`;
    const detail = document.createElement('span');
    detail.textContent = data?.label || data?.url || (data?.html ? 'HTML محلي' : `عقدة ${type}`);
    result.append(title, detail);
    result.addEventListener('click', () => {
      const button = nodeButtons.get(id);
      if (!button) return;
      nodeViewport.scrollTo({ left: Math.max(0, (nodePositions.get(id)?.x || 0) * zoom - nodeViewport.clientWidth / 2), top: Math.max(0, (nodePositions.get(id)?.y || 0) * zoom - nodeViewport.clientHeight / 2), behavior: 'smooth' });
      button.focus({ preventScroll: true });
      button.classList.add('is-highlighted');
      window.setTimeout(() => button.classList.remove('is-highlighted'), 1800);
      openHubNode(id, button);
    });
    container.appendChild(result);
  });
}
function buildNodeFilterIndex() {
  const records = [];
  for (let id = 1; id <= NODE_TOTAL; id += 1) {
    const data = getHubData(id);
    const type = nodeContentType(data, id);
    records.push({
      id,
      level: Number(nodeButtons.get(id)?.dataset.level || 0),
      configured: isConfigured(data),
      type,
      searchText: nodeSearchText(id, data, type)
    });
  }
  return records;
}
function initializeNodeFilterWorker() {
  if (!nodeFilterWorker) return;
  nodeFilterWorker.addEventListener('message', handleNodeFilterWorkerMessage);
  nodeFilterWorker.addEventListener('error', () => {
    nodeFilterWorkerReady = false;
    setNodeStatus('تعذر تشغيل Worker؛ تم الرجوع إلى التصفية المحلية.', false);
  });
  sendNodeFilterIndex();
}
function sendNodeFilterIndex() {
  if (!nodeFilterWorker) return;
  nodeFilterIndexVersion += 1;
  nodeFilterWorkerReady = false;
  nodeFilterWorker.postMessage({ type: 'init', records: buildNodeFilterIndex(), indexVersion: nodeFilterIndexVersion });
}
function requestNodeFilterWorker() {
  if (!nodeFilterWorker || !nodeFilterWorkerReady) {
    applyNodeFiltersOnMainThread();
    return;
  }
  const requestId = ++nodeFilterRequestId;
  latestNodeFilterRequestId = requestId;
  nodeFilterWorker.postMessage({
    type: 'filter',
    requestId,
    query: $('#node-search').value.trim(),
    searchMode: $('#node-search-mode')?.value || 'all',
    sort: $('#node-sort')?.value || 'id',
    nodeFilter: $('#node-filter').value,
    softwareFilter: $('#software-filter').value,
    levelFilter: $('#level-filter').value
  });
}
function applyVisibleNodeIdsInBatches(visibleIds, visibleLevels) {
  const token = ++visibleNodeUpdateToken;
  if (visibleNodeUpdateFrame) cancelAnimationFrame(visibleNodeUpdateFrame);
  const visibleSet = new Set(visibleIds);
  visibleNodeIds.clear();
  visibleIds.forEach((id) => visibleNodeIds.add(id));
  let cursor = 1;
  const processBatch = () => {
    if (token !== visibleNodeUpdateToken) return;
    const end = Math.min(NODE_TOTAL + 1, cursor + 240);
    for (; cursor < end; cursor += 1) {
      const button = nodeButtons.get(cursor);
      if (!button) continue;
      const visible = visibleSet.has(cursor);
      button.hidden = !visible;
      button.classList.toggle('is-highlighted', visible && Boolean($('#node-search').value.trim()));
    }
    if (cursor < NODE_TOTAL + 1) {
      visibleNodeUpdateFrame = requestAnimationFrame(processBatch);
      return;
    }
    visibleNodeUpdateFrame = 0;
    levelLabels.forEach((label, level) => { label.hidden = !visibleLevels.has(level); });
    const query = $('#node-search').value.trim();
    renderAdvancedNodeResults(visibleIds, query);
    scheduleEdgeVisibilityUpdate();
    $('#node-status').textContent = `يعرض ${visibleIds.length} من ${NODE_TOTAL} عقدة · ${NODE_TOTAL - 1} علاقة في الشبكة.`;
    renderCanvasNetwork();
    persistUiSettings();
  };
  visibleNodeUpdateFrame = requestAnimationFrame(processBatch);
}
function handleNodeFilterWorkerMessage(event) {
  const message = event.data || {};
  if (message.type === 'ready') {
    nodeFilterWorkerReady = true;
    requestNodeFilterWorker();
    return;
  }
  if (message.type !== 'result' || message.requestId !== latestNodeFilterRequestId) return;
  $('#node-status').dataset.filterCache = message.cached ? 'hit' : 'miss';
  applyVisibleNodeIdsInBatches(message.visibleIds || [], new Set(message.visibleLevels || []));
}
function applyNodeFilters() {
  requestNodeFilterWorker();
}
function applyNodeFiltersOnMainThread() {
  const query = $('#node-search').value.trim();
  const terms = getNodeSearchTerms(query);
  const searchMode = $('#node-search-mode')?.value || 'all';
  const sort = $('#node-sort')?.value || 'id';
  const activeFilter = $('#node-filter').value;
  const softwareFilter = $('#software-filter').value;
  const levelFilter = $('#level-filter').value;
  const visibleIds = [];
  visibleNodeIds.clear();
  for (let id = 1; id <= NODE_TOTAL; id += 1) {
    const button = nodeButtons.get(id);
    const data = getHubData(id);
    const configured = isConfigured(data);
    const levelMatches = levelFilter === 'all' || button.dataset.level === levelFilter;
    const stateMatches = activeFilter === 'all' || (activeFilter === 'active' ? configured : !configured);
    const typeLabel = nodeContentType(data, id);
    const typeMatches = softwareFilter === 'all' || typeLabel === softwareFilter;
    const haystack = nodeSearchText(id, data, typeLabel);
    const queryMatches = !terms.length || (searchMode === 'any' ? terms.some((term) => haystack.includes(term)) : terms.every((term) => haystack.includes(term)));
    const show = levelMatches && stateMatches && typeMatches && queryMatches;
    button.hidden = !show;
    button.classList.toggle('is-highlighted', Boolean(terms.length && queryMatches && show));
    if (show) {
      visibleIds.push(id);
      visibleNodeIds.add(id);
    }
  }
  if (sort === 'level') visibleIds.sort((a, b) => Number(nodeButtons.get(a).dataset.level) - Number(nodeButtons.get(b).dataset.level) || a - b);
  if (sort === 'active') visibleIds.sort((a, b) => Number(isConfigured(getHubData(b))) - Number(isConfigured(getHubData(a))) || a - b);
  renderAdvancedNodeResults(visibleIds, query);
  scheduleEdgeVisibilityUpdate();
  const visibleLevels = new Set(visibleIds.map((id) => Number(nodeButtons.get(id)?.dataset.level)));
  levelLabels.forEach((label, level) => { label.hidden = !visibleLevels.has(level); });
  $('#node-status').textContent = `يعرض ${visibleIds.length} من ${NODE_TOTAL} عقدة · ${NODE_TOTAL - 1} علاقة في الشبكة.`;
  renderCanvasNetwork();
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
  return `<main style="box-sizing:border-box;min-height:100vh;padding:clamp(24px,6vw,72px);font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#e8f0ee;background:#071014;direction:rtl"><div style="max-width:720px;margin:auto;border:1px solid #315d57;border-radius:24px;padding:clamp(24px,5vw,48px);background:linear-gradient(145deg,#102127,#0b171b);box-shadow:0 20px 60px #0008"><div style="font-size:42px;color:#59e0a3">⌘</div><p style="color:#59e0a3;font-size:12px;font-weight:800;letter-spacing:.12em">SOFTWARE PREVIEW</p><h1 style="font-size:clamp(24px,5vw,42px);margin:.4em 0">${info.label}</h1><p style="color:#9cb0b2;line-height:1.8">هذا رابط ملف برمجي. يمكن عرض معلوماته داخل الموقع، لكن لا يمكن للمتصفح تشغيل ملف تنفيذي مباشرة لأسباب أمنية.</p><p style="color:#f4ce72;overflow-wrap:anywhere">المصدر: ${safeHost}</p><a href="${safeUrl}" data-preview-url="${safeUrl}" style="display:inline-block;margin-top:16px;border-radius:12px;padding:12px 18px;color:#052117;background:#59e0a3;font-weight:800;text-decoration:none">فتح ملف البرنامج خارجيًا ↗</a></div></main>`;
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
  sendNodeFilterIndex();
  applyNodeFilters();
}

window.addEventListener('knowledge-nodes-synced', () => {
  nodeButtons.forEach((_, id) => refreshNode(id));
  updateStats();
  sendNodeFilterIndex();
  applyNodeFilters();
  nodeChatRoomRecords.forEach((_, id) => updateNodeChatRoomRecord(id));
  renderNodeChatRoom();
});

const hubModal = $('#hub-modal');
const hubDialog = $('#hub-dialog');
const hubUrl = $('#hub-url');
const hubHtml = $('#hub-html');
const hubSearchQuery = $('#hub-search-query');
const hubSearchEngine = $('#hub-search-engine');
const hubPreview = $('#hub-preview');
const hubAddress = $('#hub-address');
const PREVIEW_WORKER = 'https://github-oauth-proxy.elazzouz4.workers.dev/preview';

const SEARCH_ENGINES = Object.freeze({
  google: 'https://www.google.com/search?q=', bing: 'https://www.bing.com/search?q=', duckduckgo: 'https://duckduckgo.com/?q=', brave: 'https://search.brave.com/search?q=', yahoo: 'https://search.yahoo.com/search?p=', ecosia: 'https://www.ecosia.org/search?q=', startpage: 'https://www.startpage.com/sp/search?query=', qwant: 'https://www.qwant.com/?q=', kagi: 'https://kagi.com/search?q=', yandex: 'https://yandex.com/search/?text=', baidu: 'https://www.baidu.com/s?wd='
});
async function searchWithSelectedEngine() {
  const query = hubSearchQuery.value.trim();
  if (!query) { setHubStatus('اكتب عبارة بحث أولًا.', false); hubSearchQuery.focus(); return; }
  const base = SEARCH_ENGINES[hubSearchEngine.value] || SEARCH_ENGINES.google;
  const url = `${base}${encodeURIComponent(query)}`;
  hubUrl.value = url;
  await buildHub();
  setHubStatus(`تظهر نتائج ${hubSearchEngine.options[hubSearchEngine.selectedIndex]?.text || 'المحرك المختار'} داخل Slaks دون مغادرة الصفحة.`);
}

const FEDERATED_SEARCH_ENGINES = Object.freeze([
  ['Google', SEARCH_ENGINES.google], ['Bing', SEARCH_ENGINES.bing], ['DuckDuckGo', SEARCH_ENGINES.duckduckgo],
  ['Brave Search', SEARCH_ENGINES.brave], ['Yahoo', SEARCH_ENGINES.yahoo], ['Ecosia', SEARCH_ENGINES.ecosia],
  ['Startpage', SEARCH_ENGINES.startpage], ['Qwant', SEARCH_ENGINES.qwant], ['Kagi', SEARCH_ENGINES.kagi],
  ['Yandex', SEARCH_ENGINES.yandex], ['Baidu', SEARCH_ENGINES.baidu]
]);

async function fetchSearchJson(url, timeoutMs = 4500) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    window.clearTimeout(timer);
  }
}

async function searchWikipedia(query) {
  const endpoint = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=5&format=json&origin=*`;
  const data = await fetchSearchJson(endpoint);
  return (data.query?.search || []).map(item => ({ title: item.title, url: `https://en.wikipedia.org/?curid=${item.pageid}`, text: item.snippet?.replace(/<[^>]+>/g, '') || '', kind: 'مقالة' }));
}

async function searchStackOverflow(query) {
  const endpoint = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(query)}&site=stackoverflow&pagesize=5&filter=default`;
  const data = await fetchSearchJson(endpoint);
  return (data.items || []).map(item => ({ title: item.title, url: item.link, text: `إجابات برمجية · ${item.answer_count || 0} إجابة`, kind: 'Stack Overflow' }));
}

async function searchMdn(query) {
  const data = await fetchSearchJson(`https://developer.mozilla.org/api/v1/search?q=${encodeURIComponent(query)}&size=5`);
  const documents = data.documents || data.results || [];
  return documents.slice(0, 5).map(item => ({ title: item.title || item.name, url: item.mdn_url || item.url || item.slug, text: item.summary || item.description || 'مرجع ويب وتقنيات.', kind: 'MDN' })).filter(item => item.url);
}

async function searchGithub(query) {
  const [codeResult, repositoryResult] = await Promise.allSettled([
    fetchSearchJson(`https://api.github.com/search/code?q=${encodeURIComponent(query)}&per_page=5`),
    fetchSearchJson(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=5`)
  ]);
  const codeItems = codeResult.status === 'fulfilled' ? (codeResult.value.items || []) : [];
  if (codeItems.length) return codeItems.map(item => ({ title: item.name, url: item.html_url, text: `ملف برمجي في ${item.repository?.full_name || 'GitHub'}`, kind: 'GitHub Code' }));
  const repositoryItems = repositoryResult.status === 'fulfilled' ? (repositoryResult.value.items || []) : [];
  return repositoryItems.map(item => ({ title: item.full_name, url: item.html_url, text: item.description || 'مستودع برمجي.', kind: 'GitHub Repository' }));
}

async function searchNpm(query) {
  const data = await fetchSearchJson(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=5`);
  return (data.objects || []).map(item => ({ title: item.package?.name, url: item.package?.links?.npm, text: item.package?.description || 'حزمة JavaScript قابلة لإعادة الاستخدام.', kind: 'npm' })).filter(item => item.url);
}

function renderFederatedResults(query, reports) {
  const engineCards = FEDERATED_SEARCH_ENGINES.map(([name, base]) => `<a class="federated-search-engine" href="${escapeXml(`${base}${encodeURIComponent(query)}`)}" data-preview-url="${escapeXml(`${base}${encodeURIComponent(query)}`)}">${escapeXml(name)} ↗</a>`).join('');
  const resultCards = reports.flatMap(report => (report.items || []).map(item => `<article class="federated-search-card"><span>${escapeXml(item.kind)}</span><h3><a href="${escapeXml(item.url)}" data-preview-url="${escapeXml(item.url)}">${escapeXml(item.title || 'نتيجة بلا عنوان')}</a></h3><p>${escapeXml(item.text || '')}</p></article>`)).join('');
  const message = resultCards ? 'تم العثور على نتائج من مصادر المقالات والبرمجة. افتح أي نتيجة، أو انتقل إلى أحد محركات البحث.' : 'لم تُرجع المصادر المتخصصة نتيجة مباشرة؛ جرّب أحد محركات البحث العامة أدناه.';
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>body{font-family:system-ui,Arial,sans-serif;margin:0;padding:24px;color:#e7f2f0;background:#071014;line-height:1.7}h1{font-size:1.35rem;margin:0 0 8px}p{color:#9cb0b2}.federated-search-engines{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0}.federated-search-engine{display:inline-block;padding:7px 10px;border:1px solid #315d57;border-radius:999px;color:#59e0a3;text-decoration:none;font-size:.82rem}.federated-search-results{display:grid;gap:10px}.federated-search-card{border:1px solid #25443f;border-radius:14px;padding:14px;background:#102127}.federated-search-card span{color:#f4ce72;font-size:.75rem;font-weight:700}.federated-search-card h3{font-size:1rem;margin:4px 0}.federated-search-card h3 a{color:#e8f7f2}.federated-search-card p{margin:0;font-size:.86rem}</style></head><body><h1>بحث شامل: ${escapeXml(query)}</h1><p>${escapeXml(message)}</p><div class="federated-search-engines">${engineCards}</div><section class="federated-search-results">${resultCards || '<p>لم نجد نتيجة متخصصة بعد. استخدم روابط المحركات أعلاه لتوسيع البحث.</p>'}</section><script>document.addEventListener('click',function(event){var link=event.target.closest('a[data-preview-url]');if(!link)return;event.preventDefault();parent.postMessage({type:'hub-preview-url',url:link.getAttribute('data-preview-url')},'*');});</script></body></html>`;
}

async function searchEverywhere() {
  const query = hubSearchQuery.value.trim();
  if (!query) { setHubStatus('اكتب عبارة بحث أولًا.', false); hubSearchQuery.focus(); return; }
  const button = $('#hub-search-all');
  button.disabled = true;
  button.textContent = 'جارٍ البحث في كل المصادر…';
  hubPreview.hidden = false;
  hubAddress.textContent = `بحث شامل · ${query}`;
  hubPreview.removeAttribute('src');
  hubPreview.srcdoc = renderFederatedResults(query, []);
  renderExtraction({ title: `بحث شامل: ${query}`, text: 'بدأ البحث المتوازي. ستظهر النتائج تدريجيًا عند وصول كل مصدر دون انتظار بقية المصادر.', source: 'البحث متعدد المصادر', kind: 'search' });
  setHubStatus('بدأ البحث بالتوازي؛ تظهر النتائج تدريجيًا…');
  const tasks = [
    ['Wikipedia', searchWikipedia], ['Stack Overflow', searchStackOverflow], ['MDN', searchMdn], ['GitHub', searchGithub], ['npm', searchNpm]
  ];
  const reports = [];
  let completed = 0;
  const settled = await Promise.allSettled(tasks.map(([source, search], index) => search(query).then(items => {
    reports[index] = { source, items };
    completed += 1;
    hubPreview.srcdoc = renderFederatedResults(query, reports.filter(Boolean));
    setHubStatus(`وصلت نتائج ${completed} من ${tasks.length} مصادر…`);
    return items;
  }).catch(() => {
    reports[index] = { source, items: [] };
    completed += 1;
    hubPreview.srcdoc = renderFederatedResults(query, reports.filter(Boolean));
    setHubStatus(`اكتمل مصدر ${completed} من ${tasks.length}؛ ما زال البحث مستمرًا…`);
    return [];
  })));
  const total = reports.reduce((sum, report) => sum + report.items.length, 0);
  hubPreview.srcdoc = renderFederatedResults(query, reports);
  renderExtraction({ title: `بحث شامل: ${query}`, text: `تم فحص ${tasks.length} مصادر متخصصة وإعداد روابط ${FEDERATED_SEARCH_ENGINES.length} محرك بحث. عدد النتائج المباشرة: ${total}.`, source: 'البحث متعدد المصادر', kind: 'search' });
  setHubStatus(total ? `اكتمل البحث الشامل؛ عُثر على ${total} نتيجة مباشرة مع روابط كل المحركات.` : 'اكتمل البحث الشامل؛ لم تُرجع المصادر المتخصصة نتيجة مباشرة، وجميع المحركات العامة متاحة للتجربة.');
  button.disabled = false;
  button.textContent = 'بحث شامل في كل المصادر';
}
function clearPreview() {
  hubPreview.removeAttribute('srcdoc');
  hubPreview.src = 'about:blank';
  hubPreview.hidden = true;
}

function scoreQuranRelevantText(text, metric) {
  if (!metric) return 0;
  const haystack = String(text || '').toLowerCase();
  const terms = [metric.surah_name, metric.type, 'quran', 'surah', 'chapter', 'ayah', 'verse', String(metric.surah_number), String(metric.ayahs_count), String(metric.combined_root), String(metric.abjad_root)].filter(Boolean).map(String);
  return terms.reduce((score, term) => score + (haystack.includes(term.toLowerCase()) ? (term.length > 2 ? 3 : 1) : 0), 0) + Math.min(2, Math.floor(haystack.length / 240));
}

function addQuranFilteredDigest(doc, metric) {
  if (!metric || !doc.body) return;
  const candidates = [...doc.body.querySelectorAll('article,section,main,p,li,h1,h2,h3,h4,blockquote,pre')]
    .filter((element) => {
      const text = element.textContent?.replace(/\s+/g, ' ').trim() || '';
      return text.length >= 30 && text.length <= 2400 && !element.closest('nav,footer,aside,form');
    })
    .map((element) => ({ element, text: element.textContent.replace(/\s+/g, ' ').trim(), score: scoreQuranRelevantText(element.textContent, metric) }))
    .sort((a, b) => b.score - a.score || b.text.length - a.text.length)
    .filter((item, index, all) => item.score > 0 && !all.slice(0, index).some((previous) => previous.text.includes(item.text) || item.text.includes(previous.text)))
    .slice(0, 12);
  if (!candidates.length) return;
  const digest = doc.createElement('section');
  digest.setAttribute('data-slaks-quran-filter', 'true');
  const heading = doc.createElement('h2');
  heading.textContent = `تصفية خوارزمية · ${metric.surah_name} · ${metric.type}`;
  const note = doc.createElement('p');
  note.textContent = `تم ترتيب ${candidates.length} مقطعًا وفق تطابق نصي مع اسم السورة وخصائصها الرقمية. هذه مطابقة استكشافية وليست تفسيرًا دينيًا.`;
  digest.append(heading, note, ...candidates.map(({ element, score }) => {
    const item = doc.createElement('article');
    item.setAttribute('data-quran-score', String(score));
    item.innerHTML = `<strong>درجة المطابقة: ${score}</strong> `;
    item.appendChild(element.cloneNode(true));
    return item;
  }));
  doc.body.prepend(digest);
}

function sanitizeExternalPreview(html, baseUrl, metric = null) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  doc.querySelectorAll('script,iframe,object,embed,form,base,meta[http-equiv="refresh"]').forEach((element) => element.remove());
  addQuranFilteredDigest(doc, metric);
  doc.querySelectorAll('*').forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      if (/^on/i.test(attribute.name) || attribute.name === 'srcdoc') element.removeAttribute(attribute.name);
    });
  });
  doc.querySelectorAll('a[href]').forEach((anchor) => {
    try {
      const url = new URL(anchor.getAttribute('href'), baseUrl);
      if (!['http:', 'https:'].includes(url.protocol)) anchor.removeAttribute('href');
      else { anchor.href = url.href; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; anchor.dataset.previewUrl = url.href; }
    } catch { anchor.removeAttribute('href'); }
  });
  doc.querySelectorAll('img[src]').forEach((image) => {
    try { image.src = new URL(image.getAttribute('src'), baseUrl).href; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer'; }
    catch { image.removeAttribute('src'); }
  });
  const safeBody = doc.body?.innerHTML || '<p>لم يُرجع المصدر محتوى قابلًا للعرض.</p>';
  const safeTitle = (doc.title || 'معاينة ويب').replace(/[<>]/g, '');
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src https:; connect-src 'none'; frame-src 'none';"><title>${escapeXml(safeTitle)}</title><style>body{font-family:system-ui,Arial,sans-serif;margin:0;padding:24px;color:#e8f0ee;background:#071014;line-height:1.75}a{color:#59e0a3}img{max-width:100%;height:auto;border-radius:10px}pre{overflow:auto;background:#102127;padding:12px;border-radius:10px}[data-slaks-quran-filter]{margin-bottom:28px;padding:18px;border:1px solid #59e0a3;border-radius:16px;background:linear-gradient(145deg,#102127,#0b171b)}[data-slaks-quran-filter] h2{margin-top:0;color:#59e0a3}[data-slaks-quran-filter] p{color:#9cb0b2}[data-slaks-quran-filter] article{margin-top:10px;padding:10px;border-radius:10px;background:#071014;border-inline-start:3px solid #f4ce72}[data-slaks-quran-filter] strong{color:#f4ce72}</style></head><body>${safeBody}<script>document.addEventListener('click',function(event){var link=event.target.closest('a[data-preview-url]');if(!link)return;event.preventDefault();parent.postMessage({type:'hub-preview-url',url:link.dataset.previewUrl},'*');});</script></body></html>`;
}

async function buildHub(silent = false) {
  hubPreview.hidden = false;
  const urlText = hubUrl.value.trim();
  const localHtml = hubHtml.value;
  try {
    if (urlText) {
      const link = parseNodeLink(urlText);
      if (link.kind !== 'web') {
        clearPreview();
        hubAddress.textContent = link.kind === 'matrix' ? `Matrix.org · ${link.display}` : link.url;
        renderExtraction({ title: link.display, text: link.kind === 'matrix' ? 'تم التعرف على غرفة Matrix. استخدم زر الفتح لفتحها في matrix.to أو عميل Matrix المثبت على جهازك.' : 'هذا الرابط يفتح في تطبيق خارجي ولا يمكن معاينته أو جلب محتواه داخل الشبكة.', source: link.kind === 'matrix' ? 'Matrix.org' : 'فتح خارجي فقط', kind: link.kind });
        setHubStatus(link.kind === 'matrix' ? 'غرفة Matrix جاهزة للفتح عبر matrix.to.' : 'الرابط صالح للفتح الخارجي، لكن المعاينة متاحة لصفحات HTTP/HTTPS فقط.');
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
      renderExtraction({ title: link.host || link.display, text: software.kind === 'software' ? 'هذه صفحة برمجية أو متجر تطبيقات وتُعرض داخل إطار المعاينة. قد يمنع الموقع الخارجي التضمين.' : 'جرت محاولة عرض الصفحة الخارجية داخل إطار معزول. قد تمنع بعض المواقع العرض داخل الإطارات؛ استخدم زر العرض داخل Slaks عند الحاجة.', source: software.label, kind: software.kind });
      setHubStatus(`جارية معاينة ${software.label} داخل Slaks عبر Relay عند توفره…`);
      try {
        const response = await fetch(`${PREVIEW_WORKER}?url=${encodeURIComponent(link.url)}`, { headers: { Accept: 'application/json' } });
        const payload = await response.json();
        if (response.ok && payload.html) {
          hubPreview.removeAttribute('src');
          hubPreview.srcdoc = sanitizeExternalPreview(payload.html, payload.finalUrl || link.url, quranMetricForNode(activeHub.id));
          hubAddress.textContent = `${software.label} · ${payload.finalUrl || link.url}`;
          renderExtraction({ title: payload.title || link.host, text: payload.description || payload.text || 'تم جلب نسخة HTML عبر Relay داخل Slaks.', elements: payload.elements, links: payload.links?.length, source: 'Cloudflare Preview Relay', kind: software.kind });
          setHubStatus('ظهرت نسخة الموقع داخل Slaks عبر Relay؛ يمكنك متابعة الروابط من نفس بطاقة المعاينة.');
        }
      } catch {
        setHubStatus('تعذر استخدام Relay حاليًا؛ بقيت المعاينة المباشرة داخل Slaks مفعلة.', false);
      }
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

function renderQuranNodeAnalysis(id) {
  const host = $('#hub-quran-analysis');
  if (!host) return;
  const metric = quranMetricForNode(id);
  const combined = QURAN_STATISTICS.kruskal_wallis?.combined_value?.statistical_metrics;
  host.replaceChildren();
  const title = document.createElement('strong');
  title.textContent = `السورة المرتبطة: ${metric.surah_name} · ${metric.type} · عقدة ${nodeLabel(id)}`;
  const values = document.createElement('div');
  values.className = 'hub-quran-values';
  [['رقم السورة', metric.surah_number], ['الآيات', metric.ayahs_count], ['جذر الرقم', metric.surah_number_root], ['جذر الآيات', metric.ayahs_count_root], ['القيمة المركبة', metric.combined_value], ['جذر المركب', metric.combined_root], ['قيمة الجُمّل', metric.abjad_value], ['جذر الجُمّل', metric.abjad_root]].forEach(([label, value]) => {
    const item = document.createElement('span');
    item.textContent = `${label}: ${value}`;
    values.appendChild(item);
  });
  const tests = document.createElement('div');
  tests.className = 'hub-quran-tests';
  const labels = { surah_number_root: 'جذر رقم السورة', ayahs_count_root: 'جذر الآيات', combined_root: 'الجذر المركب', abjad_root: 'جذر الجُمّل' };
  Object.entries(QURAN_STATISTICS.tests || {}).forEach(([key, item]) => {
    const metrics = item.statistical_metrics;
    const card = document.createElement('span');
    card.textContent = `χ² ${labels[key] || key}: ${metrics.chi2_observed.toFixed(3)} · p=${metrics.p_value_monte_carlo.toFixed(5)}`;
    tests.appendChild(card);
  });
  if (combined) {
    const kw = document.createElement('small');
    kw.textContent = `Kruskal-Wallis للقيمة المركبة: H=${combined.H_statistic.toFixed(4)} · p=${combined.p_value.toFixed(5)} · ε²=${combined.epsilon_squared.toFixed(4)} · B=200,000 · seed=12345`;
    tests.appendChild(kw);
  }
  host.append(title, values, tests);
}

function openHubNode(id, button) {
  nodeChatRoomSelected = id;
  updateNodeChatRoomRecord(id);
  renderNodeChatRoom();
  focusReturn = button;
  activeHub = { id, node: button };
  highlightNodePath(id);
  $('#hub-node-number').textContent = `#${String(id).padStart(3, '0')}`;
  renderQuranNodeAnalysis(id);
  setMod9NodeContext(id);
  const storedData = getHubData(id);
  const data = storedData || (button?.dataset.linkUrl ? { url: button.dataset.linkUrl, kind: button.dataset.linkKind || '' } : null);
  hubUrl.value = data?.url || '';
  hubHtml.value = data?.html || '';
  hubSearchQuery.value = data?.searchQuery || '';
  hubSearchEngine.value = data?.searchEngine || 'google';
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
    const data = { url: link?.url || '', kind: link?.kind || (html ? 'html' : ''), html, searchQuery: hubSearchQuery.value.trim(), searchEngine: hubSearchEngine.value, active: true, savedAt: new Date().toISOString() };
    const storageKey = `${LINK_KEY}-${activeHub.id}`;
    const serialized = JSON.stringify(data);
    if (semverStorageChars(storageKey) + storageKey.length + serialized.length > MAX_STORAGE_CHARS) throw new Error('وصلت بيانات مختبر العقد إلى سقف التخزين المحلي (نحو 650 كيلوبايت). امسح بعض العقد أو صغّر HTML.');
    if (!writeJson(storageKey, data)) throw new Error('تعذر الحفظ في هذا المتصفح؛ قد تكون مساحة التخزين ممتلئة.');
    const index = readJson(LINK_KEY, {});
    index[activeHub.id] = data.url || `#node-${String(activeHub.id).padStart(3, '0')}`;
    if (!writeJson(LINK_KEY, index)) throw new Error('تعذر تحديث فهرس الروابط المحلي.');
    updateNodeStatsAndFilters(activeHub.id);
    updateNodeChatRoomRecord(activeHub.id);
    renderNodeChatRoom();
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
    updateNodeChatRoomRecord(activeHub.id);
    renderNodeChatRoom();
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

async function openExternally() {
  const raw = hubUrl.value.trim() || getHubData(activeHub.id)?.url || '';
  try {
    const link = parseNodeLink(raw);
    if (link.kind === 'web') {
      hubUrl.value = link.url;
      await buildHub();
      setHubStatus('تم تحويل هذا الإجراء إلى معاينة داخل Slaks؛ لن تغادر الصفحة.');
      return;
    }
    clearPreview();
    hubAddress.textContent = link.url;
    renderExtraction({ title: link.display, text: 'هذا رابط تطبيق أو اتصال. أبقيناه داخل Slaks بدل نقل المستخدم تلقائيًا خارج الصفحة. يمكن للجهاز تشغيله فقط عند اختيارك من نظام التشغيل.', source: 'معاينة رابط اتصال', kind: link.kind });
    setHubStatus('الرابط محفوظ داخل العقدة، والمعاينة الخارجية التلقائية معطّلة حتى لا تغادر الصفحة.');
  } catch (error) {
    setHubStatus(error?.message || 'أدخل رابطًا صالحًا للمعاينة.', false);
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

function reportConcurrency() {
  const cores = Number(navigator.hardwareConcurrency) || 4;
  return Math.min(8, Math.max(2, Math.floor(cores / 2)));
}
function reportSignature(item) {
  return `${item.url || ''}|${item.html || ''}|${item.savedAt || ''}`;
}
let linkCacheDbPromise;
function openLinkCacheDb() {
  if (!('indexedDB' in window)) return Promise.resolve(null);
  if (linkCacheDbPromise) return linkCacheDbPromise;
  linkCacheDbPromise = new Promise((resolve) => {
    const request = indexedDB.open(LINK_CACHE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(LINK_CACHE_STORE, { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
  return linkCacheDbPromise;
}
async function idbReadCache(key) {
  const db = await openLinkCacheDb();
  if (!db) return null;
  return new Promise((resolve) => { const tx = db.transaction(LINK_CACHE_STORE, 'readonly'); const request = tx.objectStore(LINK_CACHE_STORE).get(key); request.onsuccess = () => resolve(request.result || null); request.onerror = () => resolve(null); });
}
async function idbWriteCache(entry) {
  const db = await openLinkCacheDb();
  if (!db) return;
  await new Promise((resolve) => { const tx = db.transaction(LINK_CACHE_STORE, 'readwrite'); tx.objectStore(LINK_CACHE_STORE).put(entry); tx.oncomplete = resolve; tx.onerror = resolve; });
}
async function idbClearCache() {
  const db = await openLinkCacheDb();
  if (!db) return;
  await new Promise((resolve) => { const tx = db.transaction(LINK_CACHE_STORE, 'readwrite'); tx.objectStore(LINK_CACHE_STORE).clear(); tx.oncomplete = resolve; tx.onerror = resolve; });
}
function linkCacheKey(item) { return `node:${item.id}:${reportSignature(item)}`; }
async function loadNodePayloadCached(item, allowStale = true) {
  const key = linkCacheKey(item);
  const cached = await idbReadCache(key);
  const fresh = cached && Date.now() - Number(cached.cachedAt || 0) < REPORT_CACHE_TTL;
  if (fresh) return { ...cached.payload, cached: true, cacheState: 'fresh' };
  if (pendingLinkLoads.has(key)) {
    const payload = await pendingLinkLoads.get(key);
    return { ...payload, cached: false, cacheState: 'shared-request' };
  }
  const refresh = (async () => {
    try {
      const payload = await fetchNodePayload(item.id) || { id: item.id, error: 'لا توجد بيانات.' };
      await idbWriteCache({ key, cachedAt: Date.now(), payload });
      return payload;
    } finally {
      pendingLinkLoads.delete(key);
    }
  })();
  pendingLinkLoads.set(key, refresh);
  if (cached && allowStale) {
    refresh.catch(() => {});
    return { ...cached.payload, cached: true, cacheState: 'stale-refreshing' };
  }
  return { ...(await refresh), cached: false, cacheState: 'fresh' };
}
function refreshReportCacheStatus() {
  const status = $('#report-cache-status');
  if (!status) return;
  const cache = readReportCache();
  const count = Object.keys(cache).length;
  const size = JSON.stringify(cache).length;
  status.textContent = count ? `ذاكرة الروابط: ${count} نتيجة محفوظة محليًا · ${Math.round(size / 1024)} كيلوبايت · صلاحية 10 دقائق.` : 'ذاكرة الروابط فارغة؛ ستُحفظ النتائج محليًا بعد جمع التقرير.';
}
async function clearReportCache() {
  localStorage.removeItem(REPORT_CACHE_KEY);
  await idbClearCache();
  refreshReportCacheStatus();
  $('#report-status').textContent = 'تم مسح ذاكرة الروابط المحلية. لن تُحذف بيانات العقد.';
}
function readReportCache() {
  const cache = readJson(REPORT_CACHE_KEY, {});
  return cache && typeof cache === 'object' ? cache : {};
}
function writeReportCache(cache) {
  const entries = Object.entries(cache).sort((a, b) => Number(b[1]?.cachedAt || 0) - Number(a[1]?.cachedAt || 0)).slice(0, 80);
  writeJson(REPORT_CACHE_KEY, Object.fromEntries(entries));
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
  const concurrency = reportConcurrency();
  const cache = readReportCache();
  let cacheHits = 0;
  status.textContent = `جارٍ إعداد ملخص محلي لـ ${active.length} عقدة عبر ${concurrency} مسارات…`;
  const results = await mapConcurrent(active, concurrency, async (item) => {
    const signature = reportSignature(item);
    const cached = cache[item.id];
    try {
      const payload = await loadNodePayloadCached(item);
      if (payload.cached) cacheHits += 1;
      cache[item.id] = { signature, cachedAt: Date.now(), payload };
      return payload;
    } catch (error) {
      return { id: item.id, url: item.url || '', error: error?.message || 'تعذر إعداد الملخص المحلي.', source: 'فحص محلي' };
    }
  }, (completed, total) => {
    status.textContent = `إعداد الملخص المحلي: ${completed} من ${total} عقدة · دفعات متزامنة: ${concurrency}…`;
  });
  writeReportCache(cache);
  refreshReportCacheStatus();
  latestReport = {
    generatedAt: new Date().toISOString(),
    totalNodes: NODE_TOTAL,
    activeNodes: results.length,
    cacheHits,
    maxConcurrency: concurrency,
    results: results.map((item) => {
      const { html, ...summary } = item || {};
      return summary;
    })
  };
  renderReport(latestReport.results);
  status.textContent = `اكتمل التقرير · ${cacheHits} من الذاكرة المؤقتة · تزامن ${concurrency} · ${new Date().toLocaleString('ar')}`;
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
function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]));
}
function exportNetworkMapJson() {
  const nodes = [];
  for (let id = 1; id <= NODE_TOTAL; id += 1) {
    const position = nodePositions.get(id);
    const data = getHubData(id);
    nodes.push({ id, label: nodeLabel(id), x: Math.round(position?.x || 0), y: Math.round(position?.y || 0), level: position?.level ?? null, parent: connectedNodeParent(id), type: nodeContentType(data, id), configured: isConfigured(data), url: data?.url || '', html: data?.html || '' });
  }
  const edges = nodes.filter((node) => node.parent).map((node) => ({ from: node.parent, to: node.id, relation: relationType(node.parent, node.id) }));
  const payload = { format: 'slaks-semver-network-map', version: 1, exportedAt: new Date().toISOString(), totalNodes: NODE_TOTAL, spacingCm: NODE_SPACING_CM, width: mapWidth, height: mapHeight, nodes, edges };
  downloadBlob(JSON.stringify(payload, null, 2), 'slaks-network-map.json', 'application/json');
  setNodeStatus(`تم تصدير الخريطة كاملة: ${nodes.length} عقدة و${edges.length} علاقة.`);
}
function exportNetworkMapSvg() {
  const root = getComputedStyle(document.documentElement);
  const hierarchyColor = root.getPropertyValue('--edge-hierarchy').trim() || '#59e0a3';
  const contentColor = root.getPropertyValue('--edge-content').trim() || '#55b8e8';
  const softwareColor = root.getPropertyValue('--edge-software').trim() || '#f4ce72';
  const edgeLines = [];
  for (let id = 2; id <= NODE_TOTAL; id += 1) {
    const parentId = connectedNodeParent(id); const parent = nodePositions.get(parentId); const child = nodePositions.get(id);
    if (!parent || !child) continue;
    const relation = relationType(parentId, id); const color = relation === 'software' ? softwareColor : relation === 'content' ? contentColor : hierarchyColor;
    const startY = parent.y; const endY = child.y; const midX = (parent.x + child.x) / 2; const midY = (parent.y + child.y) / 2;
    edgeLines.push(`<path d="M ${parent.x} ${startY} Q ${midX} ${midY} ${child.x} ${endY}" fill="none" stroke="${escapeXml(color)}" stroke-width="2.5"/>`);
  }
  const nodeShapes = [];
  for (let id = 1; id <= NODE_TOTAL; id += 1) {
    const point = nodePositions.get(id); if (!point) continue;
    const data = getHubData(id); const active = isConfigured(data); const color = active ? '#f4ce72' : '#59e0a3';
    nodeShapes.push(`<g><circle cx="${point.x}" cy="${point.y}" r="22" fill="#081411" stroke="${color}" stroke-width="2"/><text x="${point.x}" y="${point.y + 5}" fill="#dfffee" font-family="system-ui,sans-serif" font-size="12" font-weight="800" text-anchor="middle">+</text><text x="${point.x}" y="${point.y + 36}" fill="#adc5bb" font-family="system-ui,sans-serif" font-size="9" text-anchor="middle">${escapeXml(nodeLabel(id))}</text></g>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${mapWidth}" height="${mapHeight}" viewBox="0 0 ${mapWidth} ${mapHeight}"><title>Slaks network map · ${NODE_TOTAL} nodes</title><rect width="100%" height="100%" fill="#071014"/>${edgeLines.join('')}${nodeShapes.join('')}</svg>`;
  downloadBlob(svg, 'slaks-network-map.svg', 'image/svg+xml');
  setNodeStatus(`تم تصدير صورة SVG عالية الدقة: ${NODE_TOTAL} عقدة.`);
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
        const data = { url: link?.url || '', kind: link?.kind || (html ? 'html' : ''), html, searchQuery: hubSearchQuery.value.trim(), searchEngine: hubSearchEngine.value, active: true, savedAt: new Date().toISOString() };
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
      sendNodeFilterIndex();
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

function scheduleNodeFilters(immediate = false) {
  if (filterDebounceTimer) window.clearTimeout(filterDebounceTimer);
  if (filterFrame) cancelAnimationFrame(filterFrame);
  const run = () => {
    filterDebounceTimer = 0;
    filterFrame = requestAnimationFrame(() => { filterFrame = 0; applyNodeFilters(); });
  };
  if (immediate) run();
  else filterDebounceTimer = window.setTimeout(run, FILTER_DEBOUNCE_MS);
}
function jumpToNodeFromSearch() {
  const raw = $('#node-search').value.trim();
  const match = raw.match(/^N[-\s#]*(\d{1,4})$/i) || raw.match(/^(\d{1,4})$/);
  const id = Number(match?.[1]);
  if (!Number.isInteger(id) || id < 1 || id > NODE_TOTAL) {
    setNodeStatus(`اكتب رقم عقدة صحيحًا بين N-001 وN-${NODE_TOTAL}.`, false);
    return;
  }
  $('#node-search').value = '';
  $('#node-search-clear').hidden = true;
  $('#node-filter').value = 'all';
  $('#software-filter').value = 'all';
  $('#level-filter').value = 'all';
  $('#node-search-mode').value = 'all';
  $('#node-sort').value = 'id';
  $('#node-result-limit').value = '16';
  applyNodeFilters();
  const point = nodePositions.get(id);
  const button = nodeButtons.get(id);
  if (!point || !button) return;
  nodeViewport.scrollTo({ left: Math.max(0, point.x * zoom - nodeViewport.clientWidth / 2), top: Math.max(0, point.y * zoom - nodeViewport.clientHeight / 2), behavior: 'smooth' });
  button.classList.add('is-highlighted');
  button.focus({ preventScroll: true });
  window.setTimeout(() => button.classList.remove('is-highlighted'), 1800);
  setNodeStatus(`تم تحديد العقدة ${nodeLabel(id)} ومركزها على الشبكة.`);
}
function showAllNodes() {
  $('#node-search').value = '';
  $('#node-search-clear').hidden = true;
  $('#node-filter').value = 'all';
  $('#software-filter').value = 'all';
  $('#level-filter').value = 'all';
  $('#node-search-mode').value = 'all';
  $('#node-sort').value = 'id';
  $('#node-result-limit').value = '16';
  applyNodeFilters();
  centerMapViewport('smooth');
  setNodeStatus(`يعرض الآن جميع العقد الـ${NODE_TOTAL} في الشبكة.`);
}
function populateLevelFilter() {
  const select = $('#level-filter');
  if (!select) return;
  select.replaceChildren(new Option('كل المستويات', 'all'));
  NODE_LEVELS.forEach((count, level) => {
    select.appendChild(new Option(`المستوى ${level + 1} · ${count} عقدة`, String(level)));
  });
}
function setPipeFlowEnabled(enabled) {
  pipeFlowEnabled = Boolean(enabled);
  if (pipeFlowEnabled) pipeFlowStartedAt = performance.now();
  const toggle = $('#pipe-flow-toggle');
  const status = $('#pipe-flow-status');
  const indicator = document.querySelector('.pipe-flow-indicator');
  if (toggle) {
    toggle.setAttribute('aria-pressed', String(pipeFlowEnabled));
    toggle.textContent = pipeFlowEnabled ? 'إيقاف المضخات' : 'تشغيل المضخات';
  }
  if (status) status.textContent = pipeFlowEnabled ? 'التدفق يعمل عبر الأنابيب الظاهرة' : 'تدفق المعلومات متوقف';
  indicator?.classList.toggle('is-off', !pipeFlowEnabled);
  renderCanvasNetwork();
  if (pipeFlowEnabled) requestPipeFlowFrame();
}
function initializeNetwork() {
  populateLevelFilter();
  restoreUiSettings();
  setupRelationCustomization();
  createNodeElements();
  initializeNodeFilterWorker();
  setupCanvasInteraction();
  nodeViewport.addEventListener('scroll', renderCanvasNetwork, { passive: true });
  setupNodeChatRoom();
  layoutNodes();
  centerMapViewport();
  const observer = new ResizeObserver(scheduleLayout);
  observer.observe(nodeViewport);
  $('#node-search').addEventListener('input', () => {
    $('#node-search-clear').hidden = !$('#node-search').value;
    scheduleNodeFilters();
  });
  $('#node-search-jump').addEventListener('click', jumpToNodeFromSearch);
  $('#node-search').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); jumpToNodeFromSearch(); } });
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
  $('#node-search-mode').addEventListener('change', applyNodeFilters);
  $('#node-sort').addEventListener('change', applyNodeFilters);
  $('#node-result-limit').addEventListener('change', applyNodeFilters);
  $('#pipe-flow-toggle').addEventListener('click', () => setPipeFlowEnabled(!pipeFlowEnabled));
  $('#map-reset').addEventListener('click', () => { zoom = 1; applyZoom(); persistUiSettings(); nodeViewport.scrollTo({ top: 0, left: 0, behavior: 'smooth' }); });
  $('#map-fit').addEventListener('click', () => { zoom = Math.max(.05, Math.min(1, Math.round(Math.min((nodeViewport.clientWidth - 24) / mapWidth, (nodeViewport.clientHeight - 24) / mapHeight) * 10) / 10)); applyZoom(); centerMapViewport('smooth'); persistUiSettings(); });
  $('#map-layout-reset').addEventListener('click', resetNodeLayout);
  $('#show-all-nodes').addEventListener('click', showAllNodes);
  $('#map-root').addEventListener('click', () => {
    const root = nodeButtons.get(1);
    if (!root) return;
    $('#node-search').value = '';
    $('#node-filter').value = 'all';
    $('#software-filter').value = 'all';
    $('#level-filter').value = 'all';
    applyNodeFilters();
    nodeViewport.scrollTo({ top: 0, left: Math.max(0, (mapWidth - nodeViewport.clientWidth) / 2), behavior: 'smooth' });
    root.focus({ preventScroll: true });
  });
  $('#export-nodes').addEventListener('click', exportNodes);
  $('#export-map-json').addEventListener('click', exportNetworkMapJson);
  $('#export-map-svg').addEventListener('click', exportNetworkMapSvg);
  $('#import-nodes').addEventListener('click', () => $('#node-import-file').click());
  $('#node-import-file').addEventListener('change', (event) => {
    importNodes(event.target.files?.[0]);
    event.target.value = '';
  });
  showAllNodes();
  setPipeFlowEnabled(true);
}

function setupHubModal() {
  $('#hub-close').addEventListener('click', closeHub);
  $('#hub-build').addEventListener('click', () => buildHub());
  $('#hub-search').addEventListener('click', searchWithSelectedEngine);
  $('#hub-search-all').addEventListener('click', searchEverywhere);
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
  window.addEventListener('message', (event) => {
    if (event.source !== hubPreview.contentWindow || event.data?.type !== 'hub-preview-url') return;
    const nextUrl = String(event.data.url || '');
    try {
      const parsed = parseNodeLink(nextUrl);
      if (parsed.kind !== 'web') return;
      hubUrl.value = parsed.url;
      buildHub();
    } catch { setHubStatus('تعذر فتح نتيجة المقال داخل المعاينة.', false); }
  });
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

function setupPinchZoom() {
  const viewport = $('#node-viewport');
  if (!viewport) return;
  let gesture = null;
  const distance = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  const midpoint = (a, b) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });
  viewport.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 2) return;
    // Reserve the two-finger gesture for the map instead of page navigation
    // or browser zoom, while leaving one-finger scrolling unchanged.
    event.preventDefault();
    const [first, second] = event.touches;
    const center = midpoint(first, second);
    const rect = viewport.getBoundingClientRect();
    viewport.style.touchAction = 'none';
    gesture = {
      startDistance: Math.max(1, distance(first, second)),
      startZoom: zoom,
      worldX: (center.x - rect.left + viewport.scrollLeft) / zoom,
      worldY: (center.y - rect.top + viewport.scrollTop) / zoom
    };
  }, { passive: true });
  viewport.addEventListener('touchmove', (event) => {
    if (!gesture || event.touches.length !== 2) return;
    event.preventDefault();
    const [first, second] = event.touches;
    const center = midpoint(first, second);
    const rect = viewport.getBoundingClientRect();
    zoom = Math.max(.05, Math.min(1.5, Math.round((gesture.startZoom * distance(first, second) / gesture.startDistance) * 100) / 100));
    applyZoom();
    viewport.scrollLeft = Math.max(0, gesture.worldX * zoom - (center.x - rect.left));
    viewport.scrollTop = Math.max(0, gesture.worldY * zoom - (center.y - rect.top));
  }, { passive: false });
  const endGesture = (event) => {
    if (event.touches.length < 2 && gesture) {
      gesture = null;
      viewport.style.touchAction = 'pan-x pan-y';
      persistUiSettings();
    }
  };
  viewport.addEventListener('touchend', endGesture, { passive: true });
  viewport.addEventListener('touchcancel', endGesture, { passive: true });
}

function digitalRootBigInt(value) {
  const absolute = value < 0n ? -value : value;
  if (absolute === 0n) return 0n;
  const remainder = absolute % 9n;
  return remainder === 0n ? 9n : remainder;
}
function formatBigInt(value) {
  return value.toString();
}
let mod9AnalyzeCurrent = null;
function inspectNodeAlgebraically(nodeNumber, nodeName, nodeAbjad) {
  const input = $('#mod9-input');
  const context = $('#mod9-context');
  if (!input || !context) {
    console.warn('[Mod 9] حقل التحليل غير موجود.');
    return;
  }
  const valueToInject = String(nodeAbjad || nodeNumber || '');
  input.value = valueToInject;
  context.value = 'active-node';
  const option = context.querySelector('option[value="active-node"]');
  if (option) option.textContent = `العقدة النشطة N-${String(nodeNumber).padStart(3, '0')} · ${nodeName || 'بدون اسم'}`;
  const help = $('#mod9-help');
  if (help) help.textContent = `السياق النشط: ${nodeName || 'بدون اسم'} · الرقم ${nodeNumber} · قيمة التحليل ${valueToInject}.`;
  mod9AnalyzeCurrent?.();
  console.log(`[فحص جبري نشط] العقدة: ${nodeName || 'Unnamed Node'} | الرقم: ${nodeNumber} | القيمة: ${valueToInject}`);
}
function setMod9NodeContext(id) {
  const metric = quranMetricForNode(id);
  inspectNodeAlgebraically(id, metric.surah_name, metric.abjad_value);
}
function setupMod9Lab() {
  const input = $('#mod9-input');
  const context = $('#mod9-context');
  const run = $('#mod9-run');
  const results = $('#mod9-results');
  if (!input || !context || !run || !results) return;
  const presetValues = { year: '2025', levels: '114', nodes: '6600', fatiha: '525' };
  const renderOperation = (name, expression, value, exact = true) => {
    const row = document.createElement('div');
    row.className = 'mod9-operation';
    const title = document.createElement('strong');
    title.textContent = name;
    const calculation = document.createElement('code');
    calculation.textContent = expression;
    const root = document.createElement('span');
    root.className = `mod9-root${exact && digitalRootBigInt(value) === 9n ? '' : ' is-neutral'}`;
    root.textContent = exact ? `الجذر الرقمي: ${digitalRootBigInt(value).toString()}` : 'قسمة غير تامة';
    row.append(title, calculation, root);
    return row;
  };
  const analyze = () => {
    const raw = input.value.trim();
    results.replaceChildren();
    results.removeAttribute('data-state');
    if (!/^-?\d+$/.test(raw)) {
      results.dataset.state = 'error';
      results.textContent = 'الرجاء إدخال عدد صحيح صالح دون كسور أو فواصل.';
      return;
    }
    let number;
    try { number = BigInt(raw); } catch { results.dataset.state = 'error'; results.textContent = 'تعذر قراءة العدد.'; return; }
    const root = digitalRootBigInt(number);
    const summary = document.createElement('div');
    summary.className = 'mod9-summary';
    [['العدد', formatBigInt(number)], ['الجذر الرقمي', root.toString()], ['الباقي Mod 9', (number % 9n).toString()]].forEach(([label, value]) => {
      const item = document.createElement('span'); item.textContent = `${label}: ${value}`; summary.appendChild(item);
    });
    results.appendChild(summary);
    results.appendChild(renderOperation('الضرب في 9', `${formatBigInt(number)} × 9 = ${formatBigInt(number * 9n)}`, number * 9n));
    results.appendChild(renderOperation('طرح 9', `${formatBigInt(number)} − 9 = ${formatBigInt(number - 9n)}`, number - 9n));
    const divisible = number % 9n === 0n;
    results.appendChild(renderOperation('القسمة على 9', divisible ? `${formatBigInt(number)} ÷ 9 = ${formatBigInt(number / 9n)}` : `${formatBigInt(number)} ÷ 9`, divisible ? number / 9n : 0n, divisible));
    results.appendChild(renderOperation('جمع 9', `${formatBigInt(number)} + 9 = ${formatBigInt(number + 9n)}`, number + 9n));
    const explanation = document.createElement('p');
    explanation.className = 'mod9-explanation';
    explanation.textContent = root === 9n ? 'هذا العدد من مضاعفات 9؛ لذلك تحافظ الإضافة والطرح بمقدار 9 على الصنف نفسه، بينما تكون القسمة على 9 صحيحة.' : 'العدد ليس من مضاعفات 9؛ الإضافة والطرح بمقدار 9 يحافظان على باقي القسمة، لكن الجذر الرقمي لا يكون بالضرورة 9.';
    results.appendChild(explanation);
  };
  mod9AnalyzeCurrent = analyze;
  context.addEventListener('change', () => {
    if (context.value === 'active-node') {
      if (!activeHub?.id) {
        input.value = '2025';
        context.value = 'year';
        const help = $('#mod9-help');
        if (help) help.textContent = 'افتح عقدة من الشبكة أولًا لتفعيل سياق العقدة النشطة.';
      }
    } else if (presetValues[context.value]) {
      input.value = presetValues[context.value];
    }
    analyze();
  });
  input.addEventListener('input', () => {
    if (context.value === 'active-node' || context.value !== 'manual') context.value = 'manual';
    analyze();
  });
  run.addEventListener('click', analyze);
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') analyze(); });
  analyze();
}
function setupSovereignDashboard() {
  const lines = [...document.querySelectorAll('[data-agent-line]')];
  const radar = $('#surah-radar');
  const name = $('#radar-name');
  const details = $('#radar-details');
  const indexLabel = $('#radar-index');
  const meter = $('#radar-meter-fill');
  const status = $('#agent-code-status');
  if (!lines.length || !radar || !name || !details || !indexLabel || !meter) return;
  let lineIndex = 0;
  let surahIndex = 0;
  const update = () => {
    lines.forEach((line, index) => line.classList.toggle('is-active', index === lineIndex));
    const surah = QURAN_SURAH_METRICS[surahIndex % QURAN_SURAH_METRICS.length];
    name.textContent = `سورة ${surah.surah_name} (${surah.surah_number})`;
    details.textContent = `الآيات: ${surah.ayahs_count} · النوع: ${surah.type} · الجذر المركب: ${surah.combined_root} · الجمل: ${surah.abjad_value}`;
    radar.dataset.nodeNumber = String(surah.surah_number);
    radar.dataset.nodeName = surah.surah_name;
    radar.dataset.nodeAbjad = String(surah.abjad_value);
    indexLabel.textContent = `${surah.surah_number} / ${QURAN_SURAH_METRICS.length}`;
    meter.style.width = `${Math.max(1, Math.round(surah.surah_number / QURAN_SURAH_METRICS.length * 100))}%`;
    status.textContent = `الدورة ${lineIndex + 1}/5 · الرادار يقرأ السجل ${surah.surah_number} محليًا.`;
    lineIndex = (lineIndex + 1) % lines.length;
    surahIndex = (surahIndex + 1) % QURAN_SURAH_METRICS.length;
  };
  const inspectRadar = () => inspectNodeAlgebraically(radar.dataset.nodeNumber, radar.dataset.nodeName, radar.dataset.nodeAbjad);
  radar.addEventListener('click', inspectRadar);
  radar.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); inspectRadar(); } });
  update();
  window.setInterval(update, 1400);
}

function setupActions() {
  $('#collect-report').addEventListener('click', collectReport);
  $('#clear-report-cache').addEventListener('click', clearReportCache);
  refreshReportCacheStatus();
  $('#export-report').addEventListener('click', exportReport);
  setupHubModal();
  setupPinchZoom();
  setupValidator();
  setupMobileNavigation();
  setupExternalLinkModal();
  setupOrbit();
  setupMod9Lab();
  setupSovereignDashboard();
  // تشغيل نفق المعلومات تلقائيًا عند وجود عقد مهيأة، دون طلب إضافي من المستخدم.
  window.setTimeout(() => collectReport(), 250);
}

initializeNetwork();
setupActions();
