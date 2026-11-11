// Tests for the matching engine and project builder. Run from the project folder:  node --test tests/logic.test.mjs
// The browser scripts attach to `window.HR`, so we load them into a small sandbox with a fake window.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const sandbox = { window: {} };
vm.createContext(sandbox);
for (const f of ['data', 'match', 'scope']) vm.runInContext(readFileSync(new URL(`../js/${f}.js`, import.meta.url), 'utf8'), sandbox);
const { match, scope, data } = sandbox.window.HR;

const austin = { lat: 30.27, lon: -97.74, radius: 25 };
const student = { age: 15, mode: 'both', skills: ['design'], learn: ['social'], causes: ['hunger'], hours_per_week: 4 };
const project = (extra = {}) => ({ skills: ['design'], cause: 'hunger', hours: 6, weeks: 2, min_age: 13, remote: true,
  org: { lat: 30.30, lon: -97.70, is_national: false }, ...extra });

test('weights add up to 100%', () => {
  assert.equal(Math.round(Object.values(match.W).reduce((a, b) => a + b) * 100), 100);
});

test('haversine: Austin to Dallas is about 182 miles', () => {
  const d = match.miles({ lat: 30.2672, lon: -97.7431 }, { lat: 32.7767, lon: -96.797 });
  assert.ok(d > 178 && d < 186, `got ${d}`);
});

test('perfect fit scores 100% and explains why', () => {
  const m = match.score({ ...student, learn: ['design'] }, project(), null);
  assert.equal(m.ok, true);
  assert.equal(m.pct, 100);
  assert.ok(m.reasons.some(r => r.includes('Graphic design')));
  assert.ok(m.reasons.some(r => r.includes('hunger')));
});

test('students never see projects they are too young for', () => {
  const m = match.score({ ...student, age: 14 }, project({ min_age: 16 }), austin);
  assert.deepEqual([m.ok, m.why], [false, 'Ages 16+']);
});

test('local projects outside the radius are filtered out', () => {
  const m = match.score(student, project({ org: { lat: 32.78, lon: -96.80, is_national: false } }), austin);
  assert.equal(m.ok, false);
  assert.match(m.why, /miles away/);
});

test('online programs show up for everyone, wherever they are', () => {
  const m = match.score(student, project({ org: { is_national: true } }), austin);
  assert.equal(m.ok, true);
  assert.equal(m.dist, null);
});

test('remote-only students are not shown in-person work', () => {
  const m = match.score({ ...student, mode: 'remote' }, project({ remote: false }), austin);
  assert.deepEqual([m.ok, m.why], [false, 'In person only']);
});

test('related skills earn partial credit instead of zero', () => {
  const exact = match.score(student, project({ skills: ['design'] }), null).pct;
  const related = match.score(student, project({ skills: ['social'] }), null).pct;
  const unrelated = match.score({ ...student, learn: [] }, project({ skills: ['gardening'] }), null).pct;
  assert.ok(exact > related && related > unrelated, `${exact} > ${related} > ${unrelated}`);
});

test('a student with no skills yet is filtered but not scored', () => {
  const m = match.score({ ...student, skills: [] }, project(), austin);
  assert.deepEqual([m.ok, m.pct], [true, null]);
});

test('signed-out visitors (no profile) still get distance filtering', () => {
  assert.equal(match.score(null, project(), austin).ok, true);
});

test('related() is symmetric', () => {
  assert.equal(data.related('design', 'social'), data.related('social', 'design'));
  assert.equal(data.related('design', 'design'), 1);
});

test('builder: a translation need becomes a remote translation project', () => {
  const r = scope.analyze('Half the families we serve speak Spanish, but our sign-up form is only in English.', 'education');
  assert.ok(r.skills.includes('translate'));
  assert.equal(r.remote, true);
  assert.ok(r.evidence.some(e => e.words.includes('spanish')));
});

test('builder: flyers and Instagram become design + social media', () => {
  const r = scope.analyze('We want more people at our food drive. Our flyers are plain and we barely post on Instagram.', 'hunger');
  assert.ok(r.skills.includes('design') && r.skills.includes('social'));
  assert.ok(!r.skills.includes('events'), '"food drive" alone should not be read as event planning');
});

test('builder: helping seniors with video calls is in-person tech help, not video production', () => {
  const r = scope.analyze("Our seniors have tablets but don't know how to video call their families. It would be in person at our center.", 'seniors');
  assert.ok(r.skills.includes('techhelp'));
  assert.ok(!r.skills.includes('photo'));
  assert.equal(r.remote, false);
});

test('builder: hours stay student-sized', () => {
  const r = scope.analyze('We need a website, an app, a newsletter, flyers, Instagram posts and a spreadsheet of donors.', 'education');
  assert.ok(r.hours >= 1 && r.hours <= 80);
  assert.ok(r.skills.length <= 3);
});

test('builder: returns null when it finds nothing to work with', () => {
  assert.equal(scope.analyze('hello there', 'education'), null);
});
