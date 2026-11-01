'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { runtimeScripts } = require('./helpers/runtime.cjs');
function session() {
  const window = {};
  for (const { source, filename } of runtimeScripts().filter(script => /\/(core|session)\.js$/.test(script.filename))) vm.runInNewContext(source, { window }, { filename });
  return new window.ShoparFootball.Session(Array.from({ length: 7 }, (_, i) => ({ keeperEligible: i < 5 })));
}

test('session checkpoints restore only current-highlight counters and keep earlier outcomes and keeper layout', () => {
  const s = session(); s.index = 2; s.stats.goals = 1; s.outcomes[0] = true;
  const plan = s.keeperPlan; s.captureCheckpoint();
  s.stats.passes = 2; s.stats.misses = 1; s.outcomes[2] = false; s.restoreCheckpoint();
  assert.equal(s.stats.goals, 1); assert.equal(s.stats.passes, 0); assert.equal(s.stats.misses, 0);
  assert.equal(s.outcomes[0], true); assert.equal(s.outcomes[2], undefined); assert.equal(s.keeperPlan, plan);
  assert.notEqual(s.stats, s.scenarioSnapshot);
});

test('session progression distinguishes full-series next/summary from practice retry', () => {
  const s = session();
  for (let i = 1; i <= 6; i++) { assert.equal(s.advance(), 'next'); assert.equal(s.index, i); }
  assert.equal(s.advance(), 'summary'); assert.equal(s.index, 6);
  let calls = 0;
  s.begin(5, () => { calls++; assert.equal(s.practiceIndex, 5); return s.createKeeperPlan(() => 0); });
  assert.equal(calls, 1); assert.equal(s.index, 5); assert.equal(s.advance(), 'retry'); assert.equal(s.index, 5);
  assert.equal(s.keeperPlan.filter(p => p === 'advanced').length, 2);
  assert.equal(s.keeperPlan.filter(p => p === 'line').length, 3);
  s.stats.tackles = 1; s.begin(null, () => s.createKeeperPlan(() => 0));
  assert.equal(s.index, 0); assert.equal(s.stats.tackles, 0); assert.equal(s.outcomes.length, 0);
});

test('session rating retains success weights, bonus caps and the 100-point limit without a DOM', () => {
  const s = session(); s.stats.goals = 1; s.stats.tackles = 1; assert.equal(s.rating(), 24);
  s.stats.passes = 10; s.stats.receives = 1; assert.equal(s.rating(), 40);
  s.stats.goals = 20; assert.equal(s.rating(), 100);
});
