'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');

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
      getBoundingClientRect: () => ({ x: 0, y: 0, left: 0, top: 0, width, height }),
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
        if (id === 'chapter-progress' || id === 'scenario-list') node.children = Array.from({ length: 5 }, () => element());
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
  vm.runInNewContext(source, sandbox, { filename: 'game.js' });
  return { game: window.footballGame, elements };
}

function start(game, index = 0) {
  game.index = index;
  game.beginHighlight();
  game.update(.9);
}

function kick(game, { x = 500, y = 84, power = 1, cy = 0, cx = 0, mode = 'SHOOT' } = {}) {
  const dx = x - game.ball.x, dy = y - game.ball.y, distance = Math.hypot(dx, dy);
  game.kick = { dx: dx / distance, dy: dy / distance, power, mode };
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
  kick(g, { x: 680, y: 335, power: .6, mode: 'PASS' });
  until(g, () => g.state === 'AIMING');
  assert.equal(g.stats.passes, 1);
  assert.notEqual(g.controlled, g.player);
  kick(g, { x: 379, y: 425, power: .6, mode: 'PASS' });
  until(g, () => g.state === 'AIMING');
  assert.equal(g.stats.passes, 2);
  assert.equal(g.controlled, g.player);
});

test('a missed contact window and all five highlights resolve without freezing', () => {
  const { game: g } = fixture();
  for (let index = 0; index < 5; index++) {
    start(g, index);
    if (index === 4) {
      g.interceptTarget = { x: 500, y: 320 };
      until(g, () => g.state === 'AIMING');
    }
    if (index === 0) {
      g.kick = { dx: 0, dy: -1, power: .8, mode: 'SHOOT' };
      g.transition('BALL_CONTACT');
    } else kick(g, { x: 420 });
    until(g, () => g.state === 'RESULT');
    assert.equal(g.stats.goals + g.stats.misses, index + 1);
  }
  g.nextHighlight();
  assert.equal(g.state, 'SESSION_SUMMARY');
});

test('a touch at the bottom edge of the close-up ball is accepted and normalized', () => {
  const { game: g } = fixture(390, 600);
  start(g);
  g.kick = { dx: 0, dy: -1, power: .65, mode: 'SHOOT' };
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
  const weak = g.kickVelocity({ dx: 0, dy: -1, power: .5, mode: 'SHOOT' }, contact);
  const strong = g.kickVelocity({ dx: 0, dy: -1, power: 1, mode: 'SHOOT' }, contact);
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
