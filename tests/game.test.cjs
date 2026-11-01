'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
const defenseSource = fs.readFileSync(path.join(__dirname, '../src/js/defense.js'), 'utf8');
const environmentSource = fs.readFileSync(path.join(__dirname, '../src/js/environment.js'), 'utf8');

// A minimal browser surface for deterministic game/state tests. Visual QA uses a real browser.
function fixture(width = 1000, height = 740) {
  const elements = new Map();
  const noop = () => {};
  const gradient = { addColorStop: noop };
  const ctx = new Proxy({}, { get: (target, key) => key in target ? target[key] : key.startsWith('create') ? () => gradient : noop });
  function element(id = '') {
    const children = new Map();
    return {
      textContent: '', innerHTML: '', style: {}, dataset: {}, children: [],
      classList: { toggle: noop, add: noop, remove: noop },
      addEventListener: noop, removeEventListener: noop, setAttribute: noop,
      showModal() { this.open = true; }, close() { this.open = false; },
      getBoundingClientRect: () => ({ x: 0, y: 0, left: 0, top: 0, width, height }),
      querySelectorAll: () => [],
      querySelector: selector => {
        if (!children.has(selector)) children.set(selector, element());
        return children.get(selector);
      },
      getContext: () => ctx, hasPointerCapture: () => false, releasePointerCapture: noop, setPointerCapture: noop
    };
  }
  const document = {
    body: element('body'), addEventListener: noop, removeEventListener: noop,
    getElementById: id => {
      if (!elements.has(id)) {
        const node = element(id);
        if (id === 'chapter-progress') node.children = Array.from({ length: 7 }, () => element());
        elements.set(id, node);
      }
      return elements.get(id);
    }
  };
  const window = {
    devicePixelRatio: 1, addEventListener: noop, removeEventListener: noop,
    matchMedia: query => ({ matches: query.includes('prefers-reduced-motion') ? true : width <= 1024 })
  };
  const sandbox = { window, document, requestAnimationFrame: () => 1, cancelAnimationFrame: noop, ResizeObserver: class { observe() {} disconnect() {} } };
  vm.runInNewContext(environmentSource, sandbox, { filename: 'environment.js' });
  vm.runInNewContext(defenseSource, sandbox, { filename: 'defense.js' });
  vm.runInNewContext(source, sandbox, { filename: 'game.js' });
  return { game: window.footballGame, elements };
}

function start(game, index = 0) {
  game.index = index;
  game.beginHighlight();
  game.update(.9);
}

function kick(game, { x = 500, y = 84, power = 1, cy = 0, cx = 0 } = {}) {
  const dx = x - game.ball.x, dy = y - game.ball.y, distance = Math.hypot(dx, dy);
  game.kick = { dx: dx / distance, dy: dy / distance, power };
  game.contact = { x: cx, y: cy, age: 1, timedOut: false };
  game.executeKick();
}

function until(game, predicate, seconds = 25) {
  for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 120) {
    if (predicate()) return elapsed;
    game.update(1 / 120);
  }
  assert.fail(`Game did not resolve: ${game.state}`);
}

function shot(options) {
  const fixtureData = fixture();
  start(fixtureData.game);
  kick(fixtureData.game, options);
  until(fixtureData.game, () => fixtureData.game.pendingResult);
  return fixtureData;
}

test('a corner goal visibly enters the net and falls to the ground', () => {
  const { game: g } = shot({ x: 420 });
  assert.equal(g.resolution.kind, 'goal');
  assert.equal(g.stats.goals, 1);
  g.update(.25);
  assert.equal(g.resolution.netHit, true);
  assert.ok(g.ball.y < 84 && g.ball.y >= 60);
  until(g, () => g.state === 'RESULT');
  assert.ok(g.ball.z < 3);
  assert.ok(g.ball.y < 70, 'the net should absorb the ball and keep it deep inside');
  assert.equal(g.stats.goals, 1);
});

test('a central ground shot is held by the keeper after a real collision', () => {
  const { game: g, elements } = shot({ x: 500, power: .8 });
  assert.equal(g.resolution.kind, 'save');
  until(g, () => g.state === 'RESULT');
  assert.equal(g.stats.goals, 0);
  assert.ok(Math.abs(g.ball.x - g.keeper.x) < 1);
  assert.ok(Math.abs(g.ball.y - (g.keeper.y - 11)) < 1);
  assert.ok(g.ball.z < .01);
  assert.match(elements.get('result-title').textContent, /Saved/);
});

test('a valid chip clears the keeper and fits below the crossbar', () => {
  const { game: g, elements } = shot({ cy: .6 });
  assert.equal(g.resolution.kind, 'goal');
  assert.equal(g.flight.clearedKeeper, true);
  assert.match(elements.get('result-title').textContent, /Over the keeper/);
  until(g, () => g.state === 'RESULT');
  assert.ok(g.ball.z < 3, 'a chip must land rather than freeze in mid-air');
});

test('too much loft travels over the bar and keeps moving behind the goal', () => {
  const { game: g, elements } = shot({ power: .65, cy: 1 });
  assert.equal(g.resolution.kind, 'high');
  const previousY = g.ball.y;
  g.update(.2);
  assert.ok(g.ball.y < previousY);
  assert.equal(g.stats.goals, 0);
  assert.match(elements.get('result-title').textContent, /Over the crossbar/);
  assert.equal(g.ballAboveGoal(), true);
});

test('a shot grazing the crossbar rebounds instead of being counted as a goal', () => {
  const { game: g } = shot({ cy: .75 });
  assert.equal(g.resolution.kind, 'bar');
  assert.ok(g.ball.vy > 0);
  g.update(.2);
  assert.ok(g.ball.y > 84);
  assert.equal(g.stats.goals, 0);
});

test('a shot against an upright rebounds, while a wide shot passes outside', () => {
  const { game: post } = shot({ x: 400 });
  assert.equal(post.resolution.kind, 'post');
  assert.equal(post.stats.goals, 0);
  const { game: wide } = shot({ x: 730 });
  assert.equal(wide.resolution.kind, 'wide');
  const y = wide.ball.y;
  wide.update(.2);
  assert.ok(wide.ball.y < y);
});

test('the full ball must fit under the bar, independently of viewport size', () => {
  for (const width of [320, 768, 1440]) {
    for (const [z, expected] of [[90, 'goal'], [103, 'bar'], [140, 'high']]) {
      const { game: g } = fixture(width, 740);
      start(g);
      g.state = 'BALL_IN_MOTION';
      g.keeper.x = 800;
      Object.assign(g.ball, { x: 500, y: 85, z, vx: 0, vy: -300, vz: 0, age: .3 });
      g.updateMotion(1 / 120);
      assert.equal(g.resolution.kind, expected, `${width}px, height ${z}`);
    }
  }
});

test('balls above the goal are drawn after the crossbar, low balls before it', () => {
  const { game: g } = fixture();
  const order = [];
  g.drawGoalFront = () => order.push('frame');
  g.drawBall = () => order.push('ball');
  g.ball.z = 150;
  g.render();
  assert.ok(order.lastIndexOf('ball') > order.indexOf('frame'));
  order.length = 0;
  g.ball.z = 0;
  g.render();
  assert.ok(order.indexOf('ball') < order.indexOf('frame'));
});

test('near-goal slow motion gives the action time to be read', () => {
  const { game: g } = fixture();
  start(g); kick(g, { x: 420 });
  const elapsed = until(g, () => g.pendingResult);
  assert.ok(elapsed > .7 && elapsed < 3, `${elapsed}s`);
});

test('flight feedback distinguishes rising, dropping, and above-bar height', () => {
  const { game: g, elements } = fixture();
  start(g); kick(g);
  Object.assign(g.ball, { z: 40, vz: 90 }); g.updateFlightUI();
  assert.match(elements.get('bottom-hint').textContent, /RISING/);
  g.ball.vz = -90; g.updateFlightUI();
  assert.match(elements.get('bottom-hint').textContent, /DROPPING/);
  g.ball.z = 140; g.updateFlightUI();
  assert.equal(elements.get('flight-label').textContent, 'ABOVE BAR');
});

test('a resolved chance cannot award duplicate goals', () => {
  const { game: g } = shot({ x: 420 });
  g.finish('goal');
  assert.equal(g.stats.goals, 1);
});

test('restart clears the previous result, banner, flight, and net animation', () => {
  const { game: g } = shot({ x: 420 });
  g.update(.2); g.restart();
  assert.equal(g.resolution, null);
  assert.equal(g.pendingResult, null);
  assert.equal(g.banner, null);
  assert.equal(g.flight, null);
  assert.equal(g.netWobble, 0);
  assert.equal(g.stats.goals, 0);
  g.update(.9);
  assert.equal(g.state, 'AIMING');
});

test('teammates receive and return passes', () => {
  const { game: g } = fixture();
  start(g, 3);
  kick(g, { x: 680, y: 335, power: .6 });
  until(g, () => g.state === 'AIMING');
  assert.equal(g.stats.passes, 1);
  assert.notEqual(g.controlled, g.player);
  kick(g, { x: 379, y: 425, power: .6 });
  until(g, () => g.state === 'AIMING');
  assert.equal(g.stats.passes, 2);
  assert.equal(g.controlled, g.player);
});

test('a goal can be scored directly from a combination highlight without an action selection', () => {
  const { game: g } = fixture();
  start(g, 3); g.defenders = [];
  kick(g, { x: 420 }); until(g, () => g.pendingResult);
  assert.equal(g.resolution.kind, 'goal');
  assert.equal(g.stats.goals, 1);
});

test('a teammate can receive a kick in a long-shot highlight without an action selection', () => {
  const { game: g } = fixture();
  start(g, 1); g.defenders = [];
  kick(g, { x: 735, y: 330, power: .5 });
  until(g, () => g.state === 'AIMING');
  assert.equal(g.stats.passes, 1);
  assert.notEqual(g.controlled, g.player);
});

test('a missed contact window and the complete seven-highlight session resolve without freezing', () => {
  const { game: g } = fixture();
  for (let index = 0; index < 5; index++) {
    start(g, index);
    if (index === 4) {
      g.interceptTarget = { x: 500, y: 320 };
      until(g, () => g.state === 'AIMING');
    }
    if (index === 0) {
      g.kick = { dx: 0, dy: -1, power: .8 };
      g.transition('BALL_CONTACT');
    } else kick(g, { x: 420 });
    until(g, () => g.state === 'RESULT');
    assert.equal(g.stats.goals + g.stats.misses, index + 1);
  }
  g.nextHighlight();
  assert.equal(g.index, 5);
  g.update(.9);
  assert.equal(g.state, 'DEFENDING');
  until(g, () => g.state === 'RESULT');
  assert.equal(g.stats.misses + g.stats.goals + g.stats.tackles, 6);
  g.nextHighlight(); g.update(.9);
  assert.equal(g.index, 6);
  until(g, () => g.state === 'RESULT');
  assert.equal(g.stats.misses + g.stats.goals + g.stats.tackles, 7);
  g.nextHighlight();
  assert.equal(g.state, 'SESSION_SUMMARY');
});

test('a touch at the bottom edge of the close-up ball is accepted and normalized', () => {
  const { game: g } = fixture(390, 600);
  start(g);
  g.kick = { dx: 0, dy: -1, power: .65 };
  g.transition('BALL_CONTACT');
  const ball = g.contactGeometry(), view = g.view;
  const event = { button: 0, pointerId: 1, isPrimary: true, clientX: view.x + ball.x * view.scale, clientY: view.y + (ball.y + ball.r) * view.scale + .001, preventDefault() {} };
  g.onPointerDown(event); g.onPointerUp(event);
  assert.ok(g.contact && g.contact.y > .99 && g.contact.y <= 1);
  until(g, () => g.state === 'RESULT');
});

test('full-power bottom contact can go cleanly over the bar', () => {
  const { game: g } = shot({ power: 1, cy: 1 });
  assert.equal(g.resolution.kind, 'high');
  assert.ok(g.ball.vy < 0, 'a clear miss must continue behind the goal');
  const y = g.ball.y;
  g.update(.2);
  assert.ok(g.ball.y < y);
  assert.equal(g.stats.goals, 0);
  assert.equal(g.resolution.netHit, false);
});

test('shot power affects upward launch as well as forward speed', () => {
  const { game: g } = fixture();
  const contact = { x: 0, y: 1, timedOut: false };
  const weak = g.kickVelocity({ dx: 0, dy: -1, power: .5 }, contact);
  const strong = g.kickVelocity({ dx: 0, dy: -1, power: 1 }, contact);
  assert.ok(strong.vz > weak.vz * 1.25);
  assert.ok(Math.abs(strong.vy) > Math.abs(weak.vy));
});

test('clear misses above and around the goal corners never rebound off invisible frame', () => {
  for (const width of [320, 768, 1440]) {
    for (const [x, z, expected] of [[500, 126, 'high'], [392, 110, 'wide'], [608, 110, 'wide'], [392, 126, 'wide'], [608, 126, 'wide'], [393, 118, 'wide'], [607, 118, 'wide']]) {
      const { game: g } = fixture(width, 740);
      start(g);
      g.state = 'BALL_IN_MOTION'; g.keeper.x = 800;
      Object.assign(g.ball, { x, y: 85, z, vx: 0, vy: -300, vz: 0, age: .3 });
      g.updateMotion(1 / 120);
      assert.equal(g.resolution.kind, expected, `${width}px, x=${x}, height=${z}`);
      assert.ok(g.ball.vy < 0, 'a miss cannot reverse direction');
    }
  }
});

test('very low contact at full power produces real misses across different aim directions', () => {
  for (const x of [350, 420, 500, 580, 650]) {
    const { game: g } = shot({ x, power: 1, cy: 1 });
    assert.ok(['high', 'wide'].includes(g.resolution.kind), `aim ${x}: ${g.resolution.kind}`);
    assert.ok(g.ball.vy < 0);
    assert.equal(g.stats.goals, 0);
    assert.equal(g.resolution.netHit, false);
  }
});

test('every venue and forecast preserves goals, clear misses, and restart preferences', () => {
  for (const pitch of ['stadium', 'street', 'dirt']) {
    for (const weather of ['sunny', 'cloudy', 'rain', 'snow']) {
      const { game: g } = fixture();
      g.environment.set(pitch, weather);
      start(g); kick(g, { x: 420 });
      until(g, () => g.pendingResult);
      assert.equal(g.resolution.kind, 'goal', `${pitch}/${weather}`);
      g.render(); g.restart(); g.update(.9);
      assert.equal(g.environment.pitch, pitch);
      assert.equal(g.environment.weather, weather);
      kick(g, { cy: 1 }); until(g, () => g.pendingResult);
      assert.equal(g.resolution.kind, 'high', `${pitch}/${weather}`);
      assert.ok(g.ball.vy < 0);
      g.render();
    }
  }
});

test('opening conditions pauses both contact timeout and a moving ball', () => {
  const { game: g, elements } = fixture();
  start(g);
  g.kick = { dx: 0, dy: -1, power: 1 };
  g.transition('BALL_CONTACT');
  const dialog = elements.get('conditions-dialog');
  dialog.open = true;
  g.update(8);
  assert.equal(g.state, 'BALL_CONTACT');
  assert.equal(g.stateTime, 0);
  assert.equal(g.contact, null);
  dialog.open = false; kick(g, { x: 420 });
  const before = JSON.stringify(g.ball), stats = JSON.stringify(g.stats);
  dialog.open = true; g.environment.set('street', 'rain'); g.update(8);
  assert.equal(JSON.stringify(g.ball), before);
  assert.equal(JSON.stringify(g.stats), stats);
  dialog.open = false; until(g, () => g.pendingResult);
  assert.equal(g.resolution.kind, 'goal');
});

test('conditions persist and reject corrupt or unknown saved values', () => {
  let stored = null;
  const window = { localStorage: { getItem: () => stored, setItem: (key, value) => { stored = value; } } };
  vm.runInNewContext(environmentSource, { window });
  const Environment = window.FootballEnvironment;
  new Environment().set('dirt', 'snow');
  const restored = new Environment();
  assert.equal(restored.pitch, 'dirt'); assert.equal(restored.weather, 'snow');
  restored.set('__proto__', 'constructor');
  assert.equal(restored.pitch, 'dirt'); assert.equal(restored.weather, 'snow');
  for (const invalid of ['broken-json', '{"pitch":"unknown","weather":"invalid"}', 'null']) {
    stored = invalid;
    const fallback = new Environment();
    assert.equal(fallback.pitch, 'stadium'); assert.equal(fallback.weather, 'sunny');
  }
});

test('conditions remain usable when browser storage is blocked', () => {
  const window = { get localStorage() { throw new Error('Storage denied'); } };
  vm.runInNewContext(environmentSource, { window });
  const env = new window.FootballEnvironment();
  env.set('street', 'rain');
  assert.equal(env.label, 'Street · Rain');
});

test('over-bar misses leave the visible pitch without a rebound or a long replay', () => {
  const crossingHeights = [];
  for (const [power, cy] of [[1, .85], [1, .9], [1, 1], [.8, 1], [.65, 1]]) {
    const { game: g } = shot({ power, cy });
    const elapsed = until(g, () => g.state === 'RESULT');
    assert.ok(elapsed < 2.5, 'do not follow an out-of-play ball to its distant landing');
    assert.equal(g.resolution.exited, true);
    assert.equal(g.resolution.netHit, false);
    assert.ok(g.ball.vy < 0);
    assert.equal(g.stats.goals, 0);
    crossingHeights.push(g.resolution.crossing.z);
  }
  assert.ok(Math.max(...crossingHeights) - Math.min(...crossingHeights) > 20);
});

test('a clear over-bar miss has no stationary impact marker at the goal line', () => {
  const { game: g } = shot({ cy: 1 });
  let circles = 0;
  g.ctx.arc = () => circles++;
  g.drawCrossingMarker(g.ctx);
  assert.equal(circles, 0);
});

test('the goal stays framed throughout misses on desktop and compact screens', () => {
  for (const [width, height] of [[390, 600], [844, 250], [1280, 800], [320, 280]]) {
    const { game: g } = fixture(width, height);
    start(g); kick(g, { cy: 1 }); until(g, () => g.pendingResult);
    const originalView = JSON.stringify(g.view);
    while (g.pendingResult) {
      g.update(1 / 60); g.render();
      assert.equal(JSON.stringify(g.view), originalView, 'a miss must not pan or zoom away from the goal');
      const goal = g.goalGeometry(), v = g.view;
      assert.ok(v.y + goal.top * v.scale >= 0);
      assert.ok(v.y + goal.bottom * v.scale <= height);
    }
    assert.equal(g.resolution.exited, true);
    g.restart();
    assert.equal(JSON.stringify(g.view), originalView);
  }
});

test('each session mixes two advanced keepers with three keepers near the line', () => {
  const { game: g } = fixture();
  const first = g.createKeeperPlan(() => 0), second = g.createKeeperPlan(() => .999);
  assert.notDeepEqual(first, second);
  for (const plan of [first, second]) {
    assert.equal(plan.filter(profile => profile === 'advanced').length, 2);
    assert.equal(plan.filter(profile => profile === 'line').length, 3);
  }
  g.startSession();
  assert.equal(g.keeperPlan.filter(profile => profile === 'advanced').length, 2);
});

test('keeper depth persists through a restart and a completed pass', () => {
  const { game: g, elements } = fixture();
  g.keeperPlan[3] = 'advanced'; start(g, 3);
  assert.equal(g.keeper.y, 174);
  assert.match(elements.get('toast').textContent, /off the line/);
  kick(g, { x: 680, y: 335, power: .6 });
  until(g, () => g.state === 'AIMING');
  assert.equal(g.keeper.y, 174);
  g.restart(); g.update(.9);
  assert.equal(g.keeper.profile, 'advanced');
  assert.equal(g.keeper.y, 174);
  assert.equal(g.stats.passes, 0);
});

test('an advanced keeper holds depth for a ground shot and retreats at a limited speed for loft', () => {
  const { game: g } = fixture();
  g.keeperPlan[0] = 'advanced'; start(g);
  g.keeper.reaction = 0;
  Object.assign(g.ball, { x: 500, y: 220, z: 0, vy: -300 });
  g.updateKeeper(.1);
  assert.equal(g.keeper.y, 174);
  g.ball.z = 90;
  g.updateKeeper(.1);
  assert.ok(g.keeper.y < 174 && g.keeper.y >= 167.5, 'backpedal instead of snapping to the goal line');
});

test('a soft chip can punish an exposed keeper while the same kick is saved near the line', () => {
  for (const profile of ['line', 'advanced']) {
    const { game: g } = fixture();
    g.keeperPlan[0] = profile; start(g);
    kick(g, { power: .16, cy: .94 }); until(g, () => g.pendingResult);
    assert.equal(g.resolution.kind, profile === 'advanced' ? 'goal' : 'save');
    if (profile === 'advanced') {
      assert.equal(g.flight.clearedKeeper, true);
      until(g, () => g.state === 'RESULT');
      assert.equal(g.resolution.netHit, true);
    }
  }
});

test('an advanced keeper can still save a central ground shot', () => {
  const { game: g } = fixture();
  g.keeperPlan[0] = 'advanced'; start(g);
  kick(g, { power: .8 }); until(g, () => g.pendingResult);
  assert.equal(g.resolution.kind, 'save');
  assert.equal(g.stats.goals, 0);
  assert.equal(g.keeper.y, 174);
});

function defensePointer(g, point, id = 17) {
  return { button: 0, isPrimary: true, pointerId: id, clientX: g.view.x + point.x * g.view.scale, clientY: g.view.y + point.y * g.view.scale, preventDefault() {} };
}
function holdChase(g, id = 17) { g.onPointerDown(defensePointer(g, { x: 800, y: 600 }, id)); }
function releaseTackle(g, id = 17) { g.onPointerUp(defensePointer(g, { x: 800, y: 600 }, id)); }

test('Win the Ball starts sixth and holding anywhere follows the moving opponent', () => {
  const { game: g, elements } = fixture(); start(g, 5);
  assert.equal(g.state, 'DEFENDING'); assert.equal(elements.get('chapter-number').textContent, '6/7');
  const original = { ...g.player }, redX = g.defense.opponent.x;
  holdChase(g); assert.equal(g.defense.phase, 'running'); assert.ok(g.pointer);
  g.update(.5);
  assert.ok(g.player.x > original.x && g.player.y < original.y);
  assert.ok(g.defense.opponent.x > redX);
  assert.ok(Math.hypot(g.ball.x - g.defense.opponent.x, g.ball.y - g.defense.opponent.y) < 40);
  assert.equal(g.pendingResult, null); g.render();
});

test('releasing on green wins immediately, transfers possession once and contributes to summary', () => {
  const { game: g, elements } = fixture(); start(g, 5); holdChase(g);
  until(g, () => g.defense.timing().ready); releaseTackle(g);
  assert.equal(g.resolution.kind, 'ball_won'); assert.equal(elements.get('result-title').textContent, 'BALL WON!');
  assert.equal(g.pointer, null); assert.equal(g.stats.tackles, 1); assert.equal(g.stats.goals, 0);
  assert.equal(g.outcomes[5], true);
  releaseTackle(g); g.finish('ball_won'); assert.equal(g.stats.tackles, 1);
  until(g, () => g.state === 'RESULT');
  assert.ok(Math.hypot(g.ball.x - g.player.x, g.ball.y - g.player.y) < 30);
  assert.ok(Math.hypot(g.ball.x - g.defense.opponent.x, g.ball.y - g.defense.opponent.y) > 20);
  g.nextHighlight(); g.update(.9); until(g, () => g.state === 'RESULT');
  g.nextHighlight(); assert.equal(g.state, 'SESSION_SUMMARY');
  assert.equal(elements.get('total-tackles').textContent, 1); assert.equal(elements.get('rating').textContent, 12);
});

test('early release and release after green are missed tackles', () => {
  for (const late of [false, true]) {
    const { game: g } = fixture(); start(g, 5); holdChase(g);
    if (late) { until(g, () => g.defense.timing().ready); until(g, () => !g.defense.timing().ready); }
    releaseTackle(g); assert.equal(g.resolution.kind, 'missed_tackle');
    assert.equal(g.stats.tackles, 0); assert.equal(g.stats.misses, 1);
  }
});

test('green requires actual reach and position, not only the dribble clock', () => {
  const { game: g } = fixture(); start(g, 5); holdChase(g);
  until(g, () => g.defense.timing().ready);
  const red = g.defense.opponent;
  g.player.x = red.x - 30; g.player.y = red.y - 10;
  assert.equal(g.defense.timing().positioned, false); assert.equal(g.defense.timing().ready, false);
  releaseTackle(g); assert.equal(g.resolution.kind, 'missed_tackle');
});

test('no input or holding through every opportunity lets the opponent escape', () => {
  for (const holding of [true, false]) {
    const { game: g } = fixture(); start(g, 5); if (holding) holdChase(g);
    const elapsed = until(g, () => g.state === 'RESULT');
    assert.ok(elapsed + .85 >= 5 && elapsed + .85 <= 10);
    assert.equal(g.resolution.kind, 'opponent_escaped'); assert.equal(g.pointer, null);
    assert.equal(g.stats.tackles, 0);
  }
});

test('late pursuit cannot catch an opponent who has escaped ahead', () => {
  const { game: g } = fixture(); start(g, 5); g.update(5.8); holdChase(g);
  let green = false;
  while (g.state !== 'RESULT') { g.update(1 / 120); green ||= g.defense.timing().ready; }
  assert.equal(green, false); assert.equal(g.resolution.kind, 'opponent_escaped');
});

test('cancelled hold stops pursuit without tackling and a fresh hold resumes it', () => {
  const { game: g } = fixture(); start(g, 5); holdChase(g); g.update(.3);
  g.cancelPointer(17); const original = { ...g.player }; g.update(.2);
  assert.equal(g.defense.phase, 'planning'); assert.equal(g.pendingResult, null);
  assert.equal(g.player.x, original.x); assert.equal(g.player.y, original.y);
  holdChase(g); assert.equal(g.defense.phase, 'running');
});

test('settings cancel the hold and pause the encounter; restart clears all result state', () => {
  const { game: g, elements } = fixture(); start(g, 5); holdChase(g); g.update(.3);
  g.cancelPointer(17); const elapsed = g.defense.elapsed, ball = JSON.stringify(g.ball);
  elements.get('conditions-dialog').open = true; g.update(20);
  assert.equal(g.defense.elapsed, elapsed); assert.equal(JSON.stringify(g.ball), ball);
  elements.get('conditions-dialog').open = false; holdChase(g);
  until(g, () => g.defense.timing().ready); releaseTackle(g);
  assert.equal(g.stats.tackles, 1); g.restart(); g.update(.9);
  assert.equal(g.state, 'DEFENDING'); assert.equal(g.defense.phase, 'planning');
  assert.equal(g.defense.elapsed, 0); assert.equal(g.defense.tackle, null);
  assert.equal(g.resolution, null); assert.equal(g.stats.tackles, 0);
});

test('all three approaches have readable green windows and work at 30, 60 and 120 FPS', () => {
  const positions = new Set(), firstWindows = [];
  for (const fps of [30, 60, 120]) {
    const { game: g } = fixture();
    for (let variant = 0; variant < 3; variant++) {
      start(g, 5); positions.add(`${g.player.x},${g.player.y}`); holdChase(g);
      for (let i = 0; i < fps * 7 && !g.defense.timing().ready; i++) g.update(1 / fps);
      assert.equal(g.defense.timing().ready, true);
      const began = g.defense.elapsed; let window = 0;
      while (g.defense.timing().ready) { g.update(1 / fps); window += 1 / fps; }
      assert.ok(window >= .36, `readable window: ${fps} FPS, variant ${variant}, ${window}`);
      firstWindows.push(began);
      for (let i = 0; i < fps * 7 && !g.defense.timing().ready; i++) g.update(1 / fps);
      assert.equal(g.defense.timing().ready, true); releaseTackle(g);
      assert.equal(g.resolution.kind, 'ball_won'); g.render();
    }
  }
  assert.equal(positions.size, 3); assert.ok(Math.max(...firstWindows) - Math.min(...firstWindows) > .3);
});

test('restarting a held chase releases capture and does not attempt a tackle', () => {
  const { game: g } = fixture(); start(g, 5); let released = null;
  g.canvas.hasPointerCapture = () => true; g.canvas.releasePointerCapture = id => { released = id; };
  holdChase(g); g.restart(); g.update(.9);
  assert.equal(released, 17); assert.equal(g.pointer, null); assert.equal(g.defense.phase, 'planning');
  assert.equal(g.pendingResult, null);
});

test('moving the held finger and secondary pointers cannot tackle or steer', () => {
  const { game: g } = fixture(); start(g, 5); holdChase(g);
  g.onPointerMove(defensePointer(g, { x: 100, y: 100 }));
  g.onPointerDown(defensePointer(g, g.ball, 18)); releaseTackle(g, 18);
  assert.equal(g.pointer.id, 17); assert.equal(g.pendingResult, null);
  until(g, () => g.defense.timing().ready); releaseTackle(g);
  assert.equal(g.resolution.kind, 'ball_won');
});

test('all seven highlights can be opened directly as independent practice attempts', () => {
  const { game: g, elements } = fixture();
  for (let index = 0; index < 7; index++) {
    g.stats.goals = 3; g.outcomes[0] = true;
    g.openHighlightPicker(); g.startPractice(index);
    assert.equal(elements.get('highlight-dialog').open, false);
    assert.equal(g.practiceIndex, index); assert.equal(g.index, index);
    assert.equal(g.stats.goals, 0); assert.equal(g.outcomes.length, 0);
    g.update(.9);
    assert.equal(g.state, index >= 5 ? 'DEFENDING' : index === 4 ? 'INTERCEPTION' : 'AIMING');
    assert.equal(elements.get('chapter-number').textContent, `${index + 1}/7`);
  }
});

test('practice result retries the selected defense highlight with clean statistics and no summary', () => {
  const { game: g, elements } = fixture();
  g.startPractice(5); g.update(.9); holdChase(g);
  until(g, () => g.defense.timing().ready); releaseTackle(g);
  assert.match(elements.get('next-button').innerHTML, /RETRY/);
  until(g, () => g.state === 'RESULT'); g.nextHighlight(); g.update(.9);
  assert.equal(g.state, 'DEFENDING'); assert.equal(g.index, 5); assert.equal(g.practiceIndex, 5);
  assert.equal(g.defense.phase, 'planning'); assert.equal(g.stats.tackles, 0);
  assert.equal(g.resolution, null); assert.equal(g.outcomes[5], undefined);
});

test('closing the selection menu resumes the same encounter without changing its progress', () => {
  const { game: g, elements } = fixture(); start(g, 5); g.update(.4);
  const elapsed = g.defense.elapsed, ball = JSON.stringify(g.ball);
  g.openHighlightPicker(); g.update(10);
  assert.equal(g.defense.elapsed, elapsed); assert.equal(JSON.stringify(g.ball), ball);
  elements.get('highlight-dialog').close(); g.update(.1);
  assert.equal(g.state, 'DEFENDING'); assert.ok(g.defense.elapsed > elapsed);
  assert.equal(g.practiceIndex, null);
});

test('play all exits practice and restores normal seven-highlight progression', () => {
  const { game: g } = fixture(); g.startPractice(5); g.update(.9);
  g.stats.tackles = 1; g.beginSession(); g.update(.9);
  assert.equal(g.practiceIndex, null); assert.equal(g.index, 0); assert.equal(g.defense, null);
  assert.equal(g.stats.tackles, 0); assert.equal(g.state, 'AIMING');
  kick(g, { x: 420 }); until(g, () => g.state === 'RESULT'); g.nextHighlight();
  assert.equal(g.index, 1); assert.equal(g.state, 'HIGHLIGHT_INTRO');
});

test('invalid direct selections leave the current highlight untouched', () => {
  const { game: g } = fixture(); start(g);
  for (const value of [-1, 7, NaN, 1.5, '5', null]) g.startPractice(value);
  assert.equal(g.index, 0); assert.equal(g.practiceIndex, null); assert.equal(g.state, 'AIMING');
});

test('top contact progressively loses pace while slight top contact remains useful', () => {
  const { game: g } = fixture(), kick = { dx: 0, dy: -1, power: .8 };
  const velocities = [0, -.25, -.6, -1].map(y => g.kickVelocity(kick, { x: 0, y }));
  for (let i = 1; i < velocities.length; i++) assert.ok(-velocities[i].vy < -velocities[i - 1].vy);
  assert.ok(-velocities[1].vy > -velocities[0].vy * .9);
  assert.ok(-velocities[3].vy < -velocities[0].vy * .65);
  assert.equal(velocities[3].vz, 0);
});

test('under contact trades forward pace for height and power controls chip range', () => {
  const { game: g } = fixture();
  const launch = (power, y) => g.kickVelocity({ dx: 0, dy: -1, power }, { x: 0, y });
  assert.ok(-launch(.8, 1).vy < -launch(.8, 0).vy);
  assert.ok(launch(.8, 1).vz > launch(.8, .5).vz);
  const soft = launch(.16, .94), firm = launch(.8, .94);
  assert.ok(firm.vz > soft.vz && -firm.vy > -soft.vy);
});

test('landings rebound with diminishing height and horizontal energy, then settle', () => {
  const { game: g } = fixture();
  const b = { x: 500, y: 500, z: 120, vx: 100, vy: 0, vz: 0, spin: .7, rotation: 0, age: 0 };
  const heights = []; let peak = b.z, hits = 0;
  for (let t = 0; t < 5; t += 1 / 120) {
    const before = Math.hypot(b.vx, b.vy), hit = g.integrateBall(b, 1 / 120);
    if (hit) { heights.push(peak); peak = 0; hits++; assert.ok(Math.hypot(b.vx, b.vy) < before * .9); }
    peak = Math.max(peak, b.z);
    assert.ok(b.z >= 0);
  }
  assert.ok(hits >= 2);
  assert.ok(heights[1] < heights[0] * .3);
  assert.equal(b.z, 0); assert.equal(b.vz, 0);
  assert.equal(g.ripples.length, 0, 'preview integration must not emit effects or sound');
});

test('flight and repeated bounces agree at 30, 60 and 120 FPS', () => {
  const { game: g } = fixture();
  const results = [30, 60, 120].map(fps => {
    const b = { x: 0, y: 0, z: 0, vx: 400, vy: -200, vz: 220, spin: .6, rotation: 0, age: 0 };
    for (let i = 0; i < fps * 3; i++) g.integrateBall(b, 1 / fps);
    return b;
  });
  for (const b of results) {
    assert.ok(Math.hypot(b.x - results[0].x, b.y - results[0].y) < 1);
    assert.ok(Math.abs(b.z - results[0].z) < .2);
  }
});

test('curve does not add energy and decays much faster while rolling', () => {
  const { game: g } = fixture();
  const base = { x: 0, y: 0, vx: 400, vy: 0, vz: 0, spin: .8, rotation: 0, age: 0 };
  const air = { ...base, z: 200 }, ground = { ...base, z: 0 };
  g.integrateBall(air, .3); g.integrateBall(ground, .3);
  assert.ok(Math.hypot(air.vx, air.vy) < 400);
  assert.ok(Math.abs(ground.spin) < Math.abs(air.spin) * .5);
  assert.ok(Math.abs(ground.vy) < Math.abs(air.vy) * .2);
});

test('keeper needs a new observation to react to a changed ball direction', () => {
  const { game: g } = fixture(); start(g);
  Object.assign(g.keeper, { reaction: 0, readTime: 0 });
  Object.assign(g.ball, { x: 450, y: 300, vx: -100, vy: -200 });
  g.updateKeeper(.01); const target = g.keeper.targetX;
  g.ball.x = 550; g.ball.vx = 100;
  g.updateKeeper(.05); assert.equal(g.keeper.targetX, target);
  g.updateKeeper(.12); assert.ok(g.keeper.targetX > 500);
});

test('keeper commits to the dive direction even when curve crosses behind him', () => {
  const { game: g } = fixture(); start(g);
  Object.assign(g.keeper, { reaction: 0, readTime: 0 });
  Object.assign(g.ball, { x: 450, y: 200, vx: -80, vy: -300 });
  g.updateKeeper(.01); const target = g.keeper.targetX, x = g.keeper.x;
  assert.equal(g.keeper.diveDirection, -1);
  Object.assign(g.ball, { x: 560, vx: 100 });
  g.updateKeeper(.1);
  assert.equal(g.keeper.targetX, target); assert.ok(g.keeper.x < x);
  assert.equal(g.keeper.diveDirection, -1);
});

test('a ball bouncing before the goal stays live and can score with immediate impact feedback', () => {
  const { game: g } = fixture(); start(g);
  kick(g, { x: 590, power: .6, cy: 0 });
  until(g, () => g.ripples.some(r => r.bounce));
  assert.equal(g.pendingResult, null);
  const ripple = g.ripples.find(r => r.bounce);
  assert.ok(ripple.strength > 0 && g.ball.vz > 0);
  until(g, () => g.pendingResult);
  assert.equal(g.resolution.kind, 'goal'); assert.equal(g.stats.goals, 1);
});

function choosePassPosition(g, point) {
  const event = defensePointer(g, point); g.onPointerDown(event); g.onPointerUp(event);
}

test('Cut the Pass opens seventh with two red players and tap-to-move input', () => {
  const { game: g, elements } = fixture(); start(g, 6);
  assert.equal(elements.get('chapter-number').textContent, '7/7');
  assert.equal(g.state, 'DEFENDING'); assert.equal(g.defenders.length, 2);
  const original = { ...g.player }, receiverY = g.defense.receiver.y;
  choosePassPosition(g, { x: 550, y: 410 }); assert.equal(g.pointer, null);
  g.update(.4); assert.ok(g.player.y < original.y && g.player.y > 410);
  assert.ok(g.defense.receiver.y > receiverY); assert.equal(g.pendingResult, null); g.render();
});

test('a real interception awards one ball win, transfers possession and reaches the summary', () => {
  const { game: g, elements } = fixture(); start(g, 6); choosePassPosition(g, { x: 550, y: 410 });
  until(g, () => g.pendingResult);
  assert.equal(g.resolution.kind, 'pass_won'); assert.equal(elements.get('result-title').textContent, 'INTERCEPTED!');
  assert.equal(g.stats.tackles, 1); assert.equal(g.stats.goals, 0); assert.equal(g.stats.misses, 0);
  assert.ok(Math.hypot(g.ball.x - g.player.x, g.ball.y - g.player.y) < 24);
  g.finish('pass_won'); assert.equal(g.stats.tackles, 1);
  until(g, () => g.state === 'RESULT');
  assert.ok(Math.hypot(g.ball.x - g.possessionPosition(g.player).x, g.ball.y - g.possessionPosition(g.player).y) < 1);
  g.nextHighlight(); assert.equal(g.state, 'SESSION_SUMMARY');
  assert.equal(elements.get('total-tackles').textContent, 1); assert.equal(elements.get('rating').textContent, 12);
});

test('no input, wrong positioning and late movement let the receiver collect the pass', () => {
  for (const mode of ['none', 'wrong', 'late']) {
    const { game: g, elements } = fixture(); start(g, 6);
    if (mode === 'wrong') choosePassPosition(g, { x: 700, y: 550 });
    if (mode === 'late') { g.update(3.4); choosePassPosition(g, { x: 550, y: 410 }); }
    const elapsed = until(g, () => g.state === 'RESULT');
    assert.equal(g.resolution.kind, 'pass_through'); assert.equal(g.stats.tackles, 0); assert.equal(g.stats.misses, 1);
    assert.equal(elements.get('result-title').textContent, 'PASS GOT THROUGH!');
    assert.ok(elapsed < 8);
    assert.ok(Math.hypot(g.ball.x - g.defense.receiver.x, g.ball.y - g.defense.receiver.y) < 30);
  }
});

test('changing destination before the pass redirects the run without teleporting', () => {
  const { game: g } = fixture(); start(g, 6);
  choosePassPosition(g, { x: 700, y: 550 }); g.update(.5); const position = { ...g.player };
  choosePassPosition(g, { x: 550, y: 410 });
  assert.equal(g.player.x, position.x); assert.equal(g.player.y, position.y);
  until(g, () => g.pendingResult); assert.equal(g.resolution.kind, 'pass_won');
});

test('the interception clock pauses in dialogs and restart/practice retry clears all state', () => {
  const { game: g, elements } = fixture(); g.startPractice(6); g.update(.9);
  choosePassPosition(g, { x: 550, y: 410 }); g.update(1);
  const snapshot = JSON.stringify({ b: g.ball, p: g.player, t: g.defense.elapsed });
  g.openHighlightPicker(); g.update(10);
  assert.equal(JSON.stringify({ b: g.ball, p: g.player, t: g.defense.elapsed }), snapshot);
  elements.get('highlight-dialog').close();
  until(g, () => g.state === 'RESULT'); assert.equal(g.stats.tackles, 1);
  assert.match(elements.get('next-button').innerHTML, /RETRY/); g.nextHighlight(); g.update(.9);
  assert.equal(g.index, 6); assert.equal(g.defense.target, null); assert.equal(g.defense.elapsed, 0);
  assert.equal(g.resolution, null); assert.equal(g.stats.tackles, 0); assert.equal(g.outcomes[6], undefined);
});

test('pass interception success and failure agree at 30, 60 and 120 FPS', () => {
  for (const fps of [30, 60, 120]) for (const win of [true, false]) {
    const { game: g } = fixture(); start(g, 6);
    choosePassPosition(g, { x: 550, y: win ? 410 : 530 });
    for (let i = 0; i < fps * 8 && g.state !== 'RESULT'; i++) g.update(1 / fps);
    assert.equal(g.state, 'RESULT'); assert.equal(g.resolution.kind, win ? 'pass_won' : 'pass_through'); g.render();
  }
});
