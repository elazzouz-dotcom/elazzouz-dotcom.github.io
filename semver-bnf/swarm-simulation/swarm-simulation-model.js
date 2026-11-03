(function attachSwarmModel(root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  if (root) root.SwarmSimulationModel = model;
})(typeof window !== 'undefined' ? window : globalThis, function createSwarmModel() {
  const ROLES = Object.freeze([
    Object.freeze({ id: 'explore', label: 'استكشاف', color: '#59e0a3' }),
    Object.freeze({ id: 'inspect', label: 'فحص تعليمي', color: '#f4ce72' }),
    Object.freeze({ id: 'protect', label: 'حماية افتراضية', color: '#70a7ff' })
  ]);
  const SCENARIOS = Object.freeze({
    balanced: Object.freeze({ label: 'توزيع متوازن', role: null }),
    'explore-heavy': Object.freeze({ label: 'تركيز الاستكشاف', role: 'explore' }),
    'inspect-heavy': Object.freeze({ label: 'تركيز الفحص التعليمي', role: 'inspect' }),
    'protect-heavy': Object.freeze({ label: 'تركيز الحماية الافتراضية', role: 'protect' }),
    random: Object.freeze({ label: 'توزيع عشوائي', role: 'random' })
  });
  const MIN_AGENTS = 3;
  const MAX_AGENTS = 300;
  const DEFAULT_AGENTS = 57;
  const MAX_DISTRIBUTION_SAMPLES = 5000;
  const MAX_DISTRIBUTION_BOUND = 1000;
  const MAX_GAUSSIAN_DEVIATION = 100;
  const MAX_POISSON_RATE = 100;

  function clampAgentCount(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return DEFAULT_AGENTS;
    return Math.min(MAX_AGENTS, Math.max(MIN_AGENTS, Math.round(numeric)));
  }

  function countRoles(agentsOrRoles) {
    const counts = Object.fromEntries(ROLES.map((role) => [role.id, 0]));
    for (const item of agentsOrRoles || []) {
      const role = typeof item === 'string' ? item : item?.role;
      if (Object.prototype.hasOwnProperty.call(counts, role)) counts[role] += 1;
    }
    return counts;
  }

  function calculateBalancePercent(counts) {
    const total = ROLES.reduce((sum, role) => sum + Math.max(0, Number(counts?.[role.id]) || 0), 0);
    if (!total) return 0;
    const ideal = total / ROLES.length;
    const deviation = ROLES.reduce((sum, role) => sum + Math.abs((Number(counts?.[role.id]) || 0) - ideal), 0);
    const maximumDeviation = 4 * total / 3;
    const score = 100 * (1 - deviation / maximumDeviation);
    return Math.round(Math.min(100, Math.max(0, score)) * 10) / 10;
  }

  function createRoleAssignments(count, scenario = 'balanced', random) {
    const total = clampAgentCount(count);
    const selected = SCENARIOS[scenario] || SCENARIOS.balanced;
    if (selected.role === 'random') {
      if (typeof random !== 'function') throw new TypeError('A seeded random source is required for this scenario.');
      return Array.from({ length: total }, () => ROLES[Math.min(ROLES.length - 1, Math.floor(random() * ROLES.length))].id);
    }
    if (!selected.role) {
      return Array.from({ length: total }, (_, index) => ROLES[index % ROLES.length].id);
    }
    const dominantCount = Math.round(total * 0.6);
    const otherRoles = ROLES.map((role) => role.id).filter((role) => role !== selected.role);
    const assignments = Array.from({ length: dominantCount }, () => selected.role);
    for (let index = 0; assignments.length < total; index += 1) assignments.push(otherRoles[index % otherRoles.length]);
    return assignments;
  }

  function finiteParameter(value, name) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) throw new TypeError(`${name} must be a finite number.`);
    return numeric;
  }

  function nextUniform(rng) {
    if (!rng || typeof rng.random !== 'function') throw new TypeError('A seeded random generator is required.');
    const value = rng.random();
    if (!(value >= 0 && value < 1)) throw new RangeError('The random generator must return values in [0, 1).');
    return value;
  }

  function sampleDistribution(rng, type, count, parameters = {}) {
    const total = Number(count);
    if (!Number.isSafeInteger(total) || total < 1 || total > MAX_DISTRIBUTION_SAMPLES) {
      throw new RangeError(`Sample count must be an integer from 1 to ${MAX_DISTRIBUTION_SAMPLES}.`);
    }
    let draw;
    if (type === 'uniform') {
      const minimum = finiteParameter(parameters.minimum ?? 0, 'minimum');
      const maximum = finiteParameter(parameters.maximum ?? 1, 'maximum');
      if (minimum < -MAX_DISTRIBUTION_BOUND || maximum > MAX_DISTRIBUTION_BOUND || minimum >= maximum) {
        throw new RangeError(`Uniform bounds must be within ±${MAX_DISTRIBUTION_BOUND}, with maximum above minimum.`);
      }
      draw = () => minimum + nextUniform(rng) * (maximum - minimum);
    } else if (type === 'gaussian') {
      const mean = finiteParameter(parameters.mean ?? 0, 'mean');
      const standardDeviation = finiteParameter(parameters.standardDeviation ?? 1, 'standardDeviation');
      if (mean < -MAX_DISTRIBUTION_BOUND || mean > MAX_DISTRIBUTION_BOUND
        || standardDeviation < 0 || standardDeviation > MAX_GAUSSIAN_DEVIATION) {
        throw new RangeError(`Gaussian mean must be within ±${MAX_DISTRIBUTION_BOUND} and standard deviation within 0–${MAX_GAUSSIAN_DEVIATION}.`);
      }
      draw = () => {
        if (standardDeviation === 0) return mean;
        const first = Math.max(nextUniform(rng), Number.MIN_VALUE);
        const second = nextUniform(rng);
        const standardNormal = Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
        return mean + standardDeviation * standardNormal;
      };
    } else if (type === 'poisson') {
      const rate = finiteParameter(parameters.lambda ?? 4, 'lambda');
      if (rate < 0 || rate > MAX_POISSON_RATE) {
        throw new RangeError(`Poisson lambda must be between 0 and ${MAX_POISSON_RATE}.`);
      }
      draw = () => {
        if (rate === 0) return 0;
        const target = nextUniform(rng);
        let probability = Math.exp(-rate);
        let cumulative = probability;
        let value = 0;
        const iterationLimit = Math.ceil(rate + 16 * Math.sqrt(rate + 1) + 100);
        while (target > cumulative) {
          value += 1;
          probability *= rate / value;
          cumulative = Math.min(1, cumulative + probability);
          if (probability === 0 || value >= iterationLimit) return value;
        }
        return value;
      };
    } else {
      throw new RangeError('Distribution must be uniform, gaussian, or poisson.');
    }
    return Array.from({ length: total }, draw);
  }

  function summarizeSamples(values) {
    if (!Array.isArray(values) || values.length === 0 || values.some((value) => !Number.isFinite(value))) {
      throw new TypeError('Samples must be a non-empty array of finite numbers.');
    }
    const count = values.length;
    const mean = values.reduce((sum, value) => sum + value, 0) / count;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / count;
    return Object.freeze({
      count,
      mean,
      variance,
      minimum: Math.min(...values),
      maximum: Math.max(...values)
    });
  }

  return Object.freeze({
    ROLES,
    SCENARIOS,
    MIN_AGENTS,
    MAX_AGENTS,
    DEFAULT_AGENTS,
    clampAgentCount,
    countRoles,
    calculateBalancePercent,
    createRoleAssignments,
    MAX_DISTRIBUTION_SAMPLES,
    MAX_DISTRIBUTION_BOUND,
    MAX_GAUSSIAN_DEVIATION,
    MAX_POISSON_RATE,
    sampleDistribution,
    summarizeSamples
  });
});
