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

  function createRoleAssignments(count, scenario = 'balanced', random = Math.random) {
    const total = clampAgentCount(count);
    const selected = SCENARIOS[scenario] || SCENARIOS.balanced;
    if (selected.role === 'random') {
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

  return Object.freeze({
    ROLES,
    SCENARIOS,
    MIN_AGENTS,
    MAX_AGENTS,
    DEFAULT_AGENTS,
    clampAgentCount,
    countRoles,
    calculateBalancePercent,
    createRoleAssignments
  });
});
