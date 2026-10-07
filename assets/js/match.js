/**
 * Role matching. See docs/spec.json "Role matching rules".
 * Pure function. Returns the top N roles with their scores and reasons.
 */
export function matchRoles({ fruitful, audiences, availability, roles, teams, max = 3, about = {} }) {
  const primary = fruitful[0] && fruitful[0].key;
  const secondary = fruitful[1] && fruitful[1].key;
  const aud = new Set(audiences || []);
  const serveWith = new Set(about.serveWith || []);
  const earlyFaith = about.faith === 'exploring' || about.faith === 'new';

  const scored = roles.map(role => {
    // Roles that need an established believer are not offered to someone still exploring or new to faith.
    if (earlyFaith && role.maturity) return null;
    let s = 0;
    const why = [];
    if (role.fits.includes(primary)) { s += 3; why.push('primary'); }
    if (secondary && role.fits.includes(secondary)) { s += 2; why.push('secondary'); }
    if (s === 0) return null; // only roles that fit a Fruitful archetype are candidates

    role.audiences.forEach(a => { if (aud.has(a)) { s += 2; why.push('audience:' + a); } });
    if (availability === 'sun' && role.sunday) { s += 1; why.push('sunday'); }
    if (availability === 'full' && role.lowCommit) { s += 1; why.push('low-commit'); }
    if (about.rhythm && role.rhythm === about.rhythm) { s += 1; why.push('rhythm'); }
    if ((serveWith.has('kids') || serveWith.has('spouse')) && role.familyOk) { s += 1; why.push('family'); }
    const team = teams[role.team];
    if (team && team.pilot) { s += 1; why.push('pilot'); }

    return { role, team, score: s, why };
  }).filter(Boolean);

  scored.sort((a, b) => b.score - a.score || a.role.name.localeCompare(b.role.name));

  // Variety guard: avoid three roles from the same team unless nothing else fits.
  const out = [];
  const teamCount = {};
  for (const c of scored) {
    const t = c.role.team;
    if ((teamCount[t] || 0) >= 2 && scored.some(o => !out.includes(o) && o.role.team !== t && o.score >= c.score - 1)) continue;
    out.push(c);
    teamCount[t] = (teamCount[t] || 0) + 1;
    if (out.length >= max) break;
  }
  return out;
}

/** Day name N days from today, for "Anil will reach out by Wednesday." */
export function reachByDay(days, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-US', { weekday: 'long' });
}
