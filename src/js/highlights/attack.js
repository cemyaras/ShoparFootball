/* Shared attacking possession, contact, AI and physical outcome playback. */
(() => {
  'use strict';
  const { State, FIELD, GOAL, CONTACT_TIME, HEIGHT_PROJECTION, MISS_PLAYBACK, clamp, lerp, length, distance } = window.ShoparFootball.Core;
  const { HighlightController } = window.ShoparFootball.Controllers;
  class AttackController extends HighlightController {
    enter() {
      this.context.flow.transition(State.AIMING); this.context.feedback.power(0);
    }
    getPresentation() {
      const c = this.context;
      if (c.flow.state !== State.AIMING) return {};
      const through = c.runMarker === 'through';
      const receivers = [c.player, ...c.mates].filter(player => player !== c.play.controlled).map(player => {
        const x = through ? player.x - 22 : player.x, y = through ? player.y - 67 : player.y - 14;
        return { x, y, route: through ? { from: { x: player.x, y: player.y - 22 }, to: { x, y: y + 18 } } : null };
      });
      return { runMarkers: { receivers } };
    }
    handleInput(input) {
      const c = this.context, play = c.play, p = input.point;
      if (input.type === 'down') {
        if (c.flow.state === State.AIMING) {
          if (distance(p, c.ball) > Math.max(55, 44 / c.view.scale)) { c.feedback.toast('Start your drag near the glowing ball.', 1.8); return { handled: false }; }
          play.aim = { dx: 0, dy: -1, power: 0, distance: 0 };
          return { handled: true, capture: true, updateOnRelease: true };
        }
        if (c.flow.state === State.BALL_CONTACT && !play.contact) return { handled: true, capture: true, dismissToast: false };
      } else if (input.type === 'move' && c.flow.state === State.AIMING) {
        const dx = input.start.x - p.x, dy = input.start.y - p.y, d = length(dx, dy);
        play.aim = { dx: d > 0 ? dx / d : 0, dy: d > 0 ? dy / d : -1, power: clamp(d / c.geometry.maxDrag(), 0, 1), distance: d }; c.feedback.power(play.aim.power);
      } else if (input.type === 'up') {
        if (c.flow.state === State.AIMING) {
          const finalAim = play.aim;
          if (!finalAim || finalAim.distance < Math.max(13, 7 / c.view.scale)) { play.aim = null; c.feedback.power(0); return { handled: true }; }
          play.kick = { dx: finalAim.dx, dy: finalAim.dy, power: Math.max(.16, finalAim.power) };
          play.aim = null; c.flow.transition(State.BALL_CONTACT); c.audio.play('tap');
        } else if (c.flow.state === State.BALL_CONTACT) {
          const g = c.geometry.contactGeometry();
          const dx = (p.x - g.x) / g.r, dy = (p.y - g.y) / g.r, radius = Math.max(1, Math.hypot(dx, dy));
          if (distance(p, g) <= g.r + 8 / c.view.scale) this.chooseContact(dx / radius, dy / radius, false);
          else c.feedback.invalidContact();
        }
      }
      return { handled: false, capture: false };
    }
    cancelInput() {
      if (this.context.flow.state === State.AIMING) { this.context.play.aim = null; this.context.feedback.power(0); }
    }
    update(dt) {
      const c = this.context;
      if (c.flow.state === State.BALL_CONTACT) {
        c.feedback.contactTimer();
        if (c.play.contact) { c.play.contact.age += dt; if (c.play.contact.age > .23) this.executeKick(); }
        else if (c.flow.elapsed >= CONTACT_TIME) this.chooseContact(.32, .15, true);
      } else if (c.flow.state === State.BALL_IN_MOTION) {
        // Slow the presentation, including AI, around the goal without changing physics.
        this.advanceMotion(dt * (c.ball.y < 265 ? .42 : .72), step => this.updateMotion(step));
      }
    }
    advanceMotion(motionDt, updateStep) {
      const c = this.context;
      c.play.motionTime += motionDt;
      const steps = Math.max(1, Math.ceil(motionDt / (1 / 120))), step = motionDt / steps;
      for (let i = 0; i < steps && !c.resultDelay.pending; i++) {
        if (![State.BALL_IN_MOTION, State.INTERCEPTION].includes(c.flow.state)) break;
        updateStep(step);
      }
      c.feedback.flight();
    }
    chooseContact(x, y, timedOut) {
      if (this.context.flow.state !== State.BALL_CONTACT || this.context.play.contact) return;
      this.context.play.contact = { x: clamp(x, -1, 1), y: clamp(y, -1, 1), timedOut, age: 0 }; this.context.audio.play('tap');
      if (timedOut) this.context.feedback.toast('Late contact — a little less power and accuracy.', 2);
    }
    executeKick() {
      if (!this.context.play.kick || !this.context.play.contact) return;
      Object.assign(this.context.ball, this.context.physics.kickVelocity(this.context.play.kick, this.context.play.contact), { age: 0, z: 0 });
      Object.assign(this.context.ball, this.context.geometry.possessionPosition(this.context.play.controlled));
      // A short reaction delay keeps corner shots viable from the foot-level origin.
      this.context.play.motionTime = 0; this.context.effects.trail = []; this.context.keeper.reaction = GOAL.keeperReaction; this.context.keeper.dive = 0; this.context.keeper.diveCooldown = 0; this.context.keeper.readTime = 0;
      this.context.play.kicker = this.context.play.controlled; this.context.audio.play('kick');
      this.context.play.flight = { maxHeight: 0, clearedKeeper: false };
      this.context.effects.shake = this.context.play.kick.power > .78 && !this.context.reducedMotion ? 5 : 0;
      this.context.flow.transition(State.BALL_IN_MOTION);
    }
    receive(player, offBall = false) {
      this.context.play.controlled = player; Object.assign(this.context.ball, this.context.geometry.possessionPosition(player));
      Object.assign(this.context.ball, { z: 0, vx: 0, vy: 0, vz: 0, spin: 0 }); this.context.effects.trail = []; this.context.play.aim = null; this.context.play.contact = null; this.context.play.kick = null;
      this.context.possessionReceived(offBall);
      this.context.flow.transition(State.AIMING); this.context.feedback.power(0); this.context.audio.play('tap');
      this.context.play.flight = null; this.context.feedback.flight();
      this.context.feedback.toast(offBall ? 'Ball received' : 'Pass complete', 1.2);
    }
    updateResult(dt, resolution) {
      const b = this.context.ball, r = resolution;
      r.elapsed += dt;
      if (r.kind === 'save') {
        this.context.effects.trail.forEach(p => p.age += dt);
        const blend = 1 - Math.exp(-dt * 15);
        const angle = this.context.keeper.dive > 0 ? (this.context.keeper.diveDirection || 1) * -.75 : 0, handY = -10 * GOAL.keeperScale;
        b.x = lerp(b.x, this.context.keeper.x - Math.sin(angle) * handY, blend); b.y = lerp(b.y, this.context.keeper.y + Math.cos(angle) * handY, blend); b.z = lerp(b.z, 0, blend);
        b.vx = b.vy = b.vz = 0; this.context.keeper.dive = Math.max(0, this.context.keeper.dive - dt); return;
      }
      const airborneMiss = ['high', 'wide'].includes(r.kind) && r.crossing.z > 0;
      const motionDt = dt * (r.kind === 'goal' ? .7 : airborneMiss ? MISS_PLAYBACK : .45), steps = Math.max(1, Math.ceil(motionDt * 120));
      for (let i = 0; i < steps; i++) {
        const previousZ = b.z;
        const impact = this.context.physics.integrateBall(b, motionDt / steps, r.kind === 'goal' ? .20 : .46);
        this.ballImpact(impact);
        if (airborneMiss && !r.landing && previousZ > 0 && impact) {
          r.landing = { x: b.x, y: b.y };
          this.context.resultDelay.remaining = .5;
        }
        if (r.kind === 'goal') {
          const back = FIELD.top - GOAL.depth + 3;
          if (b.y < back) {
            b.y = back; b.vy = Math.abs(b.vy) * .015; b.vx *= .45;
            if (!r.netHit) { r.netHit = true; this.context.effects.netWobble = 1; }
          }
          if (b.x < FIELD.goalLeft + 7 || b.x > FIELD.goalRight - 7) { b.x = clamp(b.x, FIELD.goalLeft + 7, FIELD.goalRight - 7); b.vx *= -.2; }
          if (b.y > FIELD.top - 3) { b.y = FIELD.top - 3; b.vy = -Math.abs(b.vy) * .2; }
          if (b.z > FIELD.crossbar - 3) { b.z = FIELD.crossbar - 3; b.vz = -Math.abs(b.vz) * .2; }
          b.vx *= Math.exp(-2 * motionDt / steps); b.vy *= Math.exp(-2 * motionDt / steps);
        }
      }
      if (['high', 'wide'].includes(r.kind) && !r.exited) {
        const v = this.context.view, radius = this.context.geometry.ballGeometry(b).radius * v.scale;
        const x = v.x + b.x * v.scale, y = v.y + (b.y - b.z * HEIGHT_PROJECTION) * v.scale;
        if (x + radius < 0 || x - radius > v.width || y + radius < 0 || y - radius > v.height) {
          r.exited = true;
          this.context.resultDelay.remaining = Math.min(this.context.resultDelay.remaining, Math.max(.45, .95 - r.elapsed));
        }
      }
      this.context.effects.trail.push({ x: b.x, y: b.y, z: b.z, age: 0 }); if (this.context.effects.trail.length > 70) this.context.effects.trail.shift();
      this.context.effects.trail.forEach(p => p.age += dt);
    }
    ballImpact(impact) {
      if (!impact) return;
      this.context.effects.ripple({ ...impact, bounce: true, age: 0 });
      if (impact.strength > .3) this.context.audio.play('bounce');
    }
    updateKeeper(dt) {
      const k = this.context.keeper, b = this.context.ball; k.reaction -= dt; k.diveCooldown = Math.max(0, k.diveCooldown - dt);
      if (k.reaction > 0) return;
      // Read the visible flight in intervals; late curve needs a new observation.
      k.readTime = (k.readTime || 0) - dt;
      if (k.dive <= 0 && k.readTime <= 0) {
        k.targetX = clamp(b.x + (b.vy < 0 ? b.vx * .12 : 0), FIELD.goalLeft + 18, FIELD.goalRight - 18);
        k.readTime = .16;
      }
      const danger = b.y < 255 && b.vy < -50;
      if (danger && !k.diveCooldown && Math.abs(b.x - k.x) > 22) { k.dive = .42; k.diveCooldown = 1.1; k.diveDirection = Math.sign(k.targetX - k.x) || Math.sign(b.x - k.x); k.targetX = clamp(k.x + k.diveDirection * 78, FIELD.goalLeft + 18, FIELD.goalRight - 18); }
      k.dive = Math.max(0, k.dive - dt);
      const retreat = k.profile === 'advanced' && b.vy < -50 && b.y < k.y + 65 && b.z > 25;
      const targetY = retreat ? FIELD.top + GOAL.keeperOffset : k.homeY;
      this.context.physics.movePlayer(k, k.targetX, targetY, retreat ? 65 : k.dive > 0 ? 185 : 105, dt);
    }
    updateAI(dt) {
      this.updateKeeper(dt); const b = this.context.ball;
      for (const d of this.context.defenders) {
        const react = b.age > .18, near = distance(d, b) < 210;
        const tx = react && near ? b.x + b.vx * .13 : d.startX, ty = react && near ? b.y + b.vy * .13 : d.startY;
        this.context.physics.movePlayer(d, clamp(tx, 100, 900), clamp(ty, 132, 630), react && near ? 84 : 22, dt);
      }
      let receiver = null, best = Infinity;
      for (const p of [this.context.player, ...this.context.mates]) {
        if (p === this.context.play.kicker) continue;
        const score = distance(p, { x: b.x + b.vx * .38, y: b.y + b.vy * .38 });
        if (score < best) { best = score; receiver = p; }
      }
      for (const p of [this.context.player, ...this.context.mates]) {
        if (p === this.context.play.kicker) continue;
        if (p === receiver && best < 365) {
          // Run onto a pass and attack its landing point, including a lofted through ball.
          const lookAhead = clamp(distance(p, b) / 260, .08, .5);
          this.context.physics.movePlayer(p, clamp(b.x + b.vx * lookAhead, 100, 900), clamp(b.y + b.vy * lookAhead, 135, 650), 132, dt);
        } else this.context.physics.movePlayer(p, p.startX, p.startY - 28, 65, dt);
      }
    }
    updateMotion(dt) {
      const previousKeeperPlane = this.context.keeper.y - 7;
      this.updateAI(dt); const b = this.context.ball, previous = { x: b.x, y: b.y, z: b.z }; this.ballImpact(this.context.physics.integrateBall(b, dt));
      if (this.context.play.flight) {
        this.context.play.flight.maxHeight = Math.max(this.context.play.flight.maxHeight, b.z);
        const plane = this.context.keeper.y - 7;
        if (previous.y >= previousKeeperPlane && b.y < plane && b.z - this.context.geometry.ballGeometry(b).radius / HEIGHT_PROJECTION > GOAL.keeperReach && Math.abs(b.x - this.context.keeper.x) < 60) this.context.play.flight.clearedKeeper = true;
      }
      if (b.age > .035) { this.context.effects.trail.push({ x: b.x, y: b.y, z: b.z, age: 0 }); if (this.context.effects.trail.length > 70) this.context.effects.trail.shift(); }
      this.context.effects.trail.forEach(t => t.age += dt);
      if (previous.y >= FIELD.top && b.y < FIELD.top) {
        const t = (previous.y - FIELD.top) / (previous.y - b.y), x = lerp(previous.x, b.x, t), z = lerp(previous.z, b.z, t);
        b.x = x; b.y = FIELD.top - .01; b.z = z;
        const outcome = this.context.physics.goalLineOutcome(x, z);
        if (outcome === 'post' || outcome === 'bar') {
          b.vy = Math.abs(b.vy) * .42; b.vz = -Math.abs(b.vz) * .35;
          if (outcome === 'post') b.vx = Math.sign(x - 500) * Math.max(80, Math.abs(b.vx));
          this.context.audio.play('save'); this.context.complete(outcome, outcome === 'post' ? 'The ball clipped the upright and rebounded out.' : 'The ball hit the crossbar and came back out. Use a little less loft.');
        } else if (outcome === 'goal') this.context.complete('goal');
        else this.context.complete(outcome, outcome === 'high' ? 'The ball cleared the crossbar and continued behind the goal.' : 'The ball passed outside the posts. Aim farther inside the goal.');
        return;
      }
      if (b.x < FIELD.left || b.x > FIELD.right || b.y > FIELD.bottom) { this.context.complete('wide', 'Out of play. A little less power or curve may keep the next one in.'); return; }
      if (b.age > .12 && b.z - this.context.geometry.ballGeometry(b).radius / HEIGHT_PROJECTION < GOAL.keeperReach) {
        const k = this.context.keeper, radius = k.dive > 0 ? 32 : 23;
        if (length(b.x - k.x, b.y - (k.y - 7)) < radius) {
          this.context.ball.vx = 0; this.context.ball.vy = 0; this.context.ball.vz = 0; k.dive = .65;
          this.context.complete('save', 'The keeper gets behind it. Try a firmer strike toward either corner.'); return;
        }
      }
      if (b.age > .14 && b.z < 26) {
        for (const d of this.context.defenders) if (length(b.x - d.x, b.y - (d.y - 7)) < 22) { this.context.ball.vx *= .12; this.context.ball.vy *= .12; this.context.complete('blocked', 'A defender got to the ball first. Try another angle or a little loft.'); return; }
      }
      if (b.age > .16 && b.z < 24) {
        for (const p of [this.context.player, ...this.context.mates]) if (p !== this.context.play.kicker && distance(p, b) < 31) {
          this.receive(p); return;
        }
      }
      if ((length(b.vx, b.vy) < 38 && b.z < 3 && b.age > .7) || this.context.play.motionTime > 6) {
        this.context.complete('weak', 'The ball runs out of pace. Pull back farther to add power.');
      }
    }
  }
  window.ShoparFootball.AttackController = AttackController;
})();
