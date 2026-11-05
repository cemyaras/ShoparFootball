'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { runtimeScripts } = require('./helpers/runtime.cjs');

function headless(presentation = {}, angle) {
  const window = {};
  for (const { source, filename } of runtimeScripts().filter(s => /\/(core|physics|projection|renderer)\.js$|\/highlights\/controller\.js$/.test(s.filename))) vm.runInNewContext(source, { window }, { filename });
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
    view: Object.freeze({ width: 1000, height: 740, scale: .8, x: 40, y: 50,
      ...(angle === undefined ? {} : { projection: window.ShoparFootball.Projection.create(angle) }) }),
    get player() { return world.player; }, get keeper() { return world.keeper; }, get mates() { return world.mates; }, get defenders() { return world.defenders; },
    get ball() { return world.ball; }, get resolution() { return world.resolution; }, get aim() { return world.aim; }, get contact() { return world.contact; },
    trail: world.trail, ripples: world.ripples, particles: world.particles, crowd: [], excited: false, netWobble: .3, shake: 1, flash: .1, reducedMotion: false, banner: null,
    environment: Object.freeze({ pitch: 'stadium', palette: { outside: '#123', line: '#fff' }, drawRunoff() {}, drawSurface() {}, drawAtmosphere() { log.push(['atmosphere']); } }),
    actorPose: actor => Controllers.actorPose(context, actor), presentation: () => presentation, drawWorld: () => log.push(['world']), drawOverlay: () => log.push(['overlay']),
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

test('CanvasRenderer draws a CSS-sized lifted cursor and finger connector without mutating presentation', () => {
  const presentation=freeze({aimingPath:[{x:512,y:377},{x:450,y:200},{x:415,y:37.2}],
    aimCursor:{x:415,y:37.2,finger:{x:415,y:105.95}},shotTarget:{x:415,y:84,z:90,label:'AIM HIGH'},
    shotPreview:[{x:512,y:377,z:0},{x:9876,y:6543,z:20}]});
  const h=headless(presentation),before=JSON.stringify(presentation);freeze(h.world);h.renderer.render();
  assert.equal(JSON.stringify(presentation),before);
  assert.ok(h.log.some(call=>call[0]==='moveTo'&&call[1]===415&&call[2]===105.95));
  assert.ok(h.log.some(call=>call[0]==='arc'&&call[1]===415&&call[2]===37.2&&call[3]===5/.8));
  assert.ok(h.log.some(call=>call[0]==='lineTo'&&call[1]===415&&call[2]===37.2));
  assert.ok(!h.log.some(call=>call[0]==='lineTo'&&call[1]===9876),'touch hides the physical preview');
  assert.ok(!h.log.some(call=>call[0]==='fillText'&&call[1]==='AIM HIGH'),'touch uses only the crosshair');
});

test('CanvasRenderer keeps mouse flight preview, height projection and target labels', () => {
  const h=headless(freeze({shotPreview:[{x:512,y:377,z:0},{x:9876,y:6543,z:20}],shotTarget:{x:415,y:84,z:90,label:'AIM HIGH'}}));
  h.renderer.render();
  assert.ok(h.log.some(call=>call[0]==='lineTo'&&call[1]===9876&&call[2]===6543-20*.52));
  assert.ok(h.log.some(call=>call[0]==='fillText'&&call[1]==='AIM HIGH'));
});

test('CanvasRenderer uses the same intent path and cursor for mouse without a finger connector', () => {
  const path=[{x:512,y:377},{x:470,y:200},{x:415,y:37.2}];
  const presentation=freeze({aimingPath:path,aimCursor:{...path.at(-1),finger:null},
    shotTarget:{x:415,y:84,z:90,label:'AIM HIGH'},shotPreview:[{x:512,y:377,z:0},{x:9876,y:6543,z:20}]});
  const h=headless(presentation),before=JSON.stringify(presentation);freeze(h.world);h.renderer.render();
  assert.equal(JSON.stringify(presentation),before);
  for(const p of path.slice(1))assert.ok(h.log.some(call=>call[0]==='lineTo'&&call[1]===p.x&&call[2]===p.y));
  assert.ok(h.log.some(call=>call[0]==='arc'&&call[1]===415&&call[2]===37.2&&call[3]===5/.8));
  assert.ok(!h.log.some(call=>call[0]==='lineTo'&&call[1]===9876),'intent path hides the physical preview for mouse too');
  assert.ok(!h.log.some(call=>call[0]==='fillText'&&call[1]==='AIM HIGH'),'mouse uses the shared crosshair');
  assert.ok(!h.log.some(call=>call[0]==='setLineDash'&&call[1]?.[0]===2/.8&&call[1]?.[1]===4/.8),'mouse does not draw a finger connector');
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

test('perspective net ball and near net precede the foreground keeper', () => {
  const h = headless({ ballInNet: true }, 25);
  Object.assign(h.world.ball, { x: 500, y: 70, z: 20 });
  const order = [];
  for (const name of ['drawPitch', 'drawTrail', 'drawBallShadow']) h.renderer[name] = () => {};
  h.renderer.drawGoalBack = (_c, near) => order.push(near ? 'near-net' : 'far-net');
  h.renderer.drawGoalFront = () => order.push('frame');
  h.renderer.drawBall = () => order.push('ball');
  h.renderer.drawPlayer = (_c, actor) => order.push(actor === h.world.keeper ? 'keeper' : 'player');
  h.renderer.render();
  assert.ok(order.indexOf('far-net') < order.indexOf('ball'));
  assert.ok(order.indexOf('ball') < order.indexOf('near-net'));
  assert.ok(order.indexOf('near-net') < order.indexOf('keeper'));
  assert.ok(order.indexOf('frame') < order.indexOf('keeper'));
});

test('perspective goal paints each net panel once across its two layers', () => {
  const h = headless({}, 20);
  h.renderer.drawGoalBack(h.scene.ctx);
  h.renderer.drawGoalBack(h.scene.ctx, true);
  assert.equal(h.log.filter(call => call[0] === 'clip').length, 4);
});

test('perspective rendering preserves frozen world state at every preview angle', () => {
  for (const angle of [12, 20, 25, 30]) {
    const h = headless({}, angle);
    freeze(h.world);
    const before = JSON.stringify(h.world);
    h.renderer.render();
    assert.equal(JSON.stringify(h.world), before);
    assert.equal(h.log.filter(call => call[0] === 'save').length,
      h.log.filter(call => call[0] === 'restore').length);
  }
});

test('net deformation stays on the struck panel, fixes its anchors and expires', () => {
  const h = headless({}, 20), { world, scene, renderer, CanvasRenderer, log } = h;
  const draw = (near = false, target = renderer) => {
    log.length = 0;
    target.drawGoalBack(scene.ctx, near);
    return [...log];
  };
  const still = draw(), farFromImpact = draw(true);
  const impact = { surface: 'back', x: 500, y: 60, z: 50, time: scene.time - .1, strength: 1 };
  world.resolution = { kind: 'goal', netHit: true, netImpact: impact };
  const before = JSON.stringify(world.resolution), deformed = draw();
  assert.ok(deformed.length > still.length);
  assert.deepEqual(deformed.filter(call => call[0] === 'moveTo'), still.filter(call => call[0] === 'moveTo'));
  assert.deepEqual(draw(true), farFromImpact);
  assert.deepEqual(draw(false, new CanvasRenderer({ ...scene, reducedMotion: true })), still);
  assert.equal(JSON.stringify(world.resolution), before);
  impact.time = scene.time - .46;
  assert.deepEqual(draw(), still);
});

test('opponents and keepers use the block sprite style under a projection and stay flat without one', () => {
  const solids = (angle, pick) => {
    const h = headless({}, angle);
    h.renderer.drawPlayer(h.scene.ctx, pick(h.world));
    return h.log.filter(call => call[0] === 'closePath').length;
  };
  for (const pick of [world => ({ ...world.player, team: 'red', number: 4 }), world => world.keeper, world => world.mates[0]]) {
    assert.ok(solids(30, pick) > 0);
    assert.equal(solids(undefined, pick), 0);
  }
});

test('a ball beyond the right post is drawn after the near net while one inside the mouth is drawn before it', () => {
  for (const [x, before] of [[500, true], [640, false]]) {
    const h = headless({}, 30);
    Object.assign(h.world.ball, { x, y: 70, z: 5 });
    const order = [];
    for (const name of ['drawPitch', 'drawTrail', 'drawBallShadow', 'drawGoalFront']) h.renderer[name] = () => {};
    h.renderer.drawGoalBack = (_c, near) => near && order.push('near-net');
    h.renderer.drawBall = () => order.push('ball'); h.renderer.drawPlayer = () => {};
    h.renderer.render();
    assert.equal(order.indexOf('ball') < order.indexOf('near-net'), before);
  }
});

test('smaller angled-camera sprites keep keeper gloves on their physical contact centres', () => {
  const h = headless({}, 30), hands = [{ x: -12, y: -16 }, { x: 12, y: -16 }];
  const renderer = new h.CanvasRenderer({ ...h.scene, actorPose: () => ({ keeperHands: hands, hop: 0 }) });
  renderer.drawPlayer(h.scene.ctx, h.world.keeper);
  const [, sx] = h.log.find(call => call[0] === 'scale');
  assert.ok(sx < 1.1, 'the keeper sprite is drawn smaller than its gameplay scale');
  for (const hand of hands) {
    // Local glove corner times the drawn scale must equal the gameplay glove offset (hand x keeper scale).
    const glove = h.log.find(call => call[0] === 'fillRect' && Math.abs((call[1] + 2.5) * sx - hand.x * 1.1) < 1e-9
      && Math.abs((call[2] + 2.5) * sx - hand.y * 1.1) < 1e-9);
    assert.ok(glove, 'glove drawn at ' + JSON.stringify(hand));
  }
});
