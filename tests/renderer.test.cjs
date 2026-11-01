'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { runtimeScripts } = require('./helpers/runtime.cjs');

function headless() {
  const window = {};
  for (const { source, filename } of runtimeScripts().filter(s => /\/(core|physics|renderer)\.js$|\/highlights\/controller\.js$/.test(s.filename))) vm.runInNewContext(source, { window }, { filename });
  const { Core, Physics, Controllers, CanvasRenderer } = window.ShoparFootball;
  const player = Core.makePlayer(500, 365, 'blue', 9), keeper = { ...Core.makePlayer(500, 100, 'keeper', 1), dive: 0 };
  const ball = { ...Core.possessionPosition(player), z: 0, vx: 0, vy: 0, vz: 0, spin: 0, rotation: 0, age: 0 };
  const world = { player, keeper, mates: [Core.makePlayer(680, 350, 'blue', 7)], defenders: [], ball,
    play: { controlled: player, kicker: player, motionTime: .1 }, trail: [], ripples: [], particles: [], resolution: null, aim: null, contact: null };
  const log = [];
  const ctx = new Proxy({}, {
    set(target, key, value) { target[key] = value; return true; },
    get(target, key) { return key in target ? target[key] : (...args) => { log.push([key, ...args]); return key.startsWith('create') ? { addColorStop() {} } : undefined; }; }
  });
  let state = 'AIMING', previewSteps = 0;
  const context = { flow: { get state() { return state; } }, play: world.play, get resolution() { return world.resolution; } };
  const scene = Object.freeze({ ctx, get state() { return state; }, stateTime: .1, time: 1.1, dpr: 2,
    view: Object.freeze({ width: 1000, height: 740, scale: .8, x: 40, y: 50 }),
    get player() { return world.player; }, get keeper() { return world.keeper; }, get mates() { return world.mates; }, get defenders() { return world.defenders; },
    get ball() { return world.ball; }, get resolution() { return world.resolution; }, get aim() { return world.aim; }, get contact() { return world.contact; },
    trail: world.trail, ripples: world.ripples, particles: world.particles, crowd: [], excited: false, netWobble: .3, shake: 1, flash: .1, reducedMotion: false, banner: null,
    environment: Object.freeze({ pitch: 'stadium', palette: { outside: '#123', line: '#fff' }, drawRunoff() {}, drawSurface() {}, drawAtmosphere() { log.push(['atmosphere']); } }),
    actorPose: actor => Controllers.actorPose(context, actor), presentation: () => ({}), drawWorld: () => log.push(['world']), drawOverlay: () => log.push(['overlay']),
    geometry: Object.freeze({ playerScale: p => Core.playerScale(p), ballGeometry: b => Core.ballGeometry(b), goalGeometry: () => Core.goalGeometry(), maxDrag: () => 150, contactGeometry: () => ({ x: 500, y: 370, r: 100 }) }),
    physics: Object.freeze({ kickVelocity: Physics.kickVelocity, integrateBall(b, dt) { assert.notEqual(b, world.ball); previewSteps++; return Physics.integrateBall(b, dt); } }) });
  return { Core, Controllers, CanvasRenderer, renderer: new CanvasRenderer(scene), scene, world, log,
    setState(value) { state = value; }, get previewSteps() { return previewSteps; } };
}
function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

test('CanvasRenderer renders frozen scene objects without a DOM, game or controller and previews only a local ball', () => {
  const h = headless(), { renderer, world, scene } = h;
  world.aim = { dx: -.28, dy: -.96, power: 1, distance: 150 };
  freeze(world); const before = JSON.stringify(world);
  renderer.render(); renderer.render();
  assert.ok(h.previewSteps > 0); assert.equal(JSON.stringify(world), before);
  assert.equal(renderer.game, undefined);
  for (const key of ['game', 'controller', 'defense', 'document', 'canvas', 'pointer', 'session', 'stats']) assert.equal(scene[key], undefined);
  assert.ok(Object.isFrozen(scene));
  const contact = headless(); contact.world.contact = { x: .6, y: -.7, age: .1 }; contact.setState('BALL_CONTACT'); freeze(contact.world);
  const contactBefore = JSON.stringify(contact.world); contact.renderer.render();
  assert.equal(JSON.stringify(contact.world), contactBefore); assert.equal(contact.previewSteps, 0);
});

test('CanvasRenderer preserves world/contact/screen layer ordering and the viewport transform', () => {
  const h = headless(), { CanvasRenderer, scene, log } = h; h.setState('BALL_CONTACT');
  const drawing = Object.fromEntries(CanvasRenderer.drawMethods.map(name => [name, () => { log.push([name]); return name === 'ballAboveGoal' ? false : undefined; }]));
  new CanvasRenderer(scene, drawing).render();
  const names = log.map(call => call[0]);
  for (const [earlier, later] of [['drawPitch', 'drawGoalBack'], ['drawRunMarkers', 'world'], ['world', 'drawTrail'], ['drawBallShadow', 'drawPlayer'], ['drawPlayer', 'drawGoalFront'], ['drawGoalFront', 'atmosphere'], ['atmosphere', 'drawContact'], ['drawContact', 'overlay'], ['overlay', 'drawArcadeBanner']]) {
    assert.ok(names.indexOf(earlier) < names.indexOf(later), `${earlier} before ${later}`);
  }
  assert.deepEqual(log[0], ['setTransform', 2, 0, 0, 2, 0, 0]);
  assert.ok(log.some(call => JSON.stringify(call) === JSON.stringify(['translate', 40, 50])));
  assert.ok(log.some(call => JSON.stringify(call) === JSON.stringify(['scale', .8, .8])));
  assert.equal(names[names.indexOf('overlay') - 1], 'restore', 'screen hooks follow world-transform restoration');
});

test('shared pose data resolves controlled, running, kick, tackle and keeper save presentation without drawing', () => {
  const { Controllers, world } = headless(), context = { flow: { state: 'DEFENDING' }, play: world.play };
  const actor = world.player; actor.step = 2; actor.celebration = 1;
  const activity = { moving: true, tackling: true, lean: .4 }, before = JSON.stringify({ actor, activity, context });
  const pose = Controllers.actorPose(context, actor, activity);
  assert.ok(pose.controlled && pose.moving && pose.kicking && pose.celebrating && pose.tackling);
  assert.equal(pose.lean, .4); assert.ok(pose.hop < 0); assert.notEqual(pose.stride, 0);
  assert.equal(JSON.stringify({ actor, activity, context }), before);
  context.flow.state = 'BALL_CONTACT'; assert.equal(Controllers.actorPose(context, actor, activity).controlled, false);
  context.resolution = { kind: 'save' }; world.keeper.dive = .4; world.keeper.diveDirection = -1;
  const keeperPose = Controllers.actorPose(context, world.keeper);
  assert.ok(keeperPose.diving && keeperPose.holdingBall); assert.equal(keeperPose.diveLean, .75);
});
