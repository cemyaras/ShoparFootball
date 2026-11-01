/* A standalone defensive pass interception: tap a destination, then meet the live ball. */
(() => {
  'use strict';
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const { HighlightController } = window.ShoparFootball.Controllers;
  const { State } = window.ShoparFootball.Core;
  class PassInterception extends HighlightController {
    constructor(context) {
      super(context); this.passer = context.defenders[0]; this.receiver = context.defenders[1];
      this.elapsed = 0; this.phase = 'planning'; this.finished = false; this.target = null;
      this.passAt = 2.8; this.instruction = 'Tap to move · cut out the pass'; this.carry(this.passer);
    }
    enter() { return { state: State.DEFENDING, toast: this.instruction, duration: 2.4 }; }
    handleInput(input) {
      if (this.finished) return { handled: false, capture: false };
      if (input.type === 'down') { this.selectTarget(input.point); return { handled: true, capture: false }; }
      return { handled: false, capture: false };
    }
    getPresentation() {
      return { ariaLabel: 'Cut the Pass. Tap a destination to move your blue player into the passing lane. Intercept the moving ball.',
        hint: this.phase === 'planning' ? 'Tap a destination to cut the passing lane. You can change it.' : 'Meet the ball before the red receiver.',
        hideHelp: this.finished, camera: { bounds: { left: 270, top: 240, width: 600, height: 360 }, maxScale: 1.5 } };
    }
    getActorPose(player) {
      return { moving: this.isMoving(player), kicking: player === this.passer && this.phase === 'passing' && this.elapsed - this.passAt < .28 };
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
      const b = this.context.ball, target = this.context.geometry.possessionPosition({ ...this.receiver, y: this.receiver.y + 28 });
      const dx = target.x - b.x, dy = target.y - b.y, span = Math.hypot(dx, dy);
      Object.assign(b, { vx: dx / span * 390, vy: dy / span * 390, age: 0 });
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
        g.physics.movePlayer(this.receiver, this.receiver.startX, this.receiver.startY + this.elapsed * 18, 24, step);
        const previousPlayer = { x: g.player.x, y: g.player.y };
        if (this.target) g.physics.movePlayer(g.player, this.target.x, this.target.y, 98, step);
        if (this.phase === 'planning') { this.carry(this.passer); if (this.elapsed >= this.passAt) this.launch(); }
        else {
          const previousBall = { x: g.ball.x, y: g.ball.y };
          g.physics.integrateBall(g.ball, step);
          // Swept relative motion makes contact fair at any supported frame rate.
          const dx = g.ball.x - previousBall.x - (g.player.x - previousPlayer.x);
          const dy = g.ball.y - previousBall.y - (g.player.y - previousPlayer.y);
          const rx = previousBall.x - previousPlayer.x, ry = previousBall.y - previousPlayer.y;
          const t = clamp(-(rx * dx + ry * dy) / (dx * dx + dy * dy || 1), 0, 1);
          if (Math.hypot(rx + dx * t, ry + dy * t) <= 23) this.resolve('pass_won');
          else if (distance(g.ball, this.receiver) < 26 || g.ball.x > this.receiver.x + 35 || this.elapsed >= 6.2) this.resolve('pass_through');
          g.effects.trail.push({ x: g.ball.x, y: g.ball.y, z: 0, age: 0 }); if (g.effects.trail.length > 70) g.effects.trail.shift();
          g.effects.trail.forEach(p => p.age += step);
        }
      }

    }
    updateResult(dt, resolution) {
      const g = this.context; resolution.elapsed += dt;
      const owner = resolution.kind === 'pass_won' ? g.player : this.receiver;
      if (owner === this.receiver) g.physics.movePlayer(owner, owner.x + 20, owner.y + 15, 35, dt);
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
      c.strokeStyle = '#ffb399'; c.beginPath(); c.moveTo(this.receiver.x + 22, this.receiver.y - 10); c.lineTo(this.receiver.x + 22, this.receiver.y + 25);
      c.lineTo(this.receiver.x + 16, this.receiver.y + 17); c.moveTo(this.receiver.x + 22, this.receiver.y + 25); c.lineTo(this.receiver.x + 28, this.receiver.y + 17); c.stroke();
      c.restore();
    }
    drawOverlay(c) {
      if (this.finished || this.target) return;
      const g = this.context, v = g.view, p = g.player;
      const x = clamp(v.x + p.x * v.scale, 85, v.width - 85), y = clamp(v.y + p.y * v.scale + 36, 110, v.height - 30);
      c.save(); c.fillStyle = '#0b2019ee'; c.fillRect(x - 80, y - 14, 160, 28);
      c.font = 'bold 12px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#d0f58d'; c.fillText('TAP TO CUT THE PASS', x, y); c.restore();
    }
  }
  window.ShoparFootball.CutPassController = PassInterception;
})();
