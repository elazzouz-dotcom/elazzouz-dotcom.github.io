const CATEGORIES = {
  checkbox: ['checkbox'], check: ['check'], timer: ['timer'],
  time: ['time', 'clock', 'history', 'calendar', 'reset'],
  money: ['coin', 'money', 'wallet', 'gift'], reward: ['trophy', 'medal', 'star', 'target', 'flag'],
  media: ['play', 'pause'], alert: ['bell']
};
const DEFAULT_ICONS = [
  { name: 'CheckIcon', use_for: ['confirm', 'selected', 'verified'] },
  { name: 'CheckboxEmptyIcon', use_for: ['multi-select', 'form checkbox'] },
  { name: 'CheckboxInIcon', use_for: ['multi-select', 'form checkbox'] },
  { name: 'HistoryIcon', use_for: ['navigation related action'] },
  { name: 'PauseIcon', use_for: ['pause playback', 'pause process'] },
  { name: 'PlayIcon', use_for: ['media related action'] }
];
const STORAGE_KEY = 'platform-suite-icon-search-data-v1';
let icons = loadSavedIcons() || DEFAULT_ICONS.slice();
let activeCategory = 'all', lastResults = [], sortMode = 'name';
const $ = id => document.getElementById(id);

function loadSavedIcons() { try { const value = JSON.parse(localStorage.getItem(STORAGE_KEY)); return Array.isArray(value) && value.length ? value : null; } catch { return null; } }
function saveIcons() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(icons)); } catch { $('notice').textContent = 'تعذر الحفظ المحلي؛ الملف كبير جدًا.'; } }
function tokenize(name) { return String(name || '').match(/[A-Z][a-z]*|[a-z]+|\d+/g)?.map(x => x.toLowerCase()) || []; }
function getCategory(name) { const tokens = tokenize(name); for (const [cat, words] of Object.entries(CATEGORIES)) if (words.some(word => tokens.includes(word))) return cat; return 'other'; }
function getCategories(name) { const tokens = tokenize(name), found = []; for (const [cat, words] of Object.entries(CATEGORIES)) if (words.some(word => tokens.includes(word))) found.push(cat); return found.length ? found : ['other']; }
function normalized(icon) { const name = String(icon.name || ''); const use = Array.isArray(icon.use_for) ? icon.use_for : [String(icon.use_for || '')].filter(Boolean); return { name, category: getCategory(name), categories: getCategories(name), use_for: use, file: icon.file }; }
function searchIcons(query) {
  const q = String(query || '').trim().toLowerCase();
  const results = icons.map(normalized).filter(item => (activeCategory === 'all' || item.category === activeCategory) && (!q || item.name.toLowerCase().includes(q) || tokenize(item.name).includes(q) || item.use_for.join(' ').toLowerCase().includes(q)));
  return results.sort((a, b) => sortMode === 'category' ? `${a.category}${a.name}`.localeCompare(`${b.category}${b.name}`) : a.name.localeCompare(b.name));
}
function groups() { return [...new Set(icons.map(x => getCategory(x.name)))].sort(); }
function renderCategories() { const cats = groups(); $('categories').innerHTML = '<button class="chip ' + (activeCategory === 'all' ? 'on' : '') + '" data-cat="all">الكل</button>' + cats.map(cat => `<button class="chip ${activeCategory === cat ? 'on' : ''}" data-cat="${cat}">${cat}</button>`).join(''); $('categories').querySelectorAll('[data-cat]').forEach(btn => btn.onclick = () => { activeCategory = btn.dataset.cat; renderCategories(); render(); }); }
function render() { lastResults = searchIcons($('query').value); $('total').textContent = icons.length; $('shown').textContent = lastResults.length; $('groups').textContent = groups().length; $('results').innerHTML = lastResults.length ? lastResults.map(item => `<article class="result"><div><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.use_for.join(' · ') || 'بدون وصف')}</small></div><span class="badge">${item.category}</span></article>`).join('') : '<div class="empty">ما لقا حتى نتيجة. جرّب كلمة أخرى أو الفئة «الكل».</div>'; }
function escapeHtml(x) { return String(x || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function classify(data) { if (Array.isArray(data)) return data; if (data && Array.isArray(data.icons)) return data.icons; if (data && typeof data === 'object') { const grouped = []; for (const [category, items] of Object.entries(data)) { if (!Array.isArray(items)) continue; for (const item of items) if (item && item.name) grouped.push({ ...item, category: item.category || category, categories: item.categories || [category] }); } if (grouped.length) return grouped; } throw new Error('manifest خاصو يكون لائحة، object فيه icons، أو JSON مجمّع حسب الفئات'); }
async function importFile(file) { try { const loaded = classify(JSON.parse(await file.text())).filter(x => x && x.name); if (!loaded.length) throw new Error('ما لقا حتى أيقونة صالحة'); icons = loaded; activeCategory = 'all'; saveIcons(); $('notice').textContent = `تم تحميل وحفظ ${icons.length} أيقونة محليًا.`; renderCategories(); render(); } catch (err) { $('notice').textContent = 'تعذر قراءة الملف: ' + err.message; } }
function csvEscape(value) { const text = String(value ?? ''); return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text; }
function download(name, content, type) { const blob = new Blob([content], { type }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 500); }

$('searchBtn').onclick = render; $('query').oninput = render; $('query').onkeydown = e => { if (e.key === 'Enter') render(); };
$('sortMode').onchange = e => { sortMode = e.target.value; render(); };
$('loadBtn').onclick = () => $('fileInput').click();
$('fileInput').onchange = async e => { if (e.target.files?.[0]) await importFile(e.target.files[0]); e.target.value = ''; };
$('dropZone').ondragover = e => { e.preventDefault(); $('dropZone').classList.add('drag'); };
$('dropZone').ondragleave = () => $('dropZone').classList.remove('drag');
$('dropZone').ondrop = async e => { e.preventDefault(); $('dropZone').classList.remove('drag'); const file = [...e.dataTransfer.files].find(f => f.name.endsWith('.json') || f.type.includes('json')); if (file) await importFile(file); else $('notice').textContent = 'أفلت ملف JSON فقط.'; };
$('clearBtn').onclick = () => { localStorage.removeItem(STORAGE_KEY); icons = DEFAULT_ICONS.slice(); activeCategory = 'all'; $('notice').textContent = 'تم مسح البيانات المحفوظة والرجوع للأمثلة.'; renderCategories(); render(); };
$('exportBtn').onclick = () => { const grouped = {}; for (const item of icons.map(normalized)) (grouped[item.category] ??= []).push(item); download('icons-grouped.json', JSON.stringify(grouped, null, 2), 'application/json'); };
$('exportCsvBtn').onclick = () => { const rows = lastResults.length ? lastResults : icons.map(normalized); const header = ['name', 'category', 'categories', 'use_for', 'file']; const csv = '\ufeff' + [header, ...rows.map(item => [item.name, item.category, item.categories.join(' | '), item.use_for.join(' | '), item.file || ''])].map(row => row.map(csvEscape).join(',')).join('\n'); download('icons-results.csv', csv, 'text/csv;charset=utf-8'); };
if (localStorage.getItem(STORAGE_KEY)) $('notice').textContent = `تم استرجاع ${icons.length} أيقونة محفوظة من آخر زيارة.`;
renderCategories(); render();
