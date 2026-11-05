/* Practice passing: select space, charge, then let players meet a freely moving ball. */
(() => {
  'use strict';
  const { State, FIELD, clamp } = window.ShoparFootball.Core;
  const { HighlightController } = window.ShoparFootball.Controllers;
  const PASS = Object.freeze({ chargeTime: 1.2, minSpeed: 90, maxSpeed: 540, receiveSpeed: 300,
    runSpeed: 76, chaseSpeed: 140, defenderSpeed: 90, reactionTime: .25, chaseRadius: 72, maxFlight: 4.5 });
  // Each layout lists the passer, two receivers and two defenders.
  const LAYOUTS = [
    null, // Start with the catalog layout.
    [[650, 560], [365, 438], [550, 286], [505, 385], [425, 310]],
    [[500, 575], [280, 480], [712, 365], [465, 422], [600, 457]],
    [[718, 485], [445, 500], [590, 275], [566, 385], [703, 346]],
    [[285, 465], [535, 555], [510, 295], [398, 352], [605, 429]]
  ];
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function contactTime(ballBefore, ballAfter, footBefore, footAfter, radius) {
    const rx = ballBefore.x - footBefore.x, ry = ballBefore.y - footBefore.y;
    const dx = ballAfter.x - ballBefore.x - footAfter.x + footBefore.x;
    const dy = ballAfter.y - ballBefore.y - footAfter.y + footBefore.y;
    const c = rx * rx + ry * ry - radius * radius;
    if (c <= 0) return 0;
    const a = dx * dx + dy * dy, b = 2 * (rx * dx + ry * dy), discriminant = b * b - 4 * a * c;
    if (!a || discriminant < 0) return null;
    const t = (-b - Math.sqrt(discriminant)) / (2 * a);
    return t >= 0 && t <= 1 ? t : null;
  }
  class PrecisionPassController extends HighlightController {
    constructor(context) {
      super(context);
      this.phase = 'aiming'; this.elapsed = 0; this.holdTime = 0; this.power = 0;
      this.holding = false; this.target = null; this.finger = null; this.owner = null;
      this.flightTime = 0; this.travel = 0; this.passDistance = 0;
      this.receiver = null; this.interceptor = null;
    }
    enter() {
      this.context.play.kicker = null; this.context.feedback.power(0);
      return { state: State.DEFENDING, toast: 'Choose a teammate or lead their run. Hold for power, release to pass.', duration: 2.6 };
    }
    nearestMate(point, radius = Infinity) {
      let nearest = null;
      for (const mate of this.context.mates) {
        const foot = this.context.geometry.possessionPosition(mate);
        const gap = Math.min(distance(mate, point), distance(foot, point));
        if (gap <= radius) {
          radius = gap;
          nearest = mate;
        }
      }
      return nearest;
    }
    handleInput(input) {
      if (this.phase !== 'aiming') return { handled: false };
      if (input.type === 'down') {
        const { x, y } = input.point;
        if (!Number.isFinite(x) || !Number.isFinite(y) ||
          x < FIELD.left || x > FIELD.right || y < FIELD.top || y > FIELD.bottom) return { handled: false };
        this.holding = true; this.holdTime = 0; this.power = 0;
        this.target = { x, y };
        this.finger = input.pointerType === 'touch' ? this.target : null;
        this.receiver = this.nearestMate(this.target, 32);
        this.passType = this.receiver ? 'normal' : 'through';
        return { handled: true, capture: true, updateOnRelease: false };
      }
      if (!this.holding || input.type !== 'up') return { handled: false };
      this.holding = false;
      const c = this.context, span = distance(c.ball, this.target);
      if (span < 24) {
        this.cancelInput();
        c.feedback.toast('Choose a target farther from the ball.', 1.5);
        return { handled: true };
      }
      if (this.passType === 'through') this.receiver = this.nearestMate(this.target);
      const speed = PASS.minSpeed + (PASS.maxSpeed - PASS.minSpeed) * this.power;
      this.phase = 'flight'; this.passDistance = span; this.releasedPower = this.power;
      Object.assign(c.ball, { vx: (this.target.x - c.ball.x) / span * speed, vy: (this.target.y - c.ball.y) / span * speed,
        z: 0, vz: 0, spin: 0, age: 0 });
      c.play.kicker = c.player; c.play.motionTime = 0; c.effects.trail = []; c.audio.play('kick');
      return { handled: true };
    }
    cancelInput() {
      if (this.phase !== 'aiming') return;
      this.holding = false; this.target = null; this.finger = null; this.holdTime = 0; this.power = 0;
      this.receiver = null;
    }
    interceptionPoint(foot) {
      const ball = this.context.ball;
      const speed = Math.hypot(ball.vx, ball.vy);
      if (!speed) return null;
      const along = ((foot.x - ball.x) * ball.vx + (foot.y - ball.y) * ball.vy) / speed;
      if (along < 0) return null;
      const time = clamp(along / speed + .15, .15, .6);
      const point = { x: ball.x + ball.vx * time, y: ball.y + ball.vy * time };
      return distance(foot, point) <= PASS.defenderSpeed * time + 18 ? point : null;
    }
    moveActors(dt) {
      const c = this.context;
      c.mates.forEach((actor, i) => {
        const foot = c.geometry.possessionPosition(actor);
        if (this.phase === 'flight' && actor === this.receiver) {
          const destination = this.passType === 'through' ? this.target : c.ball;
          if (this.passType === 'through' || distance(foot, c.ball) < PASS.chaseRadius) {
            c.physics.movePlayer(actor, actor.x + destination.x - foot.x, actor.y + destination.y - foot.y, PASS.chaseSpeed, dt);
            return;
          }
        }
        c.physics.movePlayer(actor, actor.startX + 40 * Math.sin(this.elapsed * .65 + i),
          actor.startY - 28 * Math.sin(this.elapsed * .8 + i), PASS.runSpeed, dt);
      });
      c.defenders.forEach((actor, i) => {
        if (this.phase === 'flight' && this.flightTime >= PASS.reactionTime && (!this.interceptor || this.interceptor === actor)) {
          const foot = c.geometry.possessionPosition(actor);
          const point = this.interceptionPoint(foot);
          if (point) { this.interceptor = actor; this.interceptTarget = point; }
          if (this.interceptor === actor) {
            c.physics.movePlayer(actor, actor.x + this.interceptTarget.x - foot.x,
              actor.y + this.interceptTarget.y - foot.y, PASS.defenderSpeed, dt);
            return;
          }
        }
        c.physics.movePlayer(actor, actor.startX + 34 * Math.sin(this.elapsed * .9 + i * 2),
          actor.startY + 22 * Math.sin(this.elapsed * .7 + i), PASS.defenderSpeed, dt);
      });
    }
    resolve(kind, owner = null) {
      if (this.phase === 'resolved') return;
      this.phase = 'resolved'; this.owner = owner;
      if (owner) {
        this.context.ball.vx *= .12; this.context.ball.vy *= .12;
        if (kind === 'pass_complete') owner.celebration = 1;
        this.context.effects.ripple({ x: this.context.ball.x, y: this.context.ball.y, age: 0 });
      }
      this.context.complete(kind);
    }
    update(dt) {
      const c = this.context, steps = Math.max(1, Math.ceil(dt * 120)), step = dt / steps;
      for (let i = 0; i < steps && this.phase !== 'resolved'; i++) {
        this.elapsed += step;
        const actors = [...c.defenders, ...c.mates], feet = actors.map(a => c.geometry.possessionPosition(a));
        this.moveActors(step);
        if (this.phase === 'aiming') {
          Object.assign(c.ball, c.geometry.possessionPosition(c.player));
          if (this.holding) { this.holdTime += step; this.power = clamp(this.holdTime / PASS.chargeTime, 0, 1); }
          continue;
        }
        const previous = { ...c.ball }; this.flightTime += step; c.play.motionTime = this.flightTime;
        c.physics.integrateBall(c.ball, step); this.travel += distance(previous, c.ball);
        let first = null;
        actors.forEach((actor, index) => {
          const defender = index < c.defenders.length;
          if (!defender && Math.hypot(c.ball.vx, c.ball.vy) > PASS.receiveSpeed) return;
          const t = contactTime(previous, c.ball, feet[index], c.geometry.possessionPosition(actor), defender ? 18 : 16);
          if (t !== null && (!first || t < first.t)) first = { actor, t, defender };
        });
        c.effects.trail.push({ x: c.ball.x, y: c.ball.y, z: 0, age: 0 });
        if (c.effects.trail.length > 70) c.effects.trail.shift();
        c.effects.trail.forEach(p => p.age += step);
        if (first) {
          c.ball.x = previous.x + (c.ball.x - previous.x) * first.t;
          c.ball.y = previous.y + (c.ball.y - previous.y) * first.t;
          this.resolve(first.defender ? 'pass_intercepted' : 'pass_complete', first.actor);
        } else if (c.ball.x < FIELD.left || c.ball.x > FIELD.right || c.ball.y < FIELD.top || c.ball.y > FIELD.bottom || this.flightTime > PASS.maxFlight) this.resolve('pass_missed');
        else if (Math.hypot(c.ball.vx, c.ball.vy) < 48) this.resolve(this.travel < this.passDistance - 40 ? 'pass_short' : 'pass_missed');
      }
    }
    updateResult(dt, resolution) {
      const c = this.context; resolution.elapsed += dt; c.play.motionTime += dt;
      c.physics.integrateBall(c.ball, dt);
      if (this.owner) {
        const actor = this.owner;
        const foot = c.geometry.possessionPosition(actor);
        c.physics.movePlayer(actor, actor.x + c.ball.x - foot.x, actor.y + c.ball.y - foot.y, 60, dt);
      }
      c.effects.trail.forEach(p => p.age += dt);
    }
    getActorPose(actor) {
      return { hidden: actor === this.context.keeper,
        moving: this.phase !== 'resolved' && actor !== this.context.player || actor === this.owner,
        kicking: actor === this.context.player && this.phase === 'flight' && this.flightTime < .25 };
    }
    getPresentation() {
      return { hint: this.phase === 'aiming' ? 'Touch a teammate or open space. Hold for power, release to pass. Lead the run.' : this.phase === 'flight' ? 'Watch the runners and passing lanes.' : '',
        ariaLabel: 'Precision Pass. Touch or click a teammate or open space. Hold to increase pass power, then release to pass to the selected spot. Defenders can intercept.',
        camera: { bounds: { left: 180, top: 180, width: 650, height: 510 }, maxScale: 1.4 },
        help: { steps: [{ title: '1. Choose a target', detail: 'Teammate or space ahead' }, { title: '2. Hold for power', detail: 'Longer passes need more power' }, { title: '3. Release to pass', detail: 'Time the moving receiver' }],
          guide: 'One gesture · Normal and through passes · No automatic reception',
          detail: 'Press on a teammate for a normal pass or pick open space for a through pass. Hold to charge from 0% to 100% in 1.2 seconds and release to pass to that spot. For a through pass, the nearest teammate runs into the selected space. A receiver must physically reach the ball, and a defender can step into a reachable passing lane. Short or overhit passes can miss.' } };
    }
    drawWorld(canvas) {
      const c = this.context, unit = 1 / c.view.scale;
      canvas.save(); canvas.lineWidth = 2 * unit;
      for (const mate of c.mates) {
        const foot = c.geometry.possessionPosition(mate);
        canvas.strokeStyle = '#d0f58d99'; canvas.beginPath(); canvas.ellipse(foot.x, foot.y, 17 * unit, 8 * unit, 0, 0, Math.PI * 2); canvas.stroke();
      }
      if (this.target && this.phase !== 'resolved') {
        if (this.phase === 'aiming') {
          canvas.strokeStyle = '#d0f58d77'; canvas.setLineDash([5 * unit, 6 * unit]); canvas.beginPath();
          canvas.moveTo(c.ball.x, c.ball.y); canvas.lineTo(this.target.x, this.target.y); canvas.stroke(); canvas.setLineDash([]);
        }
        canvas.strokeStyle = '#e5ffc0'; canvas.beginPath(); canvas.arc(this.target.x, this.target.y, 10 * unit, 0, Math.PI * 2);
        canvas.moveTo(this.target.x - 15 * unit, this.target.y); canvas.lineTo(this.target.x + 15 * unit, this.target.y);
        canvas.moveTo(this.target.x, this.target.y - 15 * unit); canvas.lineTo(this.target.x, this.target.y + 15 * unit); canvas.stroke();
      }
      canvas.restore();
    }
    drawOverlay(canvas) {
      if (!this.holding || !this.target) return;
      const v = this.context.view, source = this.finger || this.target;
      const x = clamp(v.x + source.x * v.scale, 78, v.width - 78);
      const y = clamp(v.y + source.y * v.scale - (this.finger ? 95 : 65), 72, v.height - 42);
      canvas.save();
      if (this.finger) { canvas.strokeStyle = '#e5ffc077'; canvas.setLineDash([3, 4]); canvas.beginPath(); canvas.moveTo(x, y + 30); canvas.lineTo(v.x + this.target.x * v.scale, v.y + this.target.y * v.scale - 12); canvas.stroke(); canvas.setLineDash([]); }
      canvas.fillStyle = '#10261bf2'; canvas.fillRect(x - 72, y, 144, 34);
      canvas.strokeStyle = '#bad29888'; canvas.strokeRect(x - 72, y, 144, 34);
      canvas.font = 'bold 11px Arial'; canvas.textAlign = 'center'; canvas.textBaseline = 'top'; canvas.fillStyle = '#e5ffc0';
      canvas.fillText(`${this.passType === 'normal' ? 'NORMAL' : 'THROUGH'} · ${Math.round(this.power * 100)}%`, x, y + 5);
      canvas.fillStyle = '#40554a'; canvas.fillRect(x - 64, y + 23, 128, 5);
      canvas.fillStyle = '#d0f58d'; canvas.fillRect(x - 64, y + 23, 128 * this.power, 5); canvas.restore();
    }
  }
  PrecisionPassController.create = context => {
    const index = context.memory.passLayout ?? 0;
    const layout = LAYOUTS[index];
    context.memory.passLayout = (index + 1) % LAYOUTS.length;
    if (layout) {
      const actors = [context.player, ...context.mates, ...context.defenders];
      actors.forEach((actor, i) => {
        const [x, y] = layout[i];
        Object.assign(actor, { x, y, startX: x, startY: y, tx: x, ty: y });
      });
      Object.assign(context.ball, context.geometry.possessionPosition(context.player));
    }
    return new PrecisionPassController(context);
  };
  window.ShoparFootball.PrecisionPassController = PrecisionPassController;
})();
