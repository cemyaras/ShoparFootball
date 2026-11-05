'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { runtimeScripts } = require('./helpers/runtime.cjs');

function fixture() {
  const window = {};
  for (const { source, filename } of runtimeScripts().filter(script =>
    /\/(core|projection|viewport)\.js$/.test(script.filename))) {
    vm.runInNewContext(source, { window }, { filename });
  }
  return window.ShoparFootball;
}
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, actual + ' != ' + expected);

test('projection agrees with its ground matrix and keeps verticals upright at all preview angles', () => {
  const { Projection } = fixture();
  for (const angle of [12, 20, 25]) {
    const p = Projection.create(angle);
    const [a, b, c, d, e, f] = p.ground;
    for (const [x, y] of [[76, 84], [924, 684], [500, 84], [310, 400]]) {
      const ground = p.project({ x, y }), high = p.project({ x, y, z: 112 });
      close(ground.x, a * x + c * y + e);
      close(ground.y, b * x + d * y + f);
      close(high.x, ground.x);
      close(ground.y - high.y, 112 * .52);
      const inverse = p.toGround(ground);
      close(inverse.x, x); close(inverse.y, y);
    }
  }
});

test('viewport fits projected corners and preserves ground and goal coordinates through CSS screen space', () => {
  const { Projection, Viewport, Core } = fixture();
  for (const angle of [12, 20, 25]) {
    for (const [width, height] of [[1280, 720], [390, 650], [568, 220]]) {
      const bounds = { left: 76, top: 84, width: 848, height: 600 };
      const points = Core.goalCorners();
      const view = Viewport.fitProjection(Projection.create(angle), bounds, points, width, height);
      for (const point of [...points, { x: 76, y: 684 }, { x: 924, y: 684 }]) {
        const screen = Viewport.worldToScreen(view, point);
        assert.ok(screen.x >= 16 - 1e-9 && screen.x <= width - 16 + 1e-9);
        assert.ok(screen.y >= 16 - 1e-9 && screen.y <= height - 16 + 1e-9);
      }
      const ground = { x: 710, y: 433 };
      const actual = Viewport.screenToGround(view, Viewport.worldToScreen(view, ground));
      close(actual.x, ground.x); close(actual.y, ground.y);
      const goal = { x: 433, y: 84, z: 90 };
      const target = Viewport.screenToGoal(view, Viewport.worldToScreen(view, goal));
      close(target.x, goal.x); close(target.y, goal.y); close(target.z, goal.z);
    }
  }
});

test('shot aim joins ground and goal height at both posts and unfolds a straight stroke reversibly', () => {
  const { Projection, Core: { FIELD, HEIGHT_PROJECTION } } = fixture();
  const projection = Projection.create(20), start = { x: 510, y: 380 };
  const screenStart = projection.project(start);
  for (const x of [FIELD.goalLeft, FIELD.goalRight]) {
    for (const y of [FIELD.top + 45, FIELD.top + .001, FIELD.top, FIELD.top - .001, FIELD.top - 90 * HEIGHT_PROJECTION]) {
      const target = { x, y };
      const end = projection.fromAim(target), aim = projection.aimStroke(start, end);
      close(aim.target.x, x); close(aim.target.y, y);
      const middle = { x: (screenStart.x + end.x) / 2, y: (screenStart.y + end.y) / 2 };
      const canonical = aim.toCanonical(middle);
      close(canonical.x, (start.x + x) / 2); close(canonical.y, (start.y + y) / 2);
      const restored = aim.toProjected(canonical);
      close(restored.x, middle.x); close(restored.y, middle.y);
    }
  }
});
