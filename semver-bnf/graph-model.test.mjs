import test from 'node:test';
import assert from 'node:assert/strict';
import { NODE_LEVELS, NODE_TOTAL, getNodeChildren, getNodeLevelInfo, getNodeParent, isPrivateHost, mapConcurrent, parseNodeLink } from './graph-model.mjs';

test('الشبكة تضم 6600 عقدة موزعة على تسعة مستويات', () => {
  assert.deepEqual(NODE_LEVELS, [1, 3, 9, 27, 81, 243, 729, 2187, 3320]);
  assert.equal(NODE_TOTAL, 6600);
  assert.equal(getNodeLevelInfo(200).level, 5);
  assert.equal(getNodeLevelInfo(0), null);
});

test('لكل عقدة غير الجذر أب سابق صالح ولا توجد حلقات ذاتية', () => {
  assert.equal(getNodeParent(1), null);
  assert.equal(getNodeParent(2), 1);
  assert.equal(getNodeParent(5), 2);
  assert.equal(getNodeParent(14), 5);
  assert.equal(getNodeParent(200), 67);
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

test('أبناء العقد تتبع البنية الثلاثية ولا تتجاوز 6600 عقدة', () => {
  assert.deepEqual(getNodeChildren(1), [2, 3, 4]);
  assert.deepEqual(getNodeChildren(2), [5, 6, 7]);
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

test('روابط التطبيقات الخارجية الآمنة تمررها للنظام أو المتصفح', () => {
  assert.equal(parseNodeLink('sms:+12025550123').kind, 'app');
  assert.equal(parseNodeLink('whatsapp://send?text=hello').kind, 'app');
  assert.equal(parseNodeLink('tg://resolve?domain=slaks').kind, 'app');
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
