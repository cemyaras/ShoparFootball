/* Fixed-angle projection. Coordinates and heights stay in world units. */
(() => {
  'use strict';
  const { FIELD, HEIGHT_PROJECTION } = window.ShoparFootball.Core;
  const originX = (FIELD.goalLeft + FIELD.goalRight) / 2, originY = FIELD.top;
  const depthScale = .75;

  function create(angle = 12) {
    const radians = angle * Math.PI / 180;
    const cos = Math.cos(radians), sin = Math.sin(radians);
    const project = ({ x, y, z = 0 }) => ({
      x: cos * (x - originX) - sin * (y - originY),
      y: depthScale * (sin * (x - originX) + cos * (y - originY)) - z * HEIGHT_PROJECTION
    });
    const origin = project({ x: 0, y: 0 });
    const toGround = ({ x, y }) => ({
      x: originX + cos * x + sin * y / depthScale,
      y: originY - sin * x + cos * y / depthScale
    });
    const toGoal = ({ x, y }) => {
      const dx = x / cos;
      return { x: originX + dx, y: originY, z: (depthScale * sin * dx - y) / HEIGHT_PROJECTION };
    };
    const toAim = point => {
      const goal = toGoal(point);
      if (goal.z * HEIGHT_PROJECTION > 1e-9) return { x: goal.x, y: originY - goal.z * HEIGHT_PROJECTION };
      const ground = toGround(point);
      return Math.abs(ground.y - originY) < 1e-9 ? { x: goal.x, y: originY } : ground;
    };
    const fromAim = point => point.y < originY
      ? project({ x: point.x, y: originY, z: (originY - point.y) / HEIGHT_PROJECTION })
      : project(point);

    function aimStroke(start, end) {
      const groundEnd = toGround(end), target = toAim(end);
      const axisX = groundEnd.x - start.x, axisY = groundEnd.y - start.y;
      const shiftX = target.x - groundEnd.x, shiftY = target.y - groundEnd.y;
      const dot = p => (p.x - start.x) * axisX + (p.y - start.y) * axisY;
      const span = dot(groundEnd), mappedSpan = dot(target);
      // Unfold the full chord so crossing the goal line does not bend a straight stroke.
      return {
        target,
        toCanonical(point) {
          const ground = toGround(point);
          const t = span ? dot(ground) / span : 0;
          return { x: ground.x + shiftX * t, y: ground.y + shiftY * t };
        },
        toProjected: Math.abs(mappedSpan) > 1e-9 ? point => {
          const t = dot(point) / mappedSpan;
          return project({ x: point.x - shiftX * t, y: point.y - shiftY * t });
        } : null
      };
    }
    return Object.freeze({
      project,
      ground: Object.freeze([cos, depthScale * sin, -sin, depthScale * cos, origin.x, origin.y]),
      depth: ({ x, y }) => sin * (x - originX) + cos * (y - originY),
      upright(x, y) {
        const p = project({ x, y });
        return [cos, depthScale * sin, 0, 1, p.x, p.y];
      },
      toGround, toGoal, toAim, fromAim, aimStroke,
      goalPlaneDelta({ x, y }) {
        const across = x / cos;
        return { x: across, y: y - depthScale * sin * across };
      }
    });
  }

  window.ShoparFootball.Projection = Object.freeze({ create });
})();
