const CIVIL = new Set([2, 3, 4, 5, 8, 9, 13, 22, 24, 33, 47, 48, 49, 55, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 76, 98, 99, 110]);
const ABJAD = { 'أ': 1, 'إ': 1, 'آ': 1, 'ا': 1, 'ب': 2, 'ج': 3, 'د': 4, 'ه': 5, 'ة': 5, 'و': 6, 'ؤ': 6, 'ز': 7, 'ح': 8, 'ط': 9, 'ي': 10, 'ئ': 10, 'ى': 10, 'ك': 20, 'ل': 30, 'م': 40, 'ن': 50, 'س': 60, 'ع': 70, 'ف': 80, 'ص': 90, 'ق': 100, 'ر': 200, 'ش': 300, 'ت': 400, 'ث': 500, 'خ': 600, 'ذ': 700, 'ض': 800, 'ظ': 900, 'غ': 1000 };
const $ = (selector) => document.querySelector(selector);
const root = (value) => { let number = Math.abs(Math.floor(value)); while (number >= 10) number = String(number).split('').reduce((sum, digit) => sum + Number(digit), 0); return number; };
const abjad = (text) => [...text.replace(/\s/g, '')].reduce((sum, character) => sum + (ABJAD[character] || 0), 0);
const ROWS = SURAHS.map((surah) => { const value = abjad(surah.name); return { ...surah, type: CIVIL.has(surah.number) ? 'مدنية' : 'مكية', numberRoot: root(surah.number), ayahsRoot: root(surah.ayahs), combinedRoot: root(surah.number + surah.ayahs), abjadValue: value, abjadRoot: root(value) }; });
const modeKey = (mode) => ({ combined: 'combinedRoot', number: 'numberRoot', ayahs: 'ayahsRoot', abjad: 'abjadRoot' }[mode] || 'combinedRoot');
let currentMode = 'combined';
let latest = {};
let simulationToken = 0;
let simulationPaused = false;
let liveChartState = null;

function chiSquared(rows, mode) {
  const key = modeKey(mode);
  const groups = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((r) => {
    const set = rows.filter((row) => row[key] === r);
    return { r, all: set.length, civil: set.filter((row) => row.type === 'مدنية').length, makki: set.filter((row) => row.type === 'مكية').length };
  }).filter((group) => group.all);
  const civil = rows.filter((row) => row.type === 'مدنية').length;
  const total = rows.length;
  const makki = total - civil;
  let value = 0;
  groups.forEach((group) => {
    const expectedCivil = group.all * civil / total;
    const expectedMakki = group.all * makki / total;
    if (expectedCivil) value += (group.civil - expectedCivil) ** 2 / expectedCivil;
    if (expectedMakki) value += (group.makki - expectedMakki) ** 2 / expectedMakki;
  });
  return { groups, value, civil, total, df: groups.length - 1, key };
}

function cramer(test) { return Math.sqrt(test.value / (test.total * (Math.min(test.groups.length, 2) - 1))); }
function seeded(seed = 12345) { let value = seed >>> 0; return () => { value ^= value << 13; value ^= value >>> 17; value ^= value << 5; return (value >>> 0) / 4294967296; }; }
function renderMetrics(test) { $('#total').textContent = ROWS.length; $('#civil').textContent = test.civil; $('#chi2').textContent = test.value.toFixed(3); $('#cramer').textContent = cramer(test).toFixed(3); }

function renderChart(test) {
  const host = $('#root-chart');
  host.innerHTML = '';
  const max = Math.max(...test.groups.map((group) => group.all));
  test.groups.forEach((group) => {
    const row = document.createElement('div'); row.className = 'root-row';
    const label = document.createElement('b'); label.className = 'root-label'; label.textContent = group.r;
    const bars = document.createElement('div'); bars.className = 'bars';
    const makki = document.createElement('i'); makki.className = 'makki'; makki.style.width = `${group.makki / max * 100}%`;
    const madani = document.createElement('i'); madani.className = 'madani'; madani.style.width = `${group.civil / max * 100}%`;
    bars.append(makki, madani);
    const count = document.createElement('span'); count.className = 'root-count'; count.textContent = `${group.makki} مكية · ${group.civil} مدنية`;
    row.append(label, bars, count); host.append(row);
  });
}

function renderTable() {
  const needle = ($('#search').value || '').trim();
  const body = $('#surah-table');
  const rows = ROWS.filter((row) => !needle || `${row.number} ${row.name}`.includes(needle));
  body.innerHTML = '';
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    const typeClass = row.type === 'مدنية' ? 'civil' : 'makki';
    tr.innerHTML = `<td>${row.number}</td><td><strong>${row.name}</strong></td><td><span class="type ${typeClass}">${row.type}</span></td><td>${row.ayahs}</td><td>${row.combinedRoot}</td><td>${row.abjadValue}</td><td>${row.abjadRoot}</td>`;
    body.append(tr);
  });
  $('#table-count').textContent = `عرض ${rows.length} من ${ROWS.length} سورة`;
}

async function renderKruskal() {
  const body = $('#kruskal-table');
  try {
    const report = await fetch('/analysis/quran_analysis_report.json', { cache: 'no-cache' }).then((response) => response.json());
    const labels = { surah_number: 'رقم السورة', ayahs_count: 'عدد الآيات', combined_value: 'القيمة المركبة', abjad_value: 'قيمة الجمل' };
    body.innerHTML = Object.entries(report.kruskal_wallis || {}).map(([key, item]) => {
      const metrics = item.statistical_metrics;
      return `<tr><td>${labels[key] || key}</td><td>${metrics.H_statistic.toFixed(4)}</td><td>${metrics.degrees_of_freedom}</td><td class="${metrics.p_value < .05 ? 'significant' : ''}">${metrics.p_value.toFixed(5)}</td><td>${metrics.epsilon_squared.toFixed(4)}</td></tr>`;
    }).join('') || '<tr><td colspan="5">لا توجد نتائج محفوظة.</td></tr>';
  } catch (error) {
    body.innerHTML = '<tr><td colspan="5">تعذر تحميل التقرير المحفوظ.</td></tr>';
  }
}

function setProgress(value) { $('#progress-bar').style.width = `${Math.min(100, value)}%`; }
function setLiveCounter(id, value) { const element = $(`#${id}`); if (element) element.textContent = value; }
function sleep(milliseconds) { return new Promise((resolve) => window.setTimeout(resolve, milliseconds)); }

function drawExceedanceChart(bins, chartMax, observed, done, total, exceed) {
  const canvas = $('#exceedance-chart');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, Math.floor(rect.width || canvas.parentElement.clientWidth || 640));
  const height = Math.max(230, Math.floor(rect.height || 280));
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = width * ratio; canvas.height = height * ratio;
  const context = canvas.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  const padding = { top: 18, right: 18, bottom: 38, left: 42 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxCount = Math.max(1, ...bins);
  context.font = '11px IBM Plex Sans Arabic, Tahoma, sans-serif';
  context.strokeStyle = '#d8e5df'; context.lineWidth = 1;
  context.beginPath(); context.moveTo(padding.left, padding.top); context.lineTo(padding.left, height - padding.bottom); context.lineTo(width - padding.right, height - padding.bottom); context.stroke();
  bins.forEach((count, index) => {
    const barWidth = plotWidth / bins.length;
    const barHeight = count / maxCount * plotHeight;
    const x = padding.left + index * barWidth + 1;
    const y = height - padding.bottom - barHeight;
    context.fillStyle = count && index >= Math.floor(observed / chartMax * bins.length) ? '#d5a04b' : '#5eb596';
    context.fillRect(x, y, Math.max(1, barWidth - 2), barHeight);
  });
  const observedX = padding.left + Math.min(1, observed / chartMax) * plotWidth;
  context.strokeStyle = '#193d50'; context.lineWidth = 2; context.setLineDash([5, 4]);
  context.beginPath(); context.moveTo(observedX, padding.top); context.lineTo(observedX, height - padding.bottom); context.stroke(); context.setLineDash([]);
  context.fillStyle = '#193d50'; context.textAlign = 'center'; context.fillText(`القيمة المرصودة ${observed.toFixed(2)}`, Math.min(width - 80, Math.max(85, observedX)), 13);
  context.fillStyle = '#6d8580'; context.textAlign = 'left'; context.fillText('0', padding.left, height - 12); context.textAlign = 'right'; context.fillText(chartMax.toFixed(1), width - padding.right, height - 12);
  context.textAlign = 'center'; context.fillText(`توزيع إحصاءات المحاكاة · ${done.toLocaleString('ar')} / ${total.toLocaleString('ar')} · تجاوزات ${exceed.toLocaleString('ar')}`, width / 2, height - 12);
  canvas.setAttribute('aria-label', `رسم حي لتوزيع ${done} من ${total} محاكاة. عدد التجاوزات ${exceed}. القيمة المرصودة ${observed.toFixed(3)}.`);
  const summary = $('#live-chart-summary');
  if (summary) summary.textContent = `الأعمدة الخضراء تمثل الإحصاءات الأقل من القيمة المرصودة، والذهبية تمثل التجاوزات. القيمة المرصودة χ²=${observed.toFixed(4)}.`;
}

function updateLiveCounters(done, total, exceed, observed) {
  const p = done ? (exceed + 1) / (done + 1) : 0;
  const se = done ? Math.sqrt(p * (1 - p) / done) : 0;
  setLiveCounter('live-done', `${done.toLocaleString('ar')} / ${total.toLocaleString('ar')}`);
  setLiveCounter('live-exceed', exceed.toLocaleString('ar'));
  setLiveCounter('live-pvalue', done ? p.toFixed(5) : '—');
  setLiveCounter('live-se', done ? se.toFixed(5) : '—');
  setLiveCounter('live-observed', observed.toFixed(4));
}

async function simulate(total, test, token) {
  const rand = seeded(12345);
  const order = Array.from({ length: test.total }, (_, index) => index);
  const bins = new Uint32Array(48);
  const chartMax = Math.max(test.value * 1.8, test.df * 4, 10);
  liveChartState = { bins, chartMax, observed: test.value, done: 0, total, exceed: 0 };
  let exceed = 0;
  let done = 0;
  const chunk = 250;
  $('#run-test').disabled = true;
  $('#simulation-toggle').disabled = false;
  $('#simulation-toggle').textContent = 'إيقاف مؤقت';
  updateLiveCounters(0, total, 0, test.value);
  drawExceedanceChart(bins, chartMax, test.value, 0, total, 0);

  for (let begin = 0; begin < total; begin += chunk) {
    const end = Math.min(total, begin + chunk);
    for (let simulation = begin; simulation < end; simulation += 1) {
      while (simulationPaused && token === simulationToken) {
        $('#test-status').textContent = 'المحاكاة متوقفة مؤقتًا؛ اضغط «متابعة» للاستكمال.';
        await sleep(100);
      }
      if (token !== simulationToken) return;
      for (let index = order.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(rand() * (index + 1));
        [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
      }
      const civilByRoot = new Map(test.groups.map((group) => [group.r, 0]));
      for (let index = 0; index < test.civil; index += 1) {
        const row = ROWS[order[index]];
        const group = test.groups.find((candidate) => candidate.r === row[test.key]);
        if (group) civilByRoot.set(group.r, civilByRoot.get(group.r) + 1);
      }
      let statistic = 0;
      test.groups.forEach((group) => {
        const expectedCivil = group.all * test.civil / test.total;
        const expectedMakki = group.all * (test.total - test.civil) / test.total;
        const civil = civilByRoot.get(group.r) || 0;
        const makki = group.all - civil;
        if (expectedCivil) statistic += (civil - expectedCivil) ** 2 / expectedCivil;
        if (expectedMakki) statistic += (makki - expectedMakki) ** 2 / expectedMakki;
      });
      if (statistic >= test.value) exceed += 1;
      const bin = Math.min(bins.length - 1, Math.floor(Math.max(0, statistic) / chartMax * bins.length));
      bins[bin] += 1;
    }
    done = end;
    liveChartState.done = done;
    liveChartState.exceed = exceed;
    setProgress(done / total * 100);
    updateLiveCounters(done, total, exceed, test.value);
    drawExceedanceChart(bins, chartMax, test.value, done, total, exceed);
    $('#test-status').textContent = `جاري المحاكاة: ${done.toLocaleString('ar')} من ${total.toLocaleString('ar')}`;
    await new Promise(requestAnimationFrame);
  }
  if (token !== simulationToken) return;
  const p = (exceed + 1) / (total + 1);
  $('#pvalue').textContent = p.toFixed(5);
  $('#sim-label').textContent = `${total.toLocaleString('ar')} دورة · SE ${(Math.sqrt(p * (1 - p) / total)).toFixed(5)} · seed 12345 / معاينة حتمية`;
  $('#test-status').textContent = `اكتملت المحاكاة: ${exceed.toLocaleString('ar')} نتائج مساوية أو أكبر من المرصود.`;
  $('#conclusion-text').textContent = p < .05 ? `ظهرت إشارة تستحق الفحص الإضافي (p=${p.toFixed(5)}). هذه نتيجة استكشافية لا تثبت سببًا أو دلالة دينية.` : `لم يظهر دليل إحصائي كافٍ على ارتباط عند مستوى 0.05 (p=${p.toFixed(5)}). هذا لا يثبت العشوائية المطلقة ولا ينفي أي معنى ديني.`;
  $('#run-test').disabled = false;
  $('#simulation-toggle').disabled = true;
  $('#simulation-toggle').textContent = 'إيقاف مؤقت';
}

function run() {
  simulationToken += 1;
  simulationPaused = false;
  currentMode = $('#type-mode').value;
  const test = chiSquared(ROWS, currentMode);
  latest = test;
  renderMetrics(test);
  renderChart(test);
  const total = Number($('#simulations').value);
  setProgress(0);
  simulate(total, test, simulationToken);
}

function init() {
  renderTable();
  renderKruskal();
  $('#search').addEventListener('input', renderTable);
  $('#type-mode').addEventListener('change', run);
  $('#simulations').addEventListener('change', run);
  $('#run-test').addEventListener('click', run);
  $('#simulation-toggle').addEventListener('click', () => {
    simulationPaused = !simulationPaused;
    $('#simulation-toggle').textContent = simulationPaused ? 'متابعة' : 'إيقاف مؤقت';
  });
  window.addEventListener('resize', () => { if (liveChartState) drawExceedanceChart(liveChartState.bins, liveChartState.chartMax, liveChartState.observed, liveChartState.done, liveChartState.total, liveChartState.exceed); });
  run();
}

document.addEventListener('DOMContentLoaded', init);
