import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { NODE_LEVELS, NODE_TOTAL, getNodeChildren, getNodeLevelInfo, getNodeParent, isPrivateHost, mapConcurrent, parseNodeLink } from './graph-model.mjs';
import { BUILTIN_NODES } from './builtin-nodes.mjs';

const require = createRequire(import.meta.url);
const SwarmModel = require('./swarm-simulation/swarm-simulation-model.js');
const { NumpyPCG64 } = require('./swarm-simulation/numpy-pcg64.js');

test('الشبكة تضم 6600 عقدة بمستويات متزايدة تبدأ من 1 ثم 2 ثم 3', () => {
  assert.deepEqual(NODE_LEVELS.slice(0, 6), [1, 2, 3, 4, 5, 6]);
  assert.equal(NODE_LEVELS.length, 114);
  assert.equal(NODE_LEVELS.at(-1), 159);
  assert.equal(NODE_TOTAL, 6600);
  assert.equal(getNodeLevelInfo(200).level, 19);
  assert.equal(getNodeLevelInfo(0), null);
});

test('محاكاة السرب مدمجة في العقدة الطرفية 6600 دون توسيع الشبكة أو الاتصال بالشبكة', async () => {
  const node = BUILTIN_NODES[6600];
  assert.equal(NODE_TOTAL, 6600);
  assert.equal(getNodeChildren(6600).length, 0);
  assert.equal(node.kind, 'local-tool');
  assert.equal(node.label, 'محاكاة السرب المتوازن');
  assert.equal(node.url, 'https://elazzouz-dotcom.github.io/semver-bnf/swarm-simulation/');

  const page = await readFile(new URL('./swarm-simulation/index.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('./swarm-simulation/swarm-simulation.js', import.meta.url), 'utf8');
  const modelSource = await readFile(new URL('./swarm-simulation/swarm-simulation-model.js', import.meta.url), 'utf8');
  const rngSource = await readFile(new URL('./swarm-simulation/numpy-pcg64.js', import.meta.url), 'utf8');
  assert.match(page, /<html lang="ar" dir="rtl">/);
  assert.match(page, /محاكاة تعليمية فقط/);
  assert.match(page, /تسلسل NumPy PCG64 بالبذرة 12345/);
  assert.ok(page.indexOf('numpy-pcg64.js') < page.indexOf('swarm-simulation-model.js'));
  assert.ok(page.indexOf('swarm-simulation-model.js') < page.indexOf('swarm-simulation.js'));
  assert.match(page, /swarm-simulation-model\.js/);
  assert.match(modelSource, /MAX_AGENTS = 300/);
  assert.doesNotMatch(script, /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource/);
  assert.doesNotMatch(modelSource, /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource/);
  assert.doesNotMatch(`${script}\n${modelSource}\n${rngSource}`, /Math\.random\s*\(/);
  assert.doesNotMatch(rngSource, /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource/);
});

// Expected state and stream values verified against NumPy 2.5.4.
test('PCG64 بالبذرة 12345 يطابق حالة NumPy وrandom_raw وGenerator.random', () => {
  const rawRng = new NumpyPCG64(12345);
  const state = rawRng.getState();
  assert.equal(state.state, 33261208707367790463622745601869196757n);
  assert.equal(state.inc, 268209174141567072605526753992732310247n);
  assert.deepEqual(Array.from({ length: 12 }, () => rawRng.nextUint64()), [
    4193609425186963869n,
    5843160025838961886n,
    14708796524633321433n,
    12474696839993944336n,
    7214697784736971533n,
    6139333351517228867n,
    11036848454483043741n,
    3444637731644279391n,
    12410158567978999341n,
    17373196423520889855n,
    4579325165166831839n,
    17503767764235957903n
  ]);

  const floatRng = new NumpyPCG64(12345);
  assert.deepEqual(Array.from({ length: 12 }, () => floatRng.random()), [
    0.22733602246716966,
    0.31675833970975287,
    0.7973654573327341,
    0.6762546707509746,
    0.391109550601909,
    0.33281392786638453,
    0.5983087535871898,
    0.18673418560371335,
    0.6727560440146213,
    0.9418028652699372,
    0.248245714629571,
    0.9488811518333182
  ]);
  const first = new NumpyPCG64(12345).random();
  floatRng.reset();
  assert.equal(floatRng.random(), first);
});

test('مقياس توازن الأدوار يعكس التوزيع لا قيمة عشوائية', () => {
  assert.equal(SwarmModel.calculateBalancePercent({ explore: 19, inspect: 19, protect: 19 }), 100);
  assert.equal(SwarmModel.calculateBalancePercent({ explore: 57, inspect: 0, protect: 0 }), 0);
  assert.ok(SwarmModel.calculateBalancePercent({ explore: 34, inspect: 12, protect: 11 }) < 100);
});

test('توزيع السيناريوهات وحدود الوكلاء ثابتة ضمن المجال المحلي', () => {
  assert.equal(SwarmModel.clampAgentCount(1), SwarmModel.MIN_AGENTS);
  assert.equal(SwarmModel.clampAgentCount(301), SwarmModel.MAX_AGENTS);
  assert.equal(SwarmModel.createRoleAssignments(57, 'balanced').length, 57);
  const focused = SwarmModel.countRoles(SwarmModel.createRoleAssignments(57, 'explore-heavy'));
  assert.ok(focused.explore >= 34);
  for (const [scenario, role] of [['inspect-heavy', 'inspect'], ['protect-heavy', 'protect']]) {
    assert.ok(SwarmModel.countRoles(SwarmModel.createRoleAssignments(57, scenario))[role] >= 34);
  }
  assert.throws(() => SwarmModel.createRoleAssignments(57, 'random'), /seeded random source/);
  assert.equal(SwarmModel.createRoleAssignments(57, 'random', () => 0.5).length, 57);
});

test('عينات Gaussian وPoisson والمنتظم قابلة لإعادة الإنتاج وتقترب من إحصاءاتها المتوقعة', () => {
  const uniform = SwarmModel.sampleDistribution(new NumpyPCG64(777n), 'uniform', 5000, { minimum: -2, maximum: 4 });
  const uniformAgain = SwarmModel.sampleDistribution(new NumpyPCG64(777n), 'uniform', 5000, { minimum: -2, maximum: 4 });
  assert.deepEqual(uniformAgain, uniform);
  assert.ok(uniform.every((value) => value >= -2 && value < 4));
  const uniformStats = SwarmModel.summarizeSamples(uniform);
  assert.ok(Math.abs(uniformStats.mean - 1) < 0.08);
  assert.ok(Math.abs(uniformStats.variance - 3) < 0.15);

  const gaussian = SwarmModel.sampleDistribution(new NumpyPCG64(777n), 'gaussian', 5000, { mean: -3, standardDeviation: 2 });
  const gaussianAgain = SwarmModel.sampleDistribution(new NumpyPCG64(777n), 'gaussian', 5000, { mean: -3, standardDeviation: 2 });
  assert.deepEqual(gaussianAgain, gaussian);
  const gaussianStats = SwarmModel.summarizeSamples(gaussian);
  assert.ok(Math.abs(gaussianStats.mean + 3) < 0.12);
  assert.ok(Math.abs(gaussianStats.variance - 4) < 0.3);

  const poisson = SwarmModel.sampleDistribution(new NumpyPCG64(777n), 'poisson', 5000, { lambda: 4.5 });
  const poissonAgain = SwarmModel.sampleDistribution(new NumpyPCG64(777n), 'poisson', 5000, { lambda: 4.5 });
  assert.deepEqual(poissonAgain, poisson);
  assert.ok(poisson.every((value) => Number.isInteger(value) && value >= 0));
  const poissonStats = SwarmModel.summarizeSamples(poisson);
  assert.ok(Math.abs(poissonStats.mean - 4.5) < 0.15);
  assert.ok(Math.abs(poissonStats.variance - 4.5) < 0.35);
  assert.deepEqual(SwarmModel.sampleDistribution(new NumpyPCG64(777n), 'poisson', 20, { lambda: 0 }), Array(20).fill(0));

  const highRatePoisson = SwarmModel.sampleDistribution(new NumpyPCG64(2026n), 'poisson', 5000, { lambda: 100 });
  const highRateStats = SwarmModel.summarizeSamples(highRatePoisson);
  assert.ok(highRatePoisson.every((value) => Number.isInteger(value) && value >= 0));
  assert.ok(Math.abs(highRateStats.mean - 100) < 1.2);
  assert.ok(Math.abs(highRateStats.variance - 100) < 8);
});

test('معاملات التوزيعات وحدود العينات غير الصالحة تُرفض قبل السحب', () => {
  assert.throws(() => SwarmModel.sampleDistribution(new NumpyPCG64(1), 'gaussian', 10, { standardDeviation: -1 }), /standard deviation within/);
  assert.throws(() => SwarmModel.sampleDistribution(new NumpyPCG64(1), 'poisson', 10, { lambda: 101 }), /between 0 and 100/);
  assert.throws(() => SwarmModel.sampleDistribution(new NumpyPCG64(1), 'uniform', 10, { minimum: 2, maximum: 2 }), /above minimum/);
  assert.throws(() => SwarmModel.sampleDistribution(new NumpyPCG64(1), 'uniform', 10, { minimum: -1001, maximum: 1 }), /within ±1000/);
  assert.throws(() => SwarmModel.sampleDistribution(new NumpyPCG64(1), 'gaussian', 10, { mean: 1001 }), /within ±1000/);
  assert.throws(() => SwarmModel.sampleDistribution(new NumpyPCG64(1), 'poisson', 5001, { lambda: 4 }), /Sample count/);
  assert.throws(() => SwarmModel.sampleDistribution(new NumpyPCG64(1), 'binomial', 10), /Distribution must/);
});

test('عناصر واجهة محاكاة السرب تطابق المحددات التي يستعملها السكربت', async () => {
  const page = await readFile(new URL('./swarm-simulation/index.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('./swarm-simulation/swarm-simulation.js', import.meta.url), 'utf8');
  const ids = new Set([...script.matchAll(/(?:\$|querySelector)\(['"]#([\w-]+)['"]\)/g)].map((match) => match[1]));
  assert.ok(ids.size > 10);
  for (const id of ids) assert.match(page, new RegExp(`id="${id}"`), `العنصر #${id} غير موجود في صفحة المحاكاة`);
  assert.match(page, /Generator\.normal\(\).*Generator\.poisson\(\)/);
  assert.match(page, /المختبر مستقل عن حركة السرب/);
  assert.match(script, /const sampleRng = new NumpyPCG64\(seed\)/);
});

test('لكل عقدة غير الجذر أب سابق صالح ولا توجد حلقات ذاتية', () => {
  assert.equal(getNodeParent(1), null);
  assert.equal(getNodeParent(2), 1);
  assert.equal(getNodeParent(5), 2);
  assert.equal(getNodeParent(14), 9);
  let edges = 0;
  for (let id = 2; id <= NODE_TOTAL; id += 1) {
    const parent = getNodeParent(id);
    assert.ok(parent >= 1 && parent < id, `الأب غير صالح للعقدة ${id}`);
    const seen = new Set([id]);
    let cursor = parent;
    while (cursor !== null) {
      assert.ok(!seen.has(cursor), `حلقة في مسار العقدة ${id}`);
      seen.add(cursor);
      cursor = getNodeParent(cursor);
    }
    assert.ok(seen.has(1), `مسار العقدة ${id} لا يصل إلى الجذر`);
    edges += 1;
  }
  assert.equal(edges, NODE_TOTAL - 1);
});

test('أبناء العقد تتبع المستويات المتزايدة ولا تتجاوز 6600 عقدة', () => {
  assert.deepEqual(getNodeChildren(1), [2, 3]);
  assert.deepEqual(getNodeChildren(2), [4, 5]);
  assert.deepEqual(getNodeChildren(6600), []);
  for (let id = 1; id <= NODE_TOTAL; id += 1) {
    for (const child of getNodeChildren(id)) assert.equal(getNodeParent(child), id);
  }
});

test('تطبيع روابط الويب يقبل النطاقات والمسارات والمعلمات', () => {
  assert.equal(parseNodeLink('example.com/a?q=1#top').url, 'https://example.com/a?q=1#top');
  assert.equal(parseNodeLink('http://example.org:8080/path').kind, 'web');
  assert.equal(parseNodeLink('https://مثال.إختبار/مسار').kind, 'web');
});

test('روابط mailto وtel تحفظ للفتح الخارجي فقط', () => {
  assert.equal(parseNodeLink('mailto:hello@example.com').kind, 'mailto');
  assert.equal(parseNodeLink('tel:+1 202 555 0123').kind, 'tel');
  assert.throws(() => parseNodeLink('mailto:hello%ZZ@example.com'));
});

test('روابط غرف Matrix تتحول إلى matrix.to بأمان', () => {
  const room = parseNodeLink('#codeberg-space:matrix.org');
  assert.equal(room.kind, 'matrix');
  assert.equal(room.url, 'https://matrix.to/#/#codeberg-space:matrix.org');
  assert.throws(() => parseNodeLink('#room with spaces:matrix.org'));
});

test('روابط التطبيقات الخارجية الآمنة تمررها للنظام أو المتصفح', () => {
  assert.equal(parseNodeLink('sms:+12025550123').kind, 'app');
  assert.equal(parseNodeLink('whatsapp://send?text=hello').kind, 'app');
  assert.equal(parseNodeLink('tg://resolve?domain=azzouz').kind, 'app');
  assert.equal(parseNodeLink('itms-apps://itunes.apple.com/app/id535886823').kind, 'app');
  assert.throws(() => parseNodeLink('javascript:alert(1)'));
});

test('تُقبل الروابط الطويلة ضمن الحد وتُرفض الروابط المفرطة الطول', () => {
  const accepted = `https://example.com/${'a'.repeat(4000)}`;
  const rejected = `https://example.com/${'a'.repeat(8200)}`;
  assert.equal(parseNodeLink(accepted).kind, 'web');
  assert.throws(() => parseNodeLink(rejected), /8192/);
});

test('ترفض الروابط الخطرة أو عناوين الشبكة الخاصة', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'ftp://example.com']) {
    assert.throws(() => parseNodeLink(value));
  }
  for (const value of ['http://localhost', 'http://127.0.0.1', 'http://192.168.1.1', 'http://[::1]', 'http://[fd00::1]', 'http://user:pass@example.com']) {
    assert.throws(() => parseNodeLink(value));
  }
  assert.equal(isPrivateHost('10.0.0.1'), true);
  assert.equal(isPrivateHost('256.0.0.1'), false);
  assert.throws(() => parseNodeLink('http://256.0.0.1'));
  assert.throws(() => parseNodeLink('https://hhhh/'));
});

test('جمع التقرير يحد عدد المهام المتزامنة', async () => {
  let active = 0;
  let peak = 0;
  const results = await mapConcurrent(Array.from({ length: 30 }, (_, id) => id), 4, async (item) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active -= 1;
    return item * 2;
  });
  assert.equal(peak, 4);
  assert.deepEqual(results.slice(0, 4), [0, 2, 4, 6]);
});
