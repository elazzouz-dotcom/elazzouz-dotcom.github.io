import assert from 'node:assert/strict';
import { NODE_LEVELS, NODE_TOTAL, getNodeParent } from '../semver-bnf/graph-model.mjs';

const PRESSURE_WAVES = 16;
const EXPECTED_EDGES = NODE_TOTAL - 1;
const TARGET_SAMPLES = 15_000_000;
const FRAMES = Math.ceil(TARGET_SAMPLES / (PRESSURE_WAVES * EXPECTED_EDGES));

function positionFor(id) {
  // تخطيط حتمي قريب من التخطيط البصري، حتى يختبر الاختبار مسارات الأنابيب الفعلية.
  const level = NODE_LEVELS.findIndex((count, index) => {
    const first = NODE_LEVELS.slice(0, index).reduce((sum, value) => sum + value, 0) + 1;
    return id >= first && id < first + count;
  });
  const first = NODE_LEVELS.slice(0, level).reduce((sum, value) => sum + value, 0) + 1;
  const index = id - first;
  return { x: (index % 60) * 302.36 + 302.36, y: level * 302.36 + Math.floor(index / 60) * 302.36 + 302.36 };
}

function pointOnPipe(parent, child, progress) {
  const midY = parent.y + (child.y - parent.y) * 0.5;
  const points = [parent, { x: parent.x, y: midY }, { x: child.x, y: midY }, child];
  const lengths = [];
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const length = Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
    lengths.push(length);
    total += length;
  }
  let distance = total * progress;
  for (let index = 0; index < lengths.length; index += 1) {
    if (distance <= lengths[index]) {
      const start = points[index];
      const end = points[index + 1];
      const ratio = lengths[index] ? distance / lengths[index] : 0;
      return { x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio };
    }
    distance -= lengths[index];
  }
  return child;
}

function runPressureTest() {
  const positions = new Map();
  for (let id = 1; id <= NODE_TOTAL; id += 1) positions.set(id, positionFor(id));

  const edges = [];
  for (let child = 2; child <= NODE_TOTAL; child += 1) {
    const parent = getNodeParent(child);
    assert.ok(Number.isInteger(parent) && parent >= 1 && parent < child, `invalid parent for N-${child}`);
    edges.push({ parent, child, parentPosition: positions.get(parent), childPosition: positions.get(child) });
  }
  assert.equal(edges.length, EXPECTED_EDGES);

  let samples = 0;
  let maxFiniteCoordinate = 0;
  const started = performance.now();
  for (let frame = 0; frame < FRAMES; frame += 1) {
    for (let wave = 0; wave < PRESSURE_WAVES; wave += 1) {
      for (const edge of edges) {
        const progress = ((frame / FRAMES) + (wave / PRESSURE_WAVES) + (edge.child % 97) / 97) % 1;
        const point = pointOnPipe(edge.parentPosition, edge.childPosition, progress);
        assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y), 'pump produced a non-finite coordinate');
        assert.ok(point.x >= Math.min(edge.parentPosition.x, edge.childPosition.x) - 1e-9);
        assert.ok(point.x <= Math.max(edge.parentPosition.x, edge.childPosition.x) + 1e-9 || point.y >= Math.min(edge.parentPosition.y, edge.childPosition.y) - 1e-9);
        maxFiniteCoordinate = Math.max(maxFiniteCoordinate, Math.abs(point.x), Math.abs(point.y));
        samples += 1;
      }
    }
  }
  const elapsedMs = performance.now() - started;
  assert.equal(samples, FRAMES * PRESSURE_WAVES * EXPECTED_EDGES);
  assert.ok(Number.isFinite(maxFiniteCoordinate));
  console.log(`[نجاح اختبار الضغط] ${EXPECTED_EDGES} أنبوبًا · ${PRESSURE_WAVES} موجة متزامنة · ${FRAMES} إطارًا`);
  console.log(`   • عينات المضخات المفحوصة: ${samples.toLocaleString('en-US')}`);
  console.log(`   • الزمن: ${elapsedMs.toFixed(1)}ms · أقصى إحداثي منتهٍ: ${maxFiniteCoordinate.toFixed(1)}`);
}

runPressureTest();
