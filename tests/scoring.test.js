import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { score, THRESHOLDS } from '../assets/js/scoring.js';
import { matchRoles } from '../assets/js/match.js';

const load = n => JSON.parse(readFileSync(new URL(`../content/en/${n}.json`, import.meta.url)));
const items = load('items').items, order = load('archetypes').order;
const roles = load('roles').roles, teams = load('teams').teams;

function answersFor(profile, fallback = 3) {
  return items.map(it => profile[it.a] ?? fallback);
}
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ok  ' + name); };

console.log('Scoring model v2');

test('three energy items per archetype, 38 total, two consistency items', () => {
  const counts = {};
  items.filter(i => !i.consistency).forEach(i => counts[i.a] = (counts[i.a] || 0) + 1);
  assert.equal(items.length, 41);
  assert.ok(Object.values(counts).every(c => c === 3), JSON.stringify(counts));
  assert.equal(items.filter(i => i.consistency).length, 2);
});

test('Host + Teacher profile ranks correctly and both are Fruitful when ready', () => {
  const a = answersFor({ host: 5, teacher: 5, strategist: 1, pioneer: 1 });
  const r = score(items, order, a, { host: 'ready', teacher: 'learning' });
  assert.deepEqual(r.fruitful.map(x => x.key).sort(), ['host', 'teacher']);
  assert.equal(r.fruitful.find(x => x.key === 'host').label, 'Ready now');
  assert.equal(r.fruitful.find(x => x.key === 'teacher').label, 'With a little training');
  assert.deepEqual(r.wearying.map(x => x.key).sort(), ['pioneer', 'strategist']);
});

test('"rather not" readiness blocks Fruitful even with high energy', () => {
  const a = answersFor({ artist: 5, host: 4.5, teacher: 4 });
  const r = score(items, order, a, { artist: 'no', host: 'ready', teacher: 'ready' });
  assert.ok(!r.fruitful.some(x => x.key === 'artist'));
  assert.equal(r.fruitful[0].key, 'host');
});

test('thrives-everywhere person gets no invented weariness', () => {
  const a = answersFor({}, 5);
  const r = score(items, order, a, { shepherd: 'ready', teacher: 'ready', discipler: 'ready', host: 'ready', artist: 'ready' });
  assert.equal(r.wearying.length, 0);
  assert.equal(r.fruitful.length, 2);
});

test('flat profile gets Emerging fallback rather than fake Fruitful', () => {
  const a = answersFor({}, 3);
  const r = score(items, order, a, {});
  assert.equal(r.fruitful.length, 2);
  assert.ok(r.emerging);
  assert.ok(r.fruitful.every(x => x.label === 'Emerging'));
});

test('Faithful means capable but not energized (mid energy + ready)', () => {
  const a = answersFor({ host: 5, teacher: 5, administrator: 3.3 });
  const idx = items.findIndex(i => i.a === 'administrator');
  const r = score(items, order, a, { host: 'ready', teacher: 'ready', administrator: 'ready' });
  assert.ok(r.faithful.some(x => x.key === 'administrator'));
});

test('consistency gap flags quick answers', () => {
  const a = answersFor({ host: 5 });
  const i12 = items.findIndex(i => i.n === 12), i40 = items.findIndex(i => i.n === 40);
  a[i12] = 5; a[i40] = 1;
  const r = score(items, order, a, {});
  assert.ok(r.flags.includes('quick-answers'));
});

test('uniform answers are flagged, never hidden', () => {
  const r = score(items, order, answersFor({}, 4), {});
  assert.ok(r.flags.includes('uniform-answers'));
  assert.equal(r.fruitful.length, 2);
});

test('a musician who avoids tech is Fruitful as Artist, not dragged down by Producer items', () => {
  const a = answersFor({ artist: 5, producer: 1, host: 4 });
  const r = score(items, order, a, { artist: 'ready', host: 'ready' });
  assert.ok(r.fruitful.some(x => x.key === 'artist'));
  assert.ok(r.wearying.some(x => x.key === 'producer'));
});

console.log('Role matching');

test('Administrator who loves little kids gets Family Ministries roles surfaced', () => {
  const fruitful = [{ key: 'administrator' }, { key: 'strategist' }];
  const m = matchRoles({ fruitful, audiences: ['kidsLittle', 'kidsPre'], availability: 'sunweek', roles, teams });
  assert.ok(m.length >= 2);
  assert.ok(m.some(x => x.role.team === 'fm'), m.map(x => x.role.name).join(', '));
});

test('Sunday-only Producer gets Sunday production roles first', () => {
  const fruitful = [{ key: 'producer' }, { key: 'host' }];
  const m = matchRoles({ fruitful, audiences: ['behind'], availability: 'sun', roles, teams });
  assert.ok(m[0].role.sunday);
  assert.ok(['audio', 'video', 'slides'].includes(m[0].role.id), m[0].role.id);
});

test('never returns roles that fit neither Fruitful archetype', () => {
  const fruitful = [{ key: 'intercessor' }, { key: 'shepherd' }];
  const m = matchRoles({ fruitful, audiences: [], availability: 'flex', roles, teams });
  assert.ok(m.every(x => x.role.fits.includes('intercessor') || x.role.fits.includes('shepherd')));
});

test('variety guard only yields to a different team when that team is within a point', () => {
  // Teacher + Host who chose elementary kids: Family Ministries is the honest answer, so three FM roles is correct.
  const strong = matchRoles({ fruitful: [{ key: 'teacher' }, { key: 'host' }], audiences: ['kidsElem'], availability: 'flex', roles, teams });
  assert.ok(strong.every(x => x.role.fits.includes('teacher') || x.role.fits.includes('host')));
  assert.ok(strong.length === 3);
  // Host + Mobilizer who chose guests: three different teams compete, so results should spread.
  const spread = matchRoles({ fruitful: [{ key: 'host' }, { key: 'mobilizer' }], audiences: ['guests'], availability: 'flex', roles, teams });
  assert.ok(new Set(spread.map(x => x.role.team)).size >= 2, spread.map(x => x.role.name).join(', '));
});

console.log('About you');

test('someone still exploring faith is never offered a role that needs maturity', () => {
  const fruitful = [{ key: 'discipler' }, { key: 'teacher' }];
  const m = matchRoles({ fruitful, audiences: ['adults'], availability: 'flex', roles, teams, about: { faith: 'exploring' } });
  assert.ok(m.length > 0);
  assert.ok(m.every(x => !x.role.maturity), m.map(x => x.role.name).join(', '));
});

test('events rhythm lifts project roles for a Host', () => {
  const fruitful = [{ key: 'host' }, { key: 'mercy' }];
  const weekly = matchRoles({ fruitful, audiences: [], availability: 'flex', roles, teams, about: { rhythm: 'weekly' } });
  const events = matchRoles({ fruitful, audiences: [], availability: 'flex', roles, teams, about: { rhythm: 'events' } });
  assert.ok(events.some(x => x.role.rhythm === 'events'));
  assert.ok(weekly[0].role.rhythm === 'weekly');
});

test('serving with kids boosts family-friendly roles', () => {
  const fruitful = [{ key: 'host' }, { key: 'administrator' }];
  const m = matchRoles({ fruitful, audiences: [], availability: 'flex', roles, teams, about: { serveWith: ['kids'] } });
  assert.ok(m.some(x => x.role.familyOk), m.map(x => x.role.name).join(', '));
});

console.log(`\n${passed} tests passed`);
