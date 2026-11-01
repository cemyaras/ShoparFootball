'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { runtimeScripts } = require('./helpers/runtime.cjs');
function headless(name) {
  const window = {};
  for (const { source, filename } of runtimeScripts().filter(script => /\/(core|physics)\.js$|\/highlights\/(controller|cut-pass|win-ball)\.js$/.test(script.filename))) vm.runInNewContext(source, { window }, { filename });
  const { Core, Physics } = window.ShoparFootball;
  const results = [], sounds = [], trail = [], ripples = [];
  const player = Core.makePlayer(name === 'WinBallController' ? 370 : 550, name === 'WinBallController' ? 520 : 530, 'blue', 9);
  const defenders = name === 'WinBallController' ? [Core.makePlayer(535, 350, 'red', 4)] : [Core.makePlayer(340, 350, 'red', 4), Core.makePlayer(760, 370, 'red', 5)];
  const ball = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, rotation: 0, age: 0 };
  const context = Object.freeze({ player, ball, defenders, mates: [], memory: {}, physics: Physics, geometry: Core,
    time: 0, view: { scale: 1, x: 0, y: 0, width: 1000, height: 740 },
    effects: { trail, ripple: point => ripples.push(point) }, audio: { play: kind => sounds.push(kind) },
    complete: (kind, detail) => results.push({ kind, detail }) });
  const controller = new window.ShoparFootball[name](context);
  return { controller, context, results, sounds, namespace: window.ShoparFootball };
}

test('Cut the Pass simulates and resolves against only a headless bounded context', () => {
  const { controller: c, context, results } = headless('CutPassController');
  assert.equal(c.enter().state, 'DEFENDING');
  assert.equal(c.handleInput({ type: 'down', point: { x: 550, y: 410 } }).capture, false);
  for (let i = 0; i < 900 && !c.finished; i++) c.update(1 / 120);
  assert.equal(results[0].kind, 'pass_won'); assert.equal(results.length, 1);
  const resolution = { kind: 'pass_won', elapsed: 0 }; c.updateResult(.1, resolution);
  assert.equal(resolution.elapsed, .1); assert.ok(context.ball.x > 0);
  assert.equal(c.game, undefined); assert.equal(context.stats, undefined);
  assert.equal(c.getPresentation().hideHelp, true);
});

test('Win the Ball uses hold/release input and actor poses without DOM or a game reference', () => {
  const { controller: c, context, results } = headless('WinBallController');
  assert.equal(c.handleInput({ type: 'down' }).capture, true);
  for (let i = 0; i < 900 && !c.timing().ready; i++) c.update(1 / 120);
  assert.equal(c.timing().ready, true); c.handleInput({ type: 'up' });
  assert.equal(results[0].kind, 'ball_won'); assert.equal(results.length, 1);
  const resolution = { kind: 'ball_won', elapsed: 0 }; c.updateResult(.1, resolution);
  assert.equal(resolution.elapsed, .1); assert.equal(c.getActorPose(context.player).tackling, true);
  assert.equal(c.game, undefined); assert.equal(context.session, undefined);
});

test('controller normalization supplies neutral lifecycle and rendering hooks', () => {
  const { namespace } = headless('CutPassController');
  const c = namespace.Controllers.normalize({ update() {} });
  assert.equal(c.handleInput({ type: 'down' }).handled, false);
  for (const hook of ['enter', 'cancelInput', 'updateResult', 'getPresentation', 'getActorPose', 'drawWorld', 'drawOverlay', 'dispose']) assert.doesNotThrow(() => c[hook]());
});
