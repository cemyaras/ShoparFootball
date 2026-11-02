/* Single-arc ground shots share attacking AI, collisions and result playback. */
(() => {
  'use strict';
  const { State, clamp } = window.ShoparFootball.Core;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function pointAt(route, travel) {
    const arc = Math.min(travel, route.length), angle = route.heading + route.curvature * arc;
    const x = route.curvature ? (Math.sin(angle) - Math.sin(route.heading)) / route.curvature : Math.cos(angle) * arc;
    const y = route.curvature ? (Math.cos(route.heading) - Math.cos(angle)) / route.curvature : Math.sin(angle) * arc;
    const rest = travel - arc;
    return { x: route.start.x + x + Math.cos(angle) * rest, y: route.start.y + y + Math.sin(angle) * rest, angle };
  }
  function buildRoute(points) {
    if (points.length < 2) return null;
    const start = points[0], end = points.at(-1), span = distance(start, end);
    if (span < 24 || end.y >= start.y - 12) return null;
    let total = 0;
    for (let i = 1; i < points.length; i++) total += distance(points[i - 1], points[i]);
    let walked = 0, middle = start;
    for (let i = 1; i < points.length; i++) {
      const segment = distance(points[i - 1], points[i]);
      if (walked + segment >= total / 2) {
        const t = segment ? (total / 2 - walked) / segment : 0;
        middle = { x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
          y: points[i - 1].y + (points[i].y - points[i - 1].y) * t };
        break;
      }
      walked += segment;
    }
    const dx = end.x - start.x, dy = end.y - start.y;
    const offset = ((middle.x - start.x) * -dy + (middle.y - start.y) * dx) / span;
    const limit = Math.min(40 * Math.PI / 180, 2 * Math.asin(Math.min(1, span / 240)));
    const turn = clamp(-4 * Math.atan2(2 * offset, span), -limit, limit);
    const curvature = Math.abs(turn) < .001 ? 0 : 2 * Math.sin(turn / 2) / span;
    const length = curvature ? turn / curvature : span;
    const route = { start: { ...start }, heading: Math.atan2(dy, dx) - turn / 2, curvature, length,
      speed: clamp(400 + .65 * length, 430, 700) };
    route.preview = Array.from({ length: 33 }, (_, i) => pointAt(route, length * i / 32));
    return route;
  }
  class DrawShotController extends window.ShoparFootball.AttackController {
    constructor(context) { super(context); this.points = null; this.route = null; this.travel = 0; }
    getPresentation() {
      return { drawToShoot: true, hint: this.context.flow.state === State.AIMING ? 'Draw from the ball toward goal. Release to shoot.' : '',
        ariaLabel: 'Draw the Shot. Draw a straight or curved path from the ball toward goal, then release to shoot.',
        shotPreview: this.context.flow.state === State.AIMING ? this.route?.preview : null };
    }
    sample(point, final = false) {
      if (!this.points || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
      if (!final && distance(this.points.at(-1), point) < 4) return;
      this.points.push({ ...point });
      if (this.points.length > 256) this.points = this.points.filter((_, i) => i === 0 || i % 2 === 1);
      this.route = buildRoute(this.points);
    }
    handleInput(input) {
      const c = this.context;
      if (c.flow.state !== State.AIMING) return { handled: false };
      if (input.type === 'down') {
        if (distance(input.point, c.ball) > Math.max(55, 44 / c.view.scale)) return { handled: false };
        this.points = [{ x: c.ball.x, y: c.ball.y }]; this.route = null;
        return { handled: true, capture: true, updateOnRelease: true };
      }
      if (!this.points) return { handled: false };
      this.sample(input.point, input.type === 'up');
      if (input.type === 'up') {
        this.points = null;
        if (!this.route) { c.feedback.toast('Draw a longer path toward goal.', 1.5); return { handled: true }; }
        const r = this.route;
        c.play.kick = { dx: Math.cos(r.heading), dy: Math.sin(r.heading), power: clamp((r.speed - 220) / 530, 0, 1) };
        this.travel = 0;
        this.launchShot({ vx: Math.cos(r.heading) * r.speed, vy: Math.sin(r.heading) * r.speed, vz: 0, spin: 0 });
      }
      return { handled: true };
    }
    cancelInput() { this.points = null; this.route = null; this.context.feedback.power(0); }
    integrateShot(dt) {
      const b = this.context.ball, previous = { x: b.x, y: b.y };
      const impact = this.context.physics.integrateBall(b, dt);
      this.travel += distance(previous, b);
      const position = pointAt(this.route, this.travel), speed = Math.hypot(b.vx, b.vy);
      Object.assign(b, { x: position.x, y: position.y, vx: Math.cos(position.angle) * speed, vy: Math.sin(position.angle) * speed });
      return impact;
    }
  }
  DrawShotController.buildRoute = buildRoute;
  window.ShoparFootball.DrawShotController = DrawShotController;
})();
