/* Drawn shots share attacking AI, collisions and result playback. */
(() => {
  'use strict';
  const { State, FIELD, GOAL, BALL_GRAVITY, HEIGHT_PROJECTION, goalGeometry, clamp } = window.ShoparFootball.Core;
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
  function buildRoute(points, power = .6) {
    if (points.length < 2 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
    const start = points[0], end = points.at(-1);
    if (distance(start, end) < 24 || end.y >= start.y - 12) return null;
    const span = distance(start, end), dx = (end.x - start.x) / span, dy = (end.y - start.y) / span;
    let rawLength = 0;
    for (let i = 1; i < points.length; i++) rawLength += distance(points[i - 1], points[i]);
    if (!Number.isFinite(rawLength)) return null;
    const samples = resample(points, Math.max(SAMPLE_DISTANCE, rawLength / 256));
    let weightedOffset = 0, weight = 0;
    // Fit the overall sideways intention. Opposing bends cancel rather than becoming zigzags.
    for (const p of samples) {
      const x = p.x - start.x, y = p.y - start.y;
      const progress = clamp((x * dx + y * dy) / span, 0, 1), basis = 2 * progress * (1 - progress);
      weightedOffset += basis * (-x * dy + y * dx);
      weight += basis * basis;
    }
    const charge = (clamp(power, .6, 1) - .6) / .4;
    const limit = Math.min(span * .45, span * span / (4 * MIN_RADIUS), 160) * (1 - .5 * charge);
    let bend = weight ? clamp(weightedOffset / weight, -limit, limit) : 0;
    if (Math.abs(bend) < Math.max(6, span * .02)) bend = 0;
    const control = { x: (start.x + end.x) / 2 - dy * bend, y: (start.y + end.y) / 2 + dx * bend };
    const segments = clamp(Math.ceil(span / 4), 16, 256), preview = [], lengths = [0];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments, u = 1 - t;
      preview.push({ x: u * u * start.x + 2 * u * t * control.x + t * t * end.x,
        y: u * u * start.y + 2 * u * t * control.y + t * t * end.y });
      if (i) lengths.push(lengths.at(-1) + distance(preview[i - 1], preview[i]));
    }
    const length = lengths.at(-1);
    return { start: { ...start }, preview, lengths, length,
      heading: Math.atan2(preview[1].y - start.y, preview[1].x - start.x),
      speed: clamp(400 + .65 * span, 430, 700) * (1 + .25 * charge) };
  }
  function advanceRoute(physics, route, state, ball, dt) {
    const steps = Math.max(1, Math.ceil(dt * 240)), step = dt / steps;
    let impact = null;
    for (let i = 0; i < steps; i++) {
      const before = { x: ball.x, y: ball.y };
      impact = physics.integrateBall(ball, step) || impact;
      state.travel += distance(before, ball);
      const p = pointAt(route, state.travel), speed = Math.hypot(ball.vx, ball.vy);
      Object.assign(ball, { x: p.x, y: p.y, vx: Math.cos(p.angle) * speed, vy: Math.sin(p.angle) * speed });
    }
    return impact;
  }
  function buildShot(points, chip, physics, power = .6) {
    if (points.length < 2) return null;
    const mouth = goalGeometry(), start = points[0], end = points.at(-1);
    const inGoal = end.x >= mouth.left - 24 && end.x <= mouth.right + 24 && end.y < mouth.bottom;
    const targetHeight = inGoal ? clamp((mouth.bottom - end.y) / HEIGHT_PROJECTION, 0, GOAL.height * 2) : 0;
    // Pointer coordinates describe the projected goal mouth. Keep x and drawing progress,
    // but put the horizontal endpoint on the real goal line before solving vertical flight.
    const ground = inGoal ? points.map(p => ({ x: p.x,
      y: p.y + (mouth.bottom - end.y) * clamp((start.y - p.y) / (start.y - end.y), 0, 1) })) : points;
    const route = buildRoute(ground, power);
    if (!route) return null;
    const speed = route.speed * (chip ? .45 : 1);
    let vz = 0;
    if (chip || targetHeight > 6) {
      // Measure travel time with the shared airborne drag, independent of gravity.
      const probe = { x: 0, y: 0, z: 1, vx: speed, vy: 0, vz: 0, spin: 0, age: 0, rotation: 0 };
      let time = 0;
      while (probe.x < route.length && time < 6) {
        const before = probe.x;
        probe.z = 1; probe.vz = 0;
        physics.integrateBall(probe, 1 / 240);
        if (probe.x >= route.length) time += (route.length - before) / (probe.x - before) / 240;
        else time += 1 / 240;
      }
      if (probe.x < route.length) return null;
      vz = (targetHeight + .5 * BALL_GRAVITY * time * time) / time;
    }
    const ball = { ...route.start, z: 0, vx: Math.cos(route.heading) * speed, vy: Math.sin(route.heading) * speed,
      vz, spin: 0, age: 0, rotation: 0 }, state = { travel: 0 };
    const preview = [{ x: ball.x, y: ball.y, z: 0, time: 0 }];
    while (ball.age < 6) {
      const previous = { ...ball };
      advanceRoute(physics, route, state, ball, 1 / 120);
      if (previous.y >= FIELD.top && ball.y < FIELD.top) {
        const t = (previous.y - FIELD.top) / (previous.y - ball.y);
        preview.push({ x: previous.x + (ball.x - previous.x) * t, y: FIELD.top,
          z: previous.z + (ball.z - previous.z) * t, time: previous.age + (ball.age - previous.age) * t });
        break;
      }
      preview.push({ x: ball.x, y: ball.y, z: ball.z, time: ball.age });
      if (ball.x < FIELD.left || ball.x > FIELD.right || ball.y > FIELD.bottom || Math.hypot(ball.vx, ball.vy) < 38) break;
    }
    return { route, speed, vz, targetHeight, preview };
  }
  class DrawShotController extends window.ShoparFootball.AttackController {
    constructor(context) {
      super(context); this.points = null; this.route = null; this.travel = 0; this.chip = false; this.shot = null;
      this.power = .6; this.holdTime = 0; this.drawing = false; this.gestureStart = null; this.tutorialTime = 0;
    }
    enter() {
      this.tutorialTime = this.context.memory.powerTutorialSeen ? 0 : 5;
      this.context.memory.powerTutorialSeen = true;
      super.enter();
    }
    getPresentation() {
      const c = this.context, target = this.shot?.preview.at(-1);
      const aimedAtGoal = c.flow.state === State.AIMING && target && Math.abs(target.y - FIELD.top) < .01 && target.x >= FIELD.goalLeft && target.x <= FIELD.goalRight;
      const phase = c.ball.z < 5 ? 'GROUND' : c.ball.vz > 8 ? 'RISING' : c.ball.vz < -8 ? 'DROPPING' : 'AT THE TOP';
      return { drawToShoot: true, hint: this.context.flow.state === State.AIMING ? (this.points?.length > 1 && !this.route ? 'Draw toward your target in the goal.' : 'Draw from the ball. Hold for power, draw to aim, release to shoot.') : '',
        ariaLabel: 'Draw the Shot. Hold the ball to charge from 60 to 100 percent. Draw to lock power and aim. Release to shoot. Finish higher in the goal for height. Turn CHIP on before holding for a lob.',
        shotPower: c.flow.state === State.AIMING && this.points ? { x: c.player.x,
          y: c.player.y - window.ShoparFootball.Core.SPRITES.playerHeight * window.ShoparFootball.Core.playerScale(c.player), value: this.power, locked: this.drawing } : null,
        shotTutorial: c.flow.state === State.AIMING && this.tutorialTime > 0 && !this.points ? ['HOLD FOR POWER', 'DRAW TO AIM', 'RELEASE TO SHOOT'] : null,
        shotTarget: aimedAtGoal ? { ...target, label: target.z <= 6 ? 'GROUND' : target.z < GOAL.height * .65 ? 'MID' : 'HIGH' } : null,
        flightLabel: c.flow.state === State.BALL_IN_MOTION && !c.resolution ? `HEIGHT NOW · ${phase}` : null,
        chipControl: this.context.flow.state === State.AIMING ? { active: this.chip, disabled: Boolean(this.points) } : null,
        help: { steps: [{ title: '1. Hold for power', detail: '60% to 100% in 0.8 seconds' }, { title: '2. Draw to aim', detail: 'Movement locks your power' }, { title: '3. Release to shoot', detail: 'Finish higher for height' }],
          guide: 'Goal bottom = ground · Goal top = high · CHIP = lob',
          detail: 'Start at 60% power, or hold for up to 0.8 seconds to reach 100%. Draw without lifting to lock power, then release to shoot. Higher power is faster but allows less curve. Draw straight or curve around defenders. The solid line shows the flight; the dashed line shows its ground shadow. CHIP is slower and rises higher. The keeper can still save it, and high shots can go over the bar.' },
        shotPreview: this.context.flow.state === State.AIMING ? this.shot?.preview : null };
    }
    sample(point) {
      if (!this.points) return;
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) { this.cancelInput(); return; }
      if (distance(this.points.at(-1), point) < .001) return;
      this.points.push({ ...point });
      this.shot = buildShot(this.points, this.chip, this.context.physics, this.power);
      this.route = this.shot?.route || null;
    }
    handleInput(input) {
      const c = this.context;
      if (c.flow.state !== State.AIMING) return { handled: false };
      if (input.type === 'chip-toggle') {
        if (this.points) return { handled: false };
        this.chip = !this.chip; this.route = null; this.shot = null;
        return { handled: true };
      }
      if (input.type === 'down') {
        if (!Number.isFinite(input.point.x) || !Number.isFinite(input.point.y) || distance(input.point, c.ball) > Math.max(55, 44 / c.view.scale)) return { handled: false };
        this.points = [{ x: c.ball.x, y: c.ball.y }]; this.route = null; this.shot = null;
        this.gestureStart = { ...input.point }; this.holdTime = 0; this.power = .6; this.drawing = false; this.tutorialTime = 0;
        return { handled: true, capture: true, updateOnRelease: true };
      }
      if (!this.points) return { handled: false };
      if (!Number.isFinite(input.point.x) || !Number.isFinite(input.point.y)) { this.cancelInput(); return { handled: true }; }
      if (!this.drawing) {
        if (distance(input.point, this.gestureStart) < 8 / c.view.scale) {
          if (input.type === 'up') this.cancelInput();
          return { handled: true };
        }
        this.drawing = true;
      }
      this.sample(input.point);
      if (input.type === 'up') {
        this.points = null;
        if (!this.route) { c.feedback.toast('Draw a longer path toward goal.', 1.5); return { handled: true }; }
        const r = this.route;
        c.play.kick = { dx: Math.cos(r.heading), dy: Math.sin(r.heading), power: clamp((this.shot.speed - 220) / 530, 0, 1) };
        this.travel = 0;
        this.launchShot({ vx: Math.cos(r.heading) * this.shot.speed, vy: Math.sin(r.heading) * this.shot.speed, vz: this.shot.vz, spin: 0 });
      }
      return { handled: true };
    }
    cancelInput() {
      this.points = null; this.route = null; this.shot = null; this.gestureStart = null;
      this.holdTime = 0; this.power = .6; this.drawing = false; this.context.feedback.power(0);
    }
    update(dt) {
      if (this.context.flow.state === State.AIMING) {
        this.tutorialTime = Math.max(0, this.tutorialTime - dt);
        if (this.points && !this.drawing) {
          this.holdTime = Math.min(.8, this.holdTime + dt);
          this.power = .6 + .4 * (this.holdTime / .8);
        }
      }
      if (this.chip && this.context.flow.state === State.BALL_IN_MOTION) {
        this.advanceMotion(dt * .85, step => this.updateMotion(step));
      } else super.update(dt);
    }
    integrateShot(dt) {
      if (this.context.resultDelay.pending || !this.route) return this.context.physics.integrateBall(this.context.ball, dt);
      return advanceRoute(this.context.physics, this.route, this, this.context.ball, dt);
    }
  }
  DrawShotController.buildRoute = buildRoute;
  DrawShotController.buildShot = buildShot;
  DrawShotController.pointAt = pointAt;
  window.ShoparFootball.DrawShotController = DrawShotController;
})();
