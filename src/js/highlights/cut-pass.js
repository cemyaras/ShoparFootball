/* A standalone defensive pass interception: tap a destination, then meet the live ball. */
(() => {
  'use strict';
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const { HighlightController } = window.ShoparFootball.Controllers;
  const { State } = window.ShoparFootball.Core;
  const SETUPS = [
    { angle: 0, passAt: .9, speed: 520 }, { angle: Math.PI, passAt: .85, speed: 540 },
    { angle: -.6, passAt: .95, speed: 530 }, { angle: 2.55, passAt: .9, speed: 550 },
    { angle: .6, passAt: .85, speed: 540 }, { angle: 3.75, passAt: 1, speed: 560 }
  ];
  class PassInterception extends HighlightController {
    constructor(context) {
      super(context); this.passer = context.defenders[0]; this.receiver = context.defenders[1];
      const variant = context.memory.variant ?? 0;
      context.memory.variant = variant + 1;
      this.setup = SETUPS[variant % SETUPS.length];
      const cos = Math.cos(this.setup.angle), sin = Math.sin(this.setup.angle);
      for (const [actor, x, y] of [[context.player, 0, 50], [this.passer, -210, -50], [this.receiver, 210, -10]]) {
        const px = 550 + x * cos - y * sin, py = 400 + x * sin + y * cos;
        Object.assign(actor, { x: px, y: py, startX: px, startY: py, tx: px, ty: py });
      }
      this.run = { x: 30 * cos + 38 * sin, y: 30 * sin - 38 * cos };
      this.runSpeed = Math.hypot(this.run.x, this.run.y);
      this.elapsed = 0; this.phase = 'planning'; this.finished = false; this.target = null;
      this.passAt = this.setup.passAt; this.passStartedAt = null;
      this.instruction = 'Read the run · move into the passing lane'; this.carry(this.passer);
    }
    enter() { return { state: State.DEFENDING, toast: this.instruction, duration: 2.4 }; }
    handleInput(input) {
      if (this.finished) return { handled: false, capture: false };
      if (input.type === 'down') { this.selectTarget(input.point); return { handled: true, capture: false }; }
      return { handled: false, capture: false };
    }
    getPresentation() {
      return { ariaLabel: 'Cut the Pass. Tap a destination to cut the passing lane. The passer releases early under pressure. Read the receiver’s run and intercept the moving ball.',
        hint: this.phase === 'planning' ? 'React quickly. Cut across the receiver’s run.' : 'Meet the ball before the red receiver.',
        hideHelp: this.finished, camera: { bounds: { left: 190, top: 150, width: 730, height: 500 }, maxScale: 1.5,
          lock: this.phase !== 'passing', followBall: this.phase === 'passing',
          anchors: [this.receiver, this.passTarget, this.target].filter(Boolean) } };
    }
    getActorPose(player) {
      return { moving: this.isMoving(player), kicking: player === this.passer && this.phase === 'passing' && this.elapsed - this.passStartedAt < .28 };
    }
    carry(player) { Object.assign(this.context.ball, this.context.geometry.possessionPosition(player), { z: 0, vx: 0, vy: 0, vz: 0, spin: 0 }); }
    selectTarget(point) {
      if (this.finished) return;
      this.target = { x: clamp(point.x, 96, 904), y: clamp(point.y, 110, 660) };
      this.context.effects.ripple({ ...this.target, age: 0 }); this.context.audio.play('tap');
    }
    cancelHold() {}
    isMoving(player) {
      return player === this.receiver && (!this.finished || this.resultKind === 'pass_through') || !this.finished && player === this.context.player && this.target && distance(player, this.target) > 1;
    }
    launch() {
      this.phase = 'passing';
      this.passStartedAt = this.elapsed;
      const b = this.context.ball;
      let flightTime = distance(b, this.receiver) / this.setup.speed;
      // Lead the runner using the same ground drag as ball integration.
      for (let i = 0; i < 4; i++) {
        this.passTarget = this.context.geometry.possessionPosition({ ...this.receiver,
          x: this.receiver.x + this.run.x * flightTime, y: this.receiver.y + this.run.y * flightTime });
        flightTime = -Math.log(1 - .49 * distance(b, this.passTarget) / this.setup.speed) / .49;
      }
      const target = this.passTarget;
      const dx = target.x - b.x, dy = target.y - b.y, span = Math.hypot(dx, dy);
      this.passDirection = { x: dx / span, y: dy / span };
      Object.assign(b, { vx: this.passDirection.x * this.setup.speed, vy: this.passDirection.y * this.setup.speed, age: 0 });
      this.context.audio.play('kick');
    }
    resolve(kind) {
      if (this.finished) return;
      this.finished = true; this.phase = 'resolved'; this.resultKind = kind;
      this.context.complete(kind, kind === 'pass_won' ? 'You read the pass and reached the ball before the receiver.' : 'The receiver reached the pass. Move into the passing lane sooner.');
    }
    update(dt) {
      const g = this.context, steps = Math.max(1, Math.ceil(dt * 120)), step = dt / steps;
      for (let i = 0; i < steps && !this.finished; i++) {
        this.elapsed += step;
        g.physics.movePlayer(this.receiver, this.receiver.startX + this.elapsed * this.run.x,
          this.receiver.startY + this.elapsed * this.run.y, this.runSpeed, step);
        const previousPlayer = { x: g.player.x, y: g.player.y };
        if (this.target) g.physics.movePlayer(g.player, this.target.x, this.target.y, 98, step);
        if (this.phase === 'planning') {
          this.carry(this.passer);
          if (this.elapsed >= this.passAt || distance(g.player, this.passer) <= 180) this.launch();
        }
        else {
          const previousBall = { x: g.ball.x, y: g.ball.y };
          g.physics.integrateBall(g.ball, step);
          // Swept relative motion makes contact fair at any supported frame rate.
          const dx = g.ball.x - previousBall.x - (g.player.x - previousPlayer.x);
          const dy = g.ball.y - previousBall.y - (g.player.y - previousPlayer.y);
          const rx = previousBall.x - previousPlayer.x, ry = previousBall.y - previousPlayer.y;
          const t = clamp(-(rx * dx + ry * dy) / (dx * dx + dy * dy || 1), 0, 1);
          if (Math.hypot(rx + dx * t, ry + dy * t) <= 23) this.resolve('pass_won');
          else if (distance(g.ball, this.receiver) < 26 ||
            (g.ball.x - this.passTarget.x) * this.passDirection.x + (g.ball.y - this.passTarget.y) * this.passDirection.y > 35 ||
            this.elapsed - this.passStartedAt >= 2.4) this.resolve('pass_through');
          g.effects.trail.push({ x: g.ball.x, y: g.ball.y, z: 0, age: 0 }); if (g.effects.trail.length > 70) g.effects.trail.shift();
          g.effects.trail.forEach(p => p.age += step);
        }
      }

    }
    updateResult(dt, resolution) {
      const g = this.context; resolution.elapsed += dt;
      const owner = resolution.kind === 'pass_won' ? g.player : this.receiver;
      if (owner === this.receiver) g.physics.movePlayer(owner, clamp(owner.x + this.run.x, 96, 904),
        clamp(owner.y + this.run.y, 110, 640), this.runSpeed, dt);
      const foot = g.geometry.possessionPosition(owner), blend = 1 - Math.exp(-dt * 18);
      g.ball.x += (foot.x - g.ball.x) * blend; g.ball.y += (foot.y - g.ball.y) * blend;
      g.ball.vx = g.ball.vy = g.ball.vz = 0;
    }
    drawWorld(c) {
      if (this.finished) return;
      const scale = this.context.view.scale;
      c.save(); c.lineWidth = 2 / scale;
      if (this.target) {
        c.strokeStyle = '#d0f58d'; c.beginPath(); c.ellipse(this.target.x, this.target.y, 15 / scale, 7 / scale, 0, 0, Math.PI * 2); c.stroke();
        c.setLineDash([4 / scale, 5 / scale]); c.strokeStyle = '#d0f58d66'; c.beginPath();
        c.moveTo(this.context.player.x, this.context.player.y); c.lineTo(this.target.x, this.target.y); c.stroke(); c.setLineDash([]);
      }
      // Show the receiver's run, rather than revealing the exact future interception point.
      const dx = this.run.x / this.runSpeed, dy = this.run.y / this.runSpeed;
      const x = this.receiver.x + 24, y = this.receiver.y - 10, tipX = x + dx * 35, tipY = y + dy * 35;
      c.strokeStyle = '#ffb399'; c.beginPath(); c.moveTo(x, y); c.lineTo(tipX, tipY);
      c.lineTo(tipX - dx * 8 - dy * 6, tipY - dy * 8 + dx * 6); c.moveTo(tipX, tipY);
      c.lineTo(tipX - dx * 8 + dy * 6, tipY - dy * 8 - dx * 6); c.stroke();
      c.restore();
    }
    drawOverlay(c) {
      if (this.finished || this.target) return;
      const g = this.context, v = g.view, p = g.player;
      const anchor = g.geometry.worldToScreen(p);
      const x = clamp(anchor.x, 85, v.width - 85), y = clamp(anchor.y + 36, 110, v.height - 30);
      c.save(); c.fillStyle = '#0b2019ee'; c.fillRect(x - 80, y - 14, 160, 28);
      c.font = 'bold 12px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#d0f58d'; c.fillText('TAP TO CUT THE PASS', x, y); c.restore();
    }
  }
  window.ShoparFootball.CutPassController = PassInterception;
})();
