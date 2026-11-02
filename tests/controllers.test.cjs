'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { runtimeScripts } = require('./helpers/runtime.cjs');
function headless(name, memory = {}) {
  const window = {};
  for (const { source, filename } of runtimeScripts().filter(script => /\/(core|physics)\.js$|\/highlights\/(controller|cut-pass|win-ball)\.js$/.test(script.filename))) vm.runInNewContext(source, { window }, { filename });
  const { Core, Physics } = window.ShoparFootball;
  const results = [], sounds = [], trail = [], ripples = [];
  const player = Core.makePlayer(name === 'WinBallController' ? 370 : 550, name === 'WinBallController' ? 520 : 530, 'blue', 9);
  const defenders = name === 'WinBallController' ? [Core.makePlayer(535, 350, 'red', 4)] : [Core.makePlayer(340, 350, 'red', 4), Core.makePlayer(760, 370, 'red', 5)];
  const ball = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, rotation: 0, age: 0 };
  const context = Object.freeze({ player, ball, defenders, mates: [], memory, physics: Physics, geometry: Core,
    time: 0, view: { scale: 1, x: 0, y: 0, width: 1000, height: 740 },
    effects: { trail, ripple: point => ripples.push(point) }, audio: { play: kind => sounds.push(kind) },
    complete: (kind, detail) => results.push({ kind, detail }) });
  const controller = new window.ShoparFootball[name](context);
  return { controller, context, results, sounds, namespace: window.ShoparFootball };
}

test('Cut the Pass simulates and resolves against only a headless bounded context', () => {
  const { controller: c, context, results } = headless('CutPassController');
  assert.equal(c.enter().state, 'DEFENDING');
  assert.equal(c.handleInput({ type: 'down', point: { x: 550, y: 340 } }).capture, false);
  for (let i = 0; i < 900 && !c.finished; i++) c.update(1 / 120);
  assert.equal(results[0].kind, 'pass_won'); assert.equal(results.length, 1);
  const resolution = { kind: 'pass_won', elapsed: 0 }; c.updateResult(.1, resolution);
  assert.equal(resolution.elapsed, .1); assert.ok(context.ball.x > 0);
  assert.equal(c.game, undefined); assert.equal(context.stats, undefined);
  assert.equal(c.getPresentation().hideHelp, true);
});

test('Cut the Pass releases early against a direct rush at 30, 60 and 120 FPS', () => {
  for (const fps of [30, 60, 120]) {
    const { controller: c, context, results, sounds } = headless('CutPassController');
    c.handleInput({ type: 'down', point: { x: c.passer.x, y: c.passer.y } });
    for (let i = 0; i < fps * 3 && c.phase === 'planning'; i++) c.update(1 / fps);
    assert.ok(c.passStartedAt > 0 && c.passStartedAt < c.passAt);
    assert.ok(Math.hypot(context.player.x - c.passer.x, context.player.y - c.passer.y) <= 180);
    assert.equal(c.getActorPose(c.passer).kicking, true);
    c.update(.3);
    assert.equal(c.getActorPose(c.passer).kicking, false);
    for (let i = 0; i < fps * 8 && !c.finished; i++) c.update(1 / fps);
    assert.equal(results.length, 1); assert.equal(results[0].kind, 'pass_through');
    assert.equal(sounds.filter(kind => kind === 'kick').length, 1);
  }
});

test('Cut the Pass keeps the normal release time with no pressure or a covered lane', () => {
  for (const fps of [30, 60, 120]) for (const coverLane of [false, true]) {
    const { controller: c, results } = headless('CutPassController');
    if (coverLane) c.handleInput({ type: 'down', point: { x: 550, y: 340 } });
    for (let i = 0; i < fps * 8 && !c.finished; i++) c.update(1 / fps);
    assert.ok(c.passStartedAt >= c.passAt && c.passStartedAt < c.passAt + 1 / 120);
    assert.equal(results.length, 1);
    assert.equal(results[0].kind, coverLane ? 'pass_won' : 'pass_through');
  }
});

test('Cut the Pass escapes rushes aimed at the visible passer and ball at every frame rate', () => {
  for (const fps of [30, 60, 120]) {
    for (let x = 310; x <= 400; x += 10) for (let y = 290; y <= 380; y += 10) {
      const { controller: c, results } = headless('CutPassController');
      c.handleInput({ type: 'down', point: { x, y } });
      for (let i = 0; i < fps * 8 && !c.finished; i++) c.update(1 / fps);
      assert.equal(results.length, 1);
      assert.equal(results[0].kind, 'pass_through', `Rush toward (${x}, ${y}) at ${fps} FPS`);
      assert.ok(c.passStartedAt < c.passAt);
    }
  }
});

test('Cut the Pass measures pressure from the passer and permits a real interception nearby', () => {
  const { controller: c, context, results } = headless('CutPassController');
  Object.assign(context.player, { x: c.passer.x + 180.1, y: c.passer.y });
  c.update(1 / 120); assert.equal(c.phase, 'planning');
  context.player.x = c.passer.x + 180;
  c.update(1 / 120); assert.equal(c.phase, 'passing');
  Object.assign(context.player, { x: 400, y: 350 });
  for (let i = 0; i < 900 && !c.finished; i++) c.update(1 / 120);
  assert.equal(results.length, 1); assert.equal(results[0].kind, 'pass_won');
});

test('Cut the Pass rotates six distinct layouts through persistent retry memory', () => {
  const memory = {}, starts = [];
  for (let i = 0; i < 7; i++) {
    const { controller: c, context } = headless('CutPassController', memory);
    starts.push(JSON.stringify([context.player.x, context.player.y, c.passer.x, c.passer.y, c.receiver.x, c.receiver.y]));
    assert.equal(c.elapsed, 0); assert.equal(c.target, null); assert.equal(c.passStartedAt, null);
    assert.ok(c.passAt >= .8 && c.passAt <= 1);
    c.enter(); c.enter(); assert.equal(memory.variant, i + 1);
  }
  assert.equal(new Set(starts.slice(0, 6)).size, 6);
  assert.equal(starts[0], starts[6]);
});

test('every Cut the Pass angle rewards a quick lane cut and beats receiver camping or late movement', () => {
  for (const fps of [30, 60, 120]) for (let variant = 0; variant < 6; variant++) {
    for (const mode of ['lane', 'receiver', 'chase', 'late', 'none']) {
      const { controller: c, context, results } = headless('CutPassController', { variant });
      const lane = { x: 550 + 70 * Math.sin(c.setup.angle), y: 400 - 70 * Math.cos(c.setup.angle) };
      if (mode === 'late') c.update(.75);
      if (mode !== 'none') c.selectTarget(mode === 'receiver' || mode === 'chase' ? c.receiver : lane);
      for (let i = 0; i < fps * 4 && !c.finished; i++) {
        if (mode === 'chase') c.target = { x: c.receiver.x, y: c.receiver.y };
        c.update(1 / fps);
      }
      const detail = `Variant ${variant}, ${mode}, ${fps} FPS`;
      assert.equal(results.length, 1, detail);
      assert.equal(results[0].kind, mode === 'lane' ? 'pass_won' : 'pass_through', detail);
      assert.ok(c.elapsed < 3, detail);
      if (mode === 'none') assert.ok(Math.hypot(context.ball.x - c.receiver.x, context.ball.y - c.receiver.y) < 26, detail);
    }
  }
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
