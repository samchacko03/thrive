/**
 * Thrive scoring model, version 2.
 * Pure functions. No DOM. See docs/spec.json "Scoring model, version 2".
 *
 * Inputs
 *   items:     the items array from content/en/items.json
 *   answers:   array of 1..5 (or null) aligned to items by index
 *   readiness: { archetypeKey: "ready" | "learning" | "willing" | "no" } for the top 5
 *
 * Output
 *   { energy, ranked, fruitful, faithful, wearying, middle, flags, readinessTargets }
 */

export const THRESHOLDS = {
  fruitful: 3.8,
  faithfulLow: 2.8,
  faithfulHigh: 3.7,
  wearying: 2.4,
  consistencyGap: 3,
  straightLineShare: 32 / 41
};

/** Average energy per archetype from the non-consistency items. */
export function scoreEnergy(items, answers) {
  const sums = {}, counts = {};
  items.forEach((it, i) => {
    if (it.consistency) return;
    const v = answers[i];
    if (v == null) return;
    sums[it.a] = (sums[it.a] || 0) + v;
    counts[it.a] = (counts[it.a] || 0) + 1;
  });
  const energy = {};
  Object.keys(sums).forEach(k => { energy[k] = sums[k] / counts[k]; });
  return energy;
}

/** Archetypes sorted by energy desc, ties broken by name order. */
export function rank(energy, order) {
  return order
    .filter(k => energy[k] != null)
    .map(k => ({ key: k, avg: energy[k] }))
    .sort((a, b) => b.avg - a.avg || order.indexOf(a.key) - order.indexOf(b.key));
}

/** Which archetypes get the readiness check: the top five by energy. */
export function readinessTargets(ranked, n = 5) {
  return ranked.slice(0, n).map(r => r.key);
}

/** Internal quality flags. Never shown to the person; attached to the leader's card. */
export function qualityFlags(items, answers) {
  const flags = [];
  items.forEach((it, i) => {
    if (!it.consistency) return;
    const pairIdx = items.findIndex(x => x.n === it.pairWith);
    const a = answers[i], b = answers[pairIdx];
    if (a != null && b != null && Math.abs(a - b) >= THRESHOLDS.consistencyGap) flags.push('quick-answers');
  });
  const answered = answers.filter(v => v != null);
  if (answered.length) {
    const counts = {};
    answered.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
    const maxShare = Math.max(...Object.values(counts)) / answered.length;
    if (maxShare >= THRESHOLDS.straightLineShare) flags.push('uniform-answers');
  }
  return [...new Set(flags)];
}

/**
 * Categorize using energy + readiness with absolute thresholds.
 * Readiness is only known for the top 5; others default to "unknown" which counts as willing.
 */
export function categorize(ranked, readiness) {
  const r = k => readiness[k] || 'unknown';
  const okFruitful = k => ['ready', 'learning', 'willing', 'unknown'].includes(r(k));
  const okFaithful = k => ['ready', 'learning'].includes(r(k));

  let fruitful = ranked
    .filter(x => x.avg >= THRESHOLDS.fruitful && okFruitful(x.key))
    .map(x => ({ ...x, readiness: r(x.key), label: r(x.key) === 'ready' ? 'Ready now' : 'With a little training' }));

  // Fallback: guarantee at least two Fruitful by promoting the highest-energy non-"no" areas as Emerging.
  let emerging = false;
  if (fruitful.length < 2) {
    const have = new Set(fruitful.map(x => x.key));
    for (const x of ranked) {
      if (fruitful.length >= 2) break;
      if (have.has(x.key) || r(x.key) === 'no') continue;
      fruitful.push({ ...x, readiness: r(x.key), label: 'Emerging' });
      have.add(x.key);
      emerging = true;
    }
  }
  fruitful = fruitful.slice(0, 2);
  const taken = new Set(fruitful.map(x => x.key));

  const faithful = ranked
    .filter(x => !taken.has(x.key) && x.avg >= THRESHOLDS.faithfulLow && x.avg <= THRESHOLDS.faithfulHigh && okFaithful(x.key))
    .slice(0, 2)
    .map(x => ({ ...x, readiness: r(x.key) }));
  faithful.forEach(x => taken.add(x.key));

  const wearying = ranked
    .filter(x => !taken.has(x.key) && x.avg <= THRESHOLDS.wearying)
    .slice(-2)
    .map(x => ({ ...x }));
  wearying.forEach(x => taken.add(x.key));

  const middle = ranked.filter(x => !taken.has(x.key));

  return { fruitful, faithful, wearying, middle, emerging };
}

/** One call that does it all. */
export function score(items, order, answers, readiness) {
  const energy = scoreEnergy(items, answers);
  const ranked = rank(energy, order);
  const cats = categorize(ranked, readiness || {});
  return {
    energy,
    ranked,
    ...cats,
    flags: qualityFlags(items, answers),
    readinessTargets: readinessTargets(ranked)
  };
}
