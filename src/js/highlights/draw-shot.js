/* Drawn ground shots share attacking AI, collisions and result playback. */
(() => {
  'use strict';
  const { State, clamp } = window.ShoparFootball.Core;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const SAMPLE_DISTANCE = 8;
  const MIN_RADIUS = 24;
  function resample(points, spacing) {
    const result = [{ ...points[0] }];
    let next = spacing, walked = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], span = distance(a, b);
      while (span > 0 && next < walked + span) {
        const t = (next - walked) / span;
        result.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        next += spacing;
      }
      walked += span;
    }
    if (distance(result.at(-1), points.at(-1)) > .001) result.push({ ...points.at(-1) });
    return result;
  }
  function pointAt(route, travel) {
    const points = route.preview, lengths = route.lengths;
    let low = 1, high = points.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (lengths[middle] < travel) low = middle + 1;
      else high = middle;
    }
    const a = points[low - 1], b = points[low], span = lengths[low] - lengths[low - 1];
    const t = (travel - lengths[low - 1]) / span;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
      angle: Math.atan2(b.y - a.y, b.x - a.x) };
  }
  function buildRoute(points) {
    if (points.length < 2 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
    const start = points[0], end = points.at(-1);
    if (distance(start, end) < 24 || end.y >= start.y - 12) return null;
    let rawLength = 0;
    for (let i = 1; i < points.length; i++) rawLength += distance(points[i - 1], points[i]);
    if (rawLength > 3200) return null;
    let smooth = resample(points, SAMPLE_DISTANCE);
    if (smooth.length > 400) return null;
    // Local convex averaging rounds corners without spline overshoot or global arc fitting.
    // The fixed spatial window gives dense and sparse recordings the same treatment.
    for (let pass = 0; pass < 3; pass++) {
      smooth = smooth.map((p, i) => {
        if (i === 0 || i === smooth.length - 1) return p;
        let x = 0, y = 0;
        for (let offset = -2; offset <= 2; offset++) {
          const neighbor = smooth[clamp(i + offset, 0, smooth.length - 1)], weight = 3 - Math.abs(offset);
          x += neighbor.x * weight; y += neighbor.y * weight;
        }
        return { x: x / 9, y: y / 9 };
      });
    }
    // Reject a remaining hairpin instead of secretly replacing the player's route.
    for (let i = 1; i < smooth.length - 1; i++) {
      const a = smooth[i - 1], b = smooth[i], c = smooth[i + 1];
      const ab = distance(a, b), bc = distance(b, c), ac = distance(a, c);
      const cross = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
      if (ab < .001 || bc < .001 || ac < .001 || 2 * cross / (ab * bc * ac) > 1 / MIN_RADIUS) return null;
    }
    const preview = resample(smooth, 4), lengths = [0];
    for (let i = 1; i < preview.length; i++) lengths.push(lengths.at(-1) + distance(preview[i - 1], preview[i]));
    const length = lengths.at(-1);
    return { start: { ...start }, preview, lengths, length,
      heading: Math.atan2(preview[1].y - start.y, preview[1].x - start.x),
      speed: clamp(400 + .65 * length, 430, 700) };
  }
  class DrawShotController extends window.ShoparFootball.AttackController {
    constructor(context) { super(context); this.points = null; this.route = null; this.travel = 0; }
    getPresentation() {
      return { drawToShoot: true, hint: this.context.flow.state === State.AIMING ? (this.points?.length > 1 && !this.route ? 'Draw forward with smoother bends.' : 'Draw from the ball toward goal. Release to shoot.') : '',
        ariaLabel: 'Draw the Shot. Draw a straight or curved path from the ball toward goal, then release to shoot.',
        shotPreview: this.context.flow.state === State.AIMING ? this.route?.preview : null };
    }
    sample(point) {
      if (!this.points || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
      if (distance(this.points.at(-1), point) < .001) return;
      this.points.push({ ...point });
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
      this.sample(input.point);
      if (input.type === 'up') {
        this.points = null;
        if (!this.route) { c.feedback.toast('Draw a longer path toward goal with smoother bends.', 1.5); return { handled: true }; }
        const r = this.route;
        c.play.kick = { dx: Math.cos(r.heading), dy: Math.sin(r.heading), power: clamp((r.speed - 220) / 530, 0, 1) };
        this.travel = 0;
        this.launchShot({ vx: Math.cos(r.heading) * r.speed, vy: Math.sin(r.heading) * r.speed, vz: 0, spin: 0 });
      }
      return { handled: true };
    }
    cancelInput() { this.points = null; this.route = null; this.context.feedback.power(0); }
    integrateShot(dt) {
      if (this.context.resultDelay.pending || !this.route) return this.context.physics.integrateBall(this.context.ball, dt);
      const b = this.context.ball, previous = { x: b.x, y: b.y };
      const impact = this.context.physics.integrateBall(b, dt);
      this.travel += distance(previous, b);
      const position = pointAt(this.route, this.travel), speed = Math.hypot(b.vx, b.vy);
      Object.assign(b, { x: position.x, y: position.y, vx: Math.cos(position.angle) * speed, vy: Math.sin(position.angle) * speed });
      return impact;
    }
  }
  DrawShotController.buildRoute = buildRoute;
  DrawShotController.pointAt = pointAt;
  window.ShoparFootball.DrawShotController = DrawShotController;
})();
