'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { runtimeScripts } = require('./helpers/runtime.cjs');
const window = { ShoparFootball: {} };
vm.runInNewContext(runtimeScripts().find(s => s.filename.endsWith('/match-session.js')).source, { window });
const Match = window.ShoparFootball.MatchSession;
function rng(values) { let i = 0; return () => values[i++] ?? .9; }
test('match selects three distinct attacks, six base slots and at most one rare penalty', () => {
  const plain = new Match(() => .9);
  assert.equal(plain.schedule.length, 6); assert.equal(new Set([0, 2, 4].map(i => plain.schedule[i])).size, 3);
  const home = new Match(rng([.9,.9,.9,.9,.24,.1,.5]));
  assert.equal(home.schedule[2], 'take-the-penalty'); assert.equal(home.schedule[5], 'save-the-shot');
  const away = new Match(rng([.9,.9,.9,.9,.24,.8])); assert.equal(away.schedule[5], 'save-the-penalty');
  assert.equal(new Match(rng([.9,.9,.9,.9,.25])).schedule.includes('take-the-penalty'), false);
});
test('only physical goal kinds affect match score; repeated results cannot award twice', () => {
  const m = new Match(() => .9); assert.equal(m.advance(), 'waiting');
  for (const kind of ['goal', 'ball_won', 'goal', 'pass_through', 'shot_saved', 'wide', 'penalty_conceded']) {
    m.record(kind, true); const score = JSON.stringify(m.score); m.record('goal', true); assert.equal(JSON.stringify(m.score), score); m.advance();
  }
  assert.equal(m.score.home, 2); assert.equal(m.score.away, 1); assert.equal(m.result, 'VICTORY');
});
test('successful defense ends in six scenes; failed defense adds only one save each', () => {
  for (const failed of [false, true]) {
    const m = new Match(() => .9);
    while (true) {
      const kind = m.continuation || m.highlightId === 'save-the-shot' ? 'shot_conceded' : m.highlightId === 'win-the-ball' ? (failed ? 'opponent_escaped' : 'ball_won') : m.highlightId === 'cut-the-pass' ? (failed ? 'pass_through' : 'pass_won') : 'wide';
      const score = m.score.away; m.record(kind, false);
      if (m.needsSave) assert.equal(m.score.away, score);
      if (m.advance() === 'summary') break;
    }
    assert.equal(m.history.length, failed ? 8 : 6); assert.equal(m.score.away, failed ? 3 : 1);
    assert.equal(m.result, 'DEFEAT'); m.score.home = m.score.away; assert.equal(m.result, 'DRAW');
  }
});
