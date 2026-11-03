/* Drawn shots share attacking AI, collisions and result playback. */
(() => {
  'use strict';
  const { State, FIELD, GOAL, BALL_GRAVITY, HEIGHT_PROJECTION, goalGeometry, clamp } = window.ShoparFootball.Core;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const SAMPLE_DISTANCE = 8;
  const MIN_RADIUS = 24;
  const POSITIONS = [
    { player: [500, 365], defender: [530, 235] },
    { player: [360, 400], defender: [455, 255] },
    { player: [640, 400], defender: [545, 255] },
    { player: [500, 300], defender: [530, 205] },
    { player: [410, 470], defender: [490, 300] },
    { player: [590, 470], defender: [525, 300] }
  ];
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
    const limit = Math.min(span * .45, span * span / (4 * MIN_RADIUS), 160);
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
      speed: clamp(400 + .65 * span, 430, 700) };
  }
  function turnShot(ball, spin, dt) {
    const speed = Math.hypot(ball.vx, ball.vy);
    const angle = spin * 1.8 * Math.min(1.3, 600 / Math.max(300, speed)) * dt;
    const cos = Math.cos(angle), sin = Math.sin(angle), vx = ball.vx;
    ball.vx = vx * cos - ball.vy * sin; ball.vy = vx * sin + ball.vy * cos;
  }
  function advanceShot(physics, ball, dt) {
    const steps = Math.max(1, Math.ceil(dt * 240)), step = dt / steps;
    let impact = null;
    for (let i = 0; i < steps; i++) {
      const spin = ball.spin;
      // Symmetric velocity turns keep the integration stable across frame sizes.
      // Position, gravity, drag and bounce are all advanced by shared physics.
      turnShot(ball, spin, step / 2);
      ball.spin = 0; // Avoid applying the shared NSS spin model a second time.
      const contact = physics.integrateBall(ball, step);
      ball.spin = spin * Math.exp(-.65 * step) * (contact ? .65 : 1);
      turnShot(ball, ball.spin, step / 2);
      impact = contact || impact;
    }
    return impact;
  }
  function buildShot(points, chip, physics, power = .6) {
    if (points.length < 2) return null;
    const mouth = goalGeometry(), start = points[0], end = points.at(-1);
    const inGoal = end.x >= mouth.left - 24 && end.x <= mouth.right + 24 && end.y < mouth.bottom;
    const targetHeight = inGoal ? clamp((mouth.bottom - end.y) / HEIGHT_PROJECTION, 0, GOAL.height * 2) : 0;
    // Pointer coordinates describe the projected goal mouth. Keep x and drawing progress,
    // but put the horizontal endpoint on the real goal line before interpreting intent.
    const ground = inGoal ? points.map(p => ({ x: p.x,
      y: p.y + (mouth.bottom - end.y) * clamp((start.y - p.y) / (start.y - end.y), 0, 1) })) : points;
    const route = buildRoute(ground);
    if (!route) return null;
    const charge = (clamp(power, .6, 1) - .6) / .4;
    const referenceSpeed = route.speed * (chip ? .45 : 1), speed = referenceSpeed * (1 + .25 * charge);
    const target = { x: end.x, y: inGoal ? FIELD.top : end.y, z: targetHeight };
    const chord = Math.atan2(target.y - start.y, target.x - start.x);
    const bend = Math.atan2(Math.sin(route.heading - chord), Math.cos(route.heading - chord));
    const heading = chord + bend * .65;
    const spin = Math.abs(bend) < .01 ? 0 : -clamp(bend / .73, -1, 1) * 1.1 * (1 - .55 * charge) * (chip ? .45 : 1);
    const airborne = chip || targetHeight > 6;
    // Height represents a neutral-power aiming reference, not a solved arrival condition.
    const span = distance(start, target);
    const probe = { x: 0, y: 0, z: 0, vx: referenceSpeed, vy: 0, vz: 0, spin: 0, age: 0, rotation: 0 };
    let referenceTime = 0;
    while (probe.x < span && referenceTime < 6) {
      const before = probe.x;
      probe.z = airborne ? 1 : 0; probe.vz = 0;
      physics.integrateBall(probe, 1 / 240);
      if (probe.x >= span) referenceTime += (span - before) / (probe.x - before) / 240;
      else referenceTime += 1 / 240;
    }
    const vz = airborne ? (targetHeight + .5 * BALL_GRAVITY * referenceTime * referenceTime) / referenceTime : 0;
    const ball = { ...route.start, z: 0, vx: Math.cos(heading) * speed, vy: Math.sin(heading) * speed,
      vz, spin, age: 0, rotation: 0 };
    const preview = [{ x: ball.x, y: ball.y, z: 0, time: 0 }];
    const previewTime = clamp(referenceTime * .7 / (1 + .25 * charge), .18, 1.4);
    while (ball.age < previewTime - 1e-9) {
      advanceShot(physics, ball, Math.min(1 / 120, previewTime - ball.age));
      preview.push({ x: ball.x, y: ball.y, z: ball.z, time: ball.age });
      if (ball.y < FIELD.top || ball.x < FIELD.left || ball.x > FIELD.right || ball.y > FIELD.bottom || Math.hypot(ball.vx, ball.vy) < 38) break;
    }
    return { route, speed, vz, heading, spin, target, targetHeight, referenceTime, preview };
  }
  class DrawShotController extends window.ShoparFootball.AttackController {
    constructor(context) {
      super(context); this.points = null; this.route = null; this.travel = 0; this.chip = false; this.shot = null;
      this.power = .6; this.holdTime = 0; this.drawing = false; this.gestureStart = null; this.tutorialTime = 0;
      this.touchAim = false; this.liftDistance = 0; this.aimCursor = null;
    }
    enter() {
      this.tutorialTime = this.context.memory.powerTutorialSeen ? 0 : 5;
      this.context.memory.powerTutorialSeen = true;
      super.enter();
    }
    getPresentation() {
      const c = this.context, target = this.shot?.target;
      const aimedAtGoal = c.flow.state === State.AIMING && target && Math.abs(target.y - FIELD.top) < .01 && target.x >= FIELD.goalLeft && target.x <= FIELD.goalRight;
      const phase = c.ball.z < 5 ? 'GROUND' : c.ball.vz > 8 ? 'RISING' : c.ball.vz < -8 ? 'DROPPING' : 'AT THE TOP';
      return { drawToShoot: true, hint: this.context.flow.state === State.AIMING ? (this.points?.length > 1 && !this.route ? 'Draw toward your target in the goal.' : 'Draw from the ball. Hold for power, draw to aim, release to shoot.') : '',
        ariaLabel: 'Draw the Shot. Hold the ball to charge from 60 to 100 percent. Draw to lock power and aim. Release to shoot. Finish higher in the goal for height. Turn CHIP on before holding for a lob.',
        shotPower: c.flow.state === State.AIMING && this.points ? { x: c.player.x,
          y: c.player.y - window.ShoparFootball.Core.SPRITES.playerHeight * window.ShoparFootball.Core.playerScale(c.player), value: this.power, locked: this.drawing } : null,
        shotTutorial: c.flow.state === State.AIMING && this.tutorialTime > 0 && !this.points ? ['HOLD FOR POWER', 'DRAW TO AIM', 'RELEASE TO SHOOT'] : null,
        shotTarget: aimedAtGoal ? { ...target, label: target.z <= 6 ? 'AIM GROUND' : target.z < GOAL.height * .65 ? 'AIM MID' : 'AIM HIGH' } : null,
        flightLabel: c.flow.state === State.BALL_IN_MOTION && !c.resolution ? `HEIGHT NOW · ${phase}` : null,
        chipControl: this.context.flow.state === State.AIMING ? { active: this.chip, disabled: Boolean(this.points) } : null,
        help: { steps: [{ title: '1. Hold for power', detail: '60% to 100% in 0.8 seconds' }, { title: '2. Draw to aim', detail: 'Movement locks your power' }, { title: '3. Release to shoot', detail: 'Finish higher for height' }],
          guide: 'Goal bottom = ground · Goal top = high · CHIP = lob',
          detail: 'Start at 60% power, or hold for up to 0.8 seconds to reach 100%. Draw without lifting to lock power, then release to shoot. Higher power is faster but allows less curve. Draw straight or curve around defenders. The short solid line estimates early flight; the dashed line shows its ground shadow. AIM marks your intended target. Power and curve can carry the real shot away from that target. CHIP is slower and rises higher. The keeper can still save it, and high shots can go over the bar.' },
        aimCursor: c.flow.state === State.AIMING && this.points ? this.aimCursor : null,
        shotPreview: this.context.flow.state === State.AIMING ? this.shot?.preview : null };
    }
    sample(point) {
      if (!this.points) return;
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) { this.cancelInput(); return; }
      if (distance(this.points.at(-1), point) < .001) return;
      this.points.push({ ...point });
      let aimed = this.points;
      if (this.touchAim) {
        const view = this.context.view, scale = view.scale, start = this.points[0];
        this.liftDistance = Math.max(this.liftDistance, distance(this.gestureStart, point) * scale);
        const t = clamp(this.liftDistance / 70, 0, 1), lift = 95 * t * t * (3 - 2 * t) / scale;
        const margin = 14, top = view.height < 500 ? 60 : 80;
        const cursor = {
          x: clamp(point.x, (margin - view.x) / scale, (view.width - margin - view.x) / scale),
          y: clamp(point.y - lift, Math.max((top - view.y) / scale, goalGeometry().bottom - GOAL.height * 2 * HEIGHT_PROJECTION), (view.height - margin - view.y) / scale)
        };
        const shiftX = cursor.x - point.x, shiftY = cursor.y - point.y;
        const dx = point.x - start.x, dy = point.y - start.y, squared = dx * dx + dy * dy;
        // Apply the visible endpoint's lift and bounds to the whole stroke, anchored
        // at the ball. Straight strokes stay straight, including near screen edges.
        aimed = this.points.map(p => {
          const progress = squared ? clamp(((p.x - start.x) * dx + (p.y - start.y) * dy) / squared, 0, 1) : 0;
          return { x: p.x + shiftX * progress, y: p.y + shiftY * progress };
        });
        this.aimCursor = { ...cursor, finger: { ...point } };
      }
      this.shot = buildShot(aimed, this.chip, this.context.physics, this.power);
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
        this.touchAim = input.pointerType === 'touch'; this.liftDistance = 0; this.aimCursor = null;
        if (this.touchAim) this.aimCursor = { x: c.ball.x, y: c.ball.y, finger: { ...input.point } };
        return { handled: true, capture: true, updateOnRelease: !this.touchAim };
      }
      if (!this.points) return { handled: false };
      const touchRelease = this.touchAim && input.type === 'up';
      if (touchRelease && !this.drawing) { this.cancelInput(); return { handled: true }; }
      if (!touchRelease && (!Number.isFinite(input.point.x) || !Number.isFinite(input.point.y))) { this.cancelInput(); return { handled: true }; }
      if (!this.drawing) {
        if (distance(input.point, this.gestureStart) < 8 / c.view.scale) {
          if (input.type === 'up') this.cancelInput();
          return { handled: true };
        }
        this.drawing = true;
      }
      if (!touchRelease) this.sample(input.point);
      if (input.type === 'up') {
        this.points = null;
        if (!this.route) { c.feedback.toast('Draw a longer path toward goal.', 1.5); return { handled: true }; }
        c.play.kick = { dx: Math.cos(this.shot.heading), dy: Math.sin(this.shot.heading), power: clamp((this.shot.speed - 220) / 530, 0, 1) };
        this.travel = 0;
        this.launchShot({ vx: Math.cos(this.shot.heading) * this.shot.speed, vy: Math.sin(this.shot.heading) * this.shot.speed, vz: this.shot.vz, spin: this.shot.spin });
      }
      return { handled: true };
    }
    cancelInput() {
      this.points = null; this.route = null; this.shot = null; this.gestureStart = null;
      this.touchAim = false; this.liftDistance = 0; this.aimCursor = null;
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
      const before = { x: this.context.ball.x, y: this.context.ball.y };
      const impact = advanceShot(this.context.physics, this.context.ball, dt);
      this.travel += distance(before, this.context.ball);
      return impact;
    }
  }
  DrawShotController.buildRoute = buildRoute;
  DrawShotController.buildShot = buildShot;
  DrawShotController.pointAt = pointAt;
  DrawShotController.create = context => {
    const index = context.memory.shotPosition ?? 0, position = POSITIONS[index % POSITIONS.length];
    context.memory.shotPosition = (index + 1) % POSITIONS.length;
    for (const [actor, point] of [[context.player, position.player], [context.defenders[0], position.defender]]) {
      const [x, y] = point;
      Object.assign(actor, { x, y, startX: x, startY: y, tx: x, ty: y });
    }
    Object.assign(context.ball, context.geometry.possessionPosition(context.player), { z: 0, vx: 0, vy: 0, vz: 0, spin: 0, age: 0 });
    return new DrawShotController(context);
  };
  window.ShoparFootball.DrawShotController = DrawShotController;
})();
