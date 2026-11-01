/* A single committed swipe controls the keeper against a preselected penalty. */
(() => {
  'use strict';
  const { State, FIELD, GOAL, HEIGHT_PROJECTION, BALL_GRAVITY, clamp, lerp } = window.ShoparFootball.Core;
  const SHOTS = [
    { x: 424, z: 6, duration: .32 }, { x: 576, z: 68, duration: .32 },
    { x: 500, z: 6, duration: .32 }, { x: 424, z: 68, duration: .28 },
    { x: 576, z: 6, duration: .24 }
  ];
  class PenaltySaveController extends window.ShoparFootball.Controllers.HighlightController {
    constructor(context) {
      super(context);
      const variant = context.memory.variant ?? 0;
      context.memory.variant = variant + 1;
      this.shot = SHOTS[variant % SHOTS.length];
      this.shooter = context.defenders[0];
      this.elapsed = 0; this.phase = 'runup'; this.dive = null; this.finished = false;
      this.height = 0; this.angle = 0; this.hands = [{ x: -12, y: -12 }, { x: 12, y: -12 }];
      Object.assign(context.keeper, { x: 500, y: 100, dive: 0 });
      context.play.controlled = context.keeper;
      this.carry();
    }
    carry() { Object.assign(this.context.ball, this.context.geometry.possessionPosition(this.shooter), { z: 0, vx: 0, vy: 0, vz: 0, spin: 0 }); }
    enter() { return { state: State.DEFENDING, toast: 'Swipe to dive · diagonally for high shots', duration: 2.4 }; }
    getPresentation() {
      return { ballHeld: this.finished && this.context.resolution?.kind === 'penalty_saved', ballInNet: this.finished && this.context.resolution?.kind === 'penalty_conceded', hideHelp: true, hint: this.finished ? '' : this.dive ? 'Watch the gloves' : 'Swipe to dive · stay for the middle',
        ariaLabel: 'Save the Penalty. Swipe anywhere toward the shot. Swipe upward diagonally for a high save. Stay still for a central shot.',
        camera: { bounds: { left: 335, top: -35, width: 330, height: 370 }, maxScale: 2.1 } };
    }
    getActorPose(actor) {
      if (actor === this.context.player) return { hidden: true };
      if (actor === this.shooter) return { moving: this.phase === 'runup', kicking: this.phase === 'flight' && this.context.ball.age < .1,
        stumbling: this.phase === 'runup' && this.elapsed > .62, lean: Math.sign(this.shot.x - 500) * .22 };
      if (actor === this.context.keeper) return { keeperHands: this.hands, hop: -this.height, diving: Boolean(this.dive), diveLean: this.angle };
      return {};
    }
    handleInput(input) {
      if (this.finished || this.dive) return { handled: false };
      if (input.type === 'down') return { handled: true, capture: true, updateOnRelease: true };
      if (input.type === 'move' || input.type === 'up') {
        const dx = input.point.x - input.start.x, dy = input.point.y - input.start.y;
        if (Math.hypot(dx, dy) * this.context.view.scale >= 18) {
          this.dive = { elapsed: 0, direction: Math.sign(dx) || 1, high: dy < -Math.abs(dx) * .45 };
          this.context.audio.play('tap');
        }
      }
      return { handled: true, capture: false };
    }
    cancelInput() {}
    launch() {
      const b = this.context.ball, t = this.shot.duration;
      // Airborne drag is the shared integrator's .10 coefficient.
      const travel = (1 - Math.exp(-.10 * t)) / .10;
      Object.assign(b, { vx: (this.shot.x - b.x) / travel, vy: (FIELD.top - b.y) / travel,
        vz: (this.shot.z + .5 * BALL_GRAVITY * t * t) / t, age: 0 });
      this.phase = 'flight'; this.context.audio.play('kick');
    }
    moveKeeper(dt) {
      if (!this.dive) return;
      const d = this.dive; d.elapsed += dt;
      const progress = clamp(d.elapsed / .18, 0, 1);
      this.context.keeper.x = 500 + d.direction * 70 * progress;
      this.angle = d.direction * .8 * Math.sin(progress * Math.PI / 2);
      this.height = d.high ? Math.sin(clamp(d.elapsed / .42, 0, 1) * Math.PI) * 30 : 0;
      this.hands = [{ x: -12, y: -16 }, { x: 12, y: -16 }];
    }
    glovePoints() {
      const k = this.context.keeper, scale = GOAL.keeperScale, cos = Math.cos(this.angle), sin = Math.sin(this.angle);
      return this.hands.map(hand => ({ x: k.x + (hand.x * cos - hand.y * sin) * scale,
        y: k.y - this.height + (hand.x * sin + hand.y * cos) * scale }));
    }
    touches(previous, oldGloves) {
      const b = this.context.ball;
      if (Math.min(previous.y, b.y) > 118 || Math.max(previous.y, b.y) < FIELD.top) return false;
      const gloves = this.glovePoints();
      // Swept relative contact uses the same projected glove centres as drawing.
      for (let i = 0; i < gloves.length; i++) {
        const rx = previous.x - oldGloves[i].x;
        const ry = previous.y - this.context.keeper.y;
        const rz = previous.z * HEIGHT_PROJECTION - (this.context.keeper.y - oldGloves[i].y);
        const dx = b.x - gloves[i].x - rx, dy = b.y - previous.y;
        const dz = b.z * HEIGHT_PROJECTION - (this.context.keeper.y - gloves[i].y) - rz;
        const t = clamp(-(rx * dx + ry * dy + rz * dz) / (dx * dx + dy * dy + dz * dz || 1), 0, 1);
        if (Math.hypot(rx + dx * t, ry + dy * t, rz + dz * t) < 10) return true;
      }
      // The keeper's torso can also stop a ball aimed directly at it.
      const k = this.context.keeper;
      return Math.abs(b.x - k.x) < 11 && Math.abs(b.y - k.y) < 12 && Math.abs(b.z * HEIGHT_PROJECTION - (this.height + 9)) < 14;
    }
    resolve(kind) {
      this.finished = true; this.phase = 'resolved';
      this.context.complete(kind, kind === 'penalty_saved' ? 'Your keeper reached the ball before it crossed the line.' : 'The ball beat your reach. Read the last step and time your dive.');
    }
    update(dt) {
      const scaled = dt * .4, steps = Math.max(1, Math.ceil(scaled * 240)), step = scaled / steps;
      for (let i = 0; i < steps && !this.finished; i++) {
        this.elapsed += step;
        const b = this.context.ball, previous = { ...b }, gloves = this.glovePoints();
        this.moveKeeper(step);
        if (this.phase === 'runup') {
          this.context.physics.movePlayer(this.shooter, 500, 228, 28, step);
          this.carry();
          if (this.elapsed >= .8) this.launch();
        } else {
          this.context.physics.integrateBall(b, step);
          const crossed = b.y < FIELD.top;
          if (crossed) {
            const fraction = (previous.y - FIELD.top) / (previous.y - b.y);
            b.x = lerp(previous.x, b.x, fraction); b.z = lerp(previous.z, b.z, fraction); b.y = FIELD.top;
          }
          if (this.touches(previous, gloves)) {
            b.vx = b.vy = b.vz = 0; this.resolve('penalty_saved');
          } else if (crossed) {
            b.y = FIELD.top - .01;
            this.resolve('penalty_conceded');
          }
          this.context.effects.trail.push({ x: b.x, y: b.y, z: b.z, age: 0 });
          if (this.context.effects.trail.length > 50) this.context.effects.trail.shift();
          this.context.effects.trail.forEach(point => point.age += step);
        }
      }
    }
    updateResult(dt, resolution) {
      resolution.elapsed += dt;
      const b = this.context.ball;
      if (resolution.kind === 'penalty_saved') {
        const glove = this.glovePoints()[0], blend = 1 - Math.exp(-dt * 15);
        b.x = lerp(b.x, glove.x, blend); b.y = lerp(b.y, this.context.keeper.y, blend);
        b.z = lerp(b.z, (this.context.keeper.y - glove.y) / HEIGHT_PROJECTION, blend);
      } else {
        this.context.physics.integrateBall(b, dt * .4, .2);
        const back = FIELD.top - GOAL.depth + 3;
        if (b.y < back) { b.y = back; b.vy = Math.abs(b.vy) * .02; this.context.effects.netWobble = .8; }
        b.x = clamp(b.x, FIELD.goalLeft + 7, FIELD.goalRight - 7);
        if (b.y > FIELD.top - 3) { b.y = FIELD.top - 3; b.vy = -Math.abs(b.vy) * .2; }
      }
    }
    drawWorld(c) {
      if (this.elapsed > .3 || this.context.memory.variant > 1) return;
      const k = this.context.keeper;
      c.save(); c.strokeStyle = '#d0f69a'; c.lineWidth = 2;
      for (const direction of [-1, 1]) {
        c.beginPath(); c.moveTo(k.x + direction * 22, k.y + 38); c.lineTo(k.x + direction * 65, k.y + 15);
        c.lineTo(k.x + direction * 53, k.y + 16); c.stroke();
      }
      c.restore();
    }
    drawOverlay(c) {
      if (this.finished) return;
      const v = this.context.view;
      c.save(); c.fillStyle = '#d0f69a'; c.textAlign = 'center'; c.font = 'bold 14px Arial';
      const cue = this.elapsed > .62 && this.phase === 'runup' ? (this.shot.x < 500 ? (this.shot.z > 30 ? '↖' : '←') : this.shot.x > 500 ? (this.shot.z > 30 ? '↗' : '→') : '↓') : '';
      c.fillText(this.elapsed < .4 ? 'SWIPE ↔ LOW · ↖ ↗ HIGH' : this.phase === 'runup' ? `WATCH THE KICKER ${cue}` : 'SAVE IT!', v.width / 2, v.height - 45); c.restore();
    }
  }
  window.ShoparFootball.PenaltySaveController = PenaltySaveController;
})();
