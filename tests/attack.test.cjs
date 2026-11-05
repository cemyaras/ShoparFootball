'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { runtimeScripts } = require('./helpers/runtime.cjs');

// No DOM, Canvas, native events, FootballGame or Session is available here.
function headless(reception = false) {
  const window = {};
  for (const { source, filename } of runtimeScripts().filter(s => /\/(core|physics)\.js$|\/highlights\/(controller|attack|reception)\.js$/.test(s.filename))) vm.runInNewContext(source, { window }, { filename });
  const { Core, Physics, AttackController, ReceptionController } = window.ShoparFootball;
  const player = Core.makePlayer(reception ? 485 : 500, reception ? 428 : 365, 'blue', 9);
  const ball = { ...Core.possessionPosition(player), z: 0, vx: 0, vy: 0, vz: 0, spin: 0, rotation: 0, age: 0 };
  const keeper = { ...Core.makePlayer(500, 100, 'keeper', 1), profile: 'line', homeY: 100, reaction: .1, dive: 0, diveCooldown: 0, targetX: 500 };
  const play = { controlled: player, aim: null, kick: null, contact: null, motionTime: 0, flight: null, interceptTarget: null };
  const events = [], received = [], resultDelay = { pending: false, remaining: 2 };
  const flow = { state: 'HIGHLIGHT_INTRO', elapsed: 0, transition(next) { this.state = next; this.elapsed = 0; events.push(next); } };
  const context = Object.freeze({ player, ball, keeper, mates: [], defenders: [], play, flow, resultDelay, memory: {},
    view: { scale: 1, x: 0, y: 0, width: 1000, height: 740 }, time: 0, reducedMotion: true,
    physics: { ...Physics }, geometry: { worldToScreen: p => ({ x: p.x, y: p.y - p.z * Core.HEIGHT_PROJECTION }), possessionPosition: p => Core.possessionPosition(p), ballGeometry: b => Core.ballGeometry(b), maxDrag: () => 180, contactGeometry: () => ({ x: 500, y: 370, r: 100 }) },
    effects: { trail: [], shake: 0, netWobble: 0, netImpact(result, contact, strength) {
      if (contact && !result.netHit) { result.netHit = true; this.netWobble = strength; }
    }, ripple: () => {} }, audio: { play: kind => events.push(kind) },
    feedback: { power: () => {}, toast: () => {}, flight: () => {}, contactTimer: () => {}, invalidContact: () => events.push('invalid-contact') },
    possessionReceived: offBall => received.push(offBall), complete(kind) { resultDelay.pending = true; events.push(kind); } });
  const controller = new (reception ? ReceptionController : AttackController)(context);
  function tick(dt) { flow.elapsed += dt; controller.update(dt); }
  return { controller, context, tick, events, received, Core };
}

test('headless attack supports aim cancellation, invalid contact, delayed execution and real contact timeout', () => {
  const { controller: c, context: x, tick, events } = headless(); c.enter();
  const start = { x: x.ball.x, y: x.ball.y }, point = { x: start.x + 50, y: start.y + 180 };
  assert.equal(c.handleInput({ type: 'down', point: start }).capture, true);
  c.handleInput({ type: 'move', start, point }); c.cancelInput();
  assert.equal(x.play.aim, null); assert.equal(x.play.kick, null);
  c.handleInput({ type: 'down', point: start }); c.handleInput({ type: 'move', start, point }); c.handleInput({ type: 'up', point });
  assert.equal(x.flow.state, 'BALL_CONTACT');
  c.handleInput({ type: 'up', point: { x: 700, y: 370 } });
  assert.equal(x.play.contact, null); assert.ok(events.includes('invalid-contact'));
  tick(6); assert.equal(x.play.contact.timedOut, true); assert.equal(x.flow.state, 'BALL_CONTACT');
  tick(.23); assert.equal(x.flow.state, 'BALL_CONTACT'); tick(.001);
  assert.equal(x.flow.state, 'BALL_IN_MOTION'); assert.ok(x.ball.vy < 0); assert.equal(x.play.kicker, x.player);
  assert.equal(events.filter(e => e === 'kick').length, 1); assert.equal(c.game, undefined);
});

test('headless attacking AI moves before integration and a goal crossing wins over keeper contact', () => {
  const { controller: c, context: x, events } = headless(); c.enter();
  Object.assign(x.ball, { x: 500, y: 85, z: 0, vx: 0, vy: -400, vz: 0, age: .3 });
  x.play.kicker = x.player; x.keeper.reaction = 0;
  const order = [], move = x.physics.movePlayer, integrate = x.physics.integrateBall;
  x.physics.movePlayer = (...args) => { order.push('move'); return move(...args); };
  x.physics.integrateBall = (...args) => { order.push('integrate'); return integrate(...args); };
  c.updateMotion(.01);
  assert.deepEqual(order, ['move', 'integrate']);
  assert.equal(events.at(-1), 'goal'); assert.equal(events.includes('save'), false);
  const resolution = { kind: 'goal', elapsed: 0, crossing: { x: 500, y: 84, z: 0 } };
  for (let i = 0; i < 120; i++) c.updateResult(1 / 120, resolution);
  assert.equal(resolution.netHit, true); assert.ok(x.ball.y < 84); assert.ok(x.effects.netWobble > 0);
  assert.equal(x.resultDelay.remaining, 2, 'the host alone advances the screen countdown');
});

test('headless Read the game receives an actual moving pass then shares the attack flow', () => {
  const { controller: c, context: x, tick, received } = headless(true); c.enter();
  assert.equal(x.flow.state, 'INTERCEPTION');
  assert.equal(c.handleInput({ type: 'down', point: { x: 500, y: 320 } }).capture, false);
  for (let i = 0; i < 600 && x.flow.state === 'INTERCEPTION'; i++) tick(1 / 120);
  assert.equal(x.flow.state, 'AIMING'); assert.deepEqual(received, [true]);
  assert.equal(x.play.controlled, x.player); assert.equal(x.ball.vx, 0); assert.equal(x.play.flight, null);
  const start = { x: x.ball.x, y: x.ball.y }, point = { x: start.x + 40, y: start.y + 180 };
  c.handleInput({ type: 'down', point: start }); c.handleInput({ type: 'move', start, point }); c.handleInput({ type: 'up', point });
  assert.equal(x.flow.state, 'BALL_CONTACT');
  c.handleInput({ type: 'up', point: { x: 500, y: 370 } }); tick(.24);
  assert.equal(x.flow.state, 'BALL_IN_MOTION'); assert.equal(x.play.kicker, x.player);
  const missed = headless(true); missed.controller.enter();
  for (let i = 0; i < 600 && !missed.context.resultDelay.pending; i++) missed.tick(1 / 120);
  assert.equal(missed.events.at(-1), 'lost'); assert.deepEqual(missed.received, []);
});
