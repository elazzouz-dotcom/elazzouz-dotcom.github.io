import assert from 'node:assert/strict';

const BASE_NODES = 6_600;
const EXTRA_NODES = 50_000;
const TOTAL_NODES = BASE_NODES + EXTRA_NODES;
const ATTACK_SOURCES = 50_000;
const ATTACK_EVENTS = 1_000_000;
const WINDOW_EVENTS = 50_000;
const GLOBAL_LIMIT_PER_WINDOW = 12_000;
const SOURCE_LIMIT_PER_WINDOW = 4;
const QUEUE_CAPACITY = 8_192;
const DEDUP_CAPACITY = 100_000;

function buildSyntheticNodeExtension() {
  const parents = new Uint32Array(EXTRA_NODES);
  for (let offset = 0; offset < EXTRA_NODES; offset += 1) {
    const id = BASE_NODES + offset + 1;
    const parent = id === 1 ? 0 : 1 + ((id * 1103515245) % (id - 1));
    assert.ok(parent >= 1 && parent < id, `invalid synthetic parent for N-${id}`);
    parents[offset] = parent;
  }
  return parents;
}

function runDistributedResilienceTest() {
  const started = performance.now();
  const syntheticParents = buildSyntheticNodeExtension();
  const queue = [];
  let queueHead = 0;
  const seen = new Map();
  const sourceWindows = new Map();
  let accepted = 0;
  let duplicates = 0;
  let sourceLimited = 0;
  let globallyLimited = 0;
  let queueOverflow = 0;
  let maxQueueDepth = 0;
  let maxSeenSize = 0;
  let globalWindow = -1;
  let globalCount = 0;

  for (let event = 0; event < ATTACK_EVENTS; event += 1) {
    const source = event % ATTACK_SOURCES;
    const window = Math.floor(event / WINDOW_EVENTS);
    const eventId = `${source}:${event % 128}`;
    const oldSeen = seen.get(eventId);
    if (oldSeen !== undefined && oldSeen >= window - 2) {
      duplicates += 1;
      continue;
    }
    seen.set(eventId, window);
    if (seen.size > DEDUP_CAPACITY) {
      const oldestKey = seen.keys().next().value;
      seen.delete(oldestKey);
    }
    maxSeenSize = Math.max(maxSeenSize, seen.size);

    const sourceState = sourceWindows.get(source);
    const sourceCount = sourceState?.window === window ? sourceState.count : 0;
    if (sourceCount >= SOURCE_LIMIT_PER_WINDOW) {
      sourceLimited += 1;
      continue;
    }
    if (globalWindow !== window) {
      globalWindow = window;
      globalCount = 0;
    }
    if (globalCount >= GLOBAL_LIMIT_PER_WINDOW) {
      globallyLimited += 1;
      continue;
    }
    sourceWindows.set(source, { window, count: sourceCount + 1 });
    globalCount += 1;
    if (queue.length - queueHead >= QUEUE_CAPACITY) {
      queueOverflow += 1;
      continue;
    }
    queue.push({ source, node: BASE_NODES + (event % EXTRA_NODES) + 1, eventId });
    accepted += 1;
    maxQueueDepth = Math.max(maxQueueDepth, queue.length - queueHead);
    if (event % 1024 === 0 && queue.length - queueHead > 64) queueHead += 64;
    if (queueHead > 4096) {
      queue.splice(0, queueHead);
      queueHead = 0;
    }
  }

  const activeQueue = queue.length - queueHead;
  const elapsedMs = performance.now() - started;
  assert.equal(syntheticParents.length, EXTRA_NODES);
  assert.ok(accepted <= ATTACK_EVENTS);
  assert.ok(maxQueueDepth <= QUEUE_CAPACITY);
  assert.ok(activeQueue <= QUEUE_CAPACITY);
  assert.ok(maxSeenSize <= DEDUP_CAPACITY);
  assert.ok(queueOverflow > 0, 'attack burst should exercise the bounded queue');
  assert.ok(sourceLimited + globallyLimited + duplicates + queueOverflow + accepted === ATTACK_EVENTS);
  assert.ok(sourceWindows.size <= ATTACK_SOURCES);

  console.log(`[نجاح اختبار المرونة الدفاعي] ${EXTRA_NODES.toLocaleString('en-US')} عقدة افتراضية إضافية · ${ATTACK_SOURCES.toLocaleString('en-US')} مصدر موزع`);
  console.log(`   • أحداث عدائية محاكاة: ${ATTACK_EVENTS.toLocaleString('en-US')}`);
  console.log(`   • مقبول: ${accepted.toLocaleString('en-US')} · تكرارات مسقطة: ${duplicates.toLocaleString('en-US')} · محدودة بالمعدل: ${(sourceLimited + globallyLimited).toLocaleString('en-US')}`);
  console.log(`   • أقصى طابور: ${maxQueueDepth.toLocaleString('en-US')}/${QUEUE_CAPACITY.toLocaleString('en-US')} · أقصى ذاكرة إزالة تكرار: ${maxSeenSize.toLocaleString('en-US')}/${DEDUP_CAPACITY.toLocaleString('en-US')}`);
  console.log(`   • الطابور النشط: ${activeQueue.toLocaleString('en-US')} · الزمن: ${elapsedMs.toFixed(1)}ms`);
}

runDistributedResilienceTest();
