'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { runtimeScripts } = require('./helpers/runtime.cjs');

test('core and physics operate without DOM, audio, a canvas or a game instance', () => {
  const window = {};
  for (const { source, filename } of runtimeScripts().filter(script => /\/(core|physics)\.js$/.test(script.filename))) {
    vm.runInNewContext(source, { window }, { filename });
  }
  const { Core, Physics } = window.ShoparFootball;
  assert.equal(window.footballGame, undefined);
  const player = Core.makePlayer(500, 350, 'blue', 9), original = JSON.stringify(player);
  const foot = Core.possessionPosition(player);
  assert.ok(foot.x > player.x && foot.y > player.y);
  assert.equal(JSON.stringify(player), original, 'geometry must only read the actor');
  Physics.movePlayer(player, 510, 350, 100, .05);
  assert.equal(player.x, 505); assert.equal(player.y, 350);
  assert.ok(player.step > 0, 'movement retains the walk-animation phase');
  const ball = { x: foot.x, y: foot.y, z: 1, vx: 100, vy: 0, vz: -200, spin: .2, rotation: 0, age: 0 };
  const impact = Physics.integrateBall(ball, 1 / 30);
  assert.ok(impact && impact.strength > 0);
  assert.ok(ball.x > foot.x && ball.vz > 0 && ball.age > 0, 'integration updates the supplied ball');
  assert.equal(Physics.goalLineOutcome(500, 0), 'goal');
  assert.equal(Physics.goalLineOutcome(500, 200), 'high');
});
