/* Win the Ball: hold to chase, release to tackle the exposed ball. */
(() => {
  'use strict';
  const RULES = Object.freeze({ duration: 7.2, windowStart: .34, windowEnd: .72, noticeRange: 82, tackleReach: 43 });
  const VARIANTS = Object.freeze([
    { name: 'SIDE', player: [425, 485], speed: 100, period: 1.35, offset: .12 },
    { name: 'DIAGONAL', player: [395, 510], speed: 106, period: 1.55, offset: .05 },
    { name: 'CHASE', player: [385, 405], speed: 94, period: 1.25, offset: .91 }
  ]);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  class DefensiveHighlight {
    constructor(game) {
      this.game = game; this.opponent = game.defenders[0];
      game.defenseVariant = ((game.defenseVariant ?? -1) + 1) % VARIANTS.length;
      this.variant = VARIANTS[game.defenseVariant];
      Object.assign(game.player, { x: this.variant.player[0], y: this.variant.player[1] });
      this.windowCycle = -1;
      this.elapsed = 0; this.phase = 'planning'; this.finished = false; this.tackle = null;
      this.trail = []; this.syncBall();
    }
    beginHold() { if (!this.finished) this.phase = 'running'; }
    cancelHold() { if (!this.finished) { this.phase = 'planning'; this.windowCycle = -1; } }
    dribblePhase() { return ((this.elapsed + this.variant.offset) % this.variant.period) / this.variant.period; }
    timing() {
      const player = this.game.player, opponent = this.opponent, ball = this.game.ball;
      const phase = this.dribblePhase();
      const visible = this.phase === 'running' && !this.finished && distance(player, opponent) <= RULES.noticeRange;
      const inReach = distance(player, ball) <= RULES.tackleReach;
      // Approaching from the side/front reaches the exposed ball; directly behind is shielded.
      const positioned = ((player.x - opponent.x) * 28 + (player.y - opponent.y) * 11) / Math.hypot(28, 11) >= -6;
      return { phase, visible, inReach, positioned, ready: visible && inReach && positioned && this.windowCycle === Math.floor((this.elapsed + this.variant.offset) / this.variant.period) && phase >= RULES.windowStart && phase <= RULES.windowEnd };
    }
    attemptTackle() {
      if (this.finished || this.phase !== 'running') return;
      const timing = this.timing();
      const player = this.game.player, ball = this.game.ball;
      this.tackle = { elapsed: 0, from: { x: player.x, y: player.y }, target: { x: ball.x, y: ball.y }, success: timing.ready };
      this.resolve(timing.ready ? 'ball_won' : 'missed_tackle');
    }
    resolve(kind) {
      if (this.finished) return;
      this.finished = true; this.phase = 'resolved';
      this.game.cancelPointer(this.game.pointer?.id);
      const details = {
        ball_won: 'You reached the exposed ball from a good position and timed the tackle.',
        missed_tackle: 'The tackle was mistimed or the ball was still out of reach.',
        opponent_escaped: 'Hold to chase sooner. Release when the ball ring turns green.'
      };
      this.game.finish(kind, details[kind]);
    }
    chase(dt) {
      // Approach the exposed side of the dribble, then match the moving opponent.
      const opponent = this.opponent;
      this.game.movePlayer(this.game.player, opponent.x + 15, opponent.y + 32, this.variant.speed, dt);
    }
    moveOpponent(dt, escape = false) {
      const opponent = this.opponent;
      if (escape) this.game.movePlayer(opponent, opponent.x + 28, opponent.y + 11, 64, dt);
      else this.game.movePlayer(opponent, opponent.startX + this.elapsed * 28, opponent.startY + this.elapsed * 11 + Math.sin(this.elapsed * 1.6) * 5, 40, dt);
    }
    syncBall() {
      const ball = this.game.ball, opponent = this.opponent;
      const phase = this.dribblePhase();
      const lead = 8 + 24 * Math.sin(Math.PI * phase) ** 2;
      Object.assign(ball, { x: opponent.x + lead * .93, y: opponent.y + lead * .36 + 5, z: 0, vx: 0, vy: 0, vz: 0 });
    }
    update(dt) {
      const steps = Math.max(1, Math.ceil(dt * 120)), step = dt / steps;
      for (let i = 0; i < steps && !this.finished; i++) {
        this.elapsed += step; this.moveOpponent(step);
        if (this.phase === 'running') this.chase(step);
        this.syncBall(); this.game.ball.rotation += step * 5;
        const timing = this.timing();
        // Skip a fleeting opportunity when arriving at the very end of a dribble.
        if (timing.visible && timing.inReach && timing.positioned && timing.phase >= RULES.windowStart && (RULES.windowEnd - timing.phase) * this.variant.period >= .42) {
          this.windowCycle = Math.floor((this.elapsed + this.variant.offset) / this.variant.period);
        }
        if (this.elapsed >= RULES.duration) this.resolve('opponent_escaped');
      }
      this.trail.push({ x: this.opponent.x, y: this.opponent.y }); if (this.trail.length > 16) this.trail.shift();
      if (!this.finished) {
        const timing = this.timing();
        const hint = this.phase === 'planning' ? 'Hold anywhere to chase. Release when green.' : timing.ready ? 'Release now!' : 'Keep holding · watch the ball.';
        const label = document.getElementById('bottom-hint');
        if (label.textContent !== hint) label.textContent = hint;
      }
    }
    updateResult(dt) {
      const game = this.game, player = game.player, tackle = this.tackle;
      game.resolution.elapsed += dt;
      if (tackle) {
        tackle.elapsed += dt;
        const progress = Math.min(1, tackle.elapsed / .24), ease = 1 - (1 - progress) ** 2;
        const dx = tackle.target.x - tackle.from.x, dy = tackle.target.y - tackle.from.y, span = Math.hypot(dx, dy), reach = Math.min(38, span) / Math.max(1, span);
        player.x = tackle.from.x + dx * reach * ease; player.y = tackle.from.y + dy * reach * ease;
        player.step += dt * 9;
        if (tackle.success) {
          const foot = game.possessionPosition(player), blend = Math.min(1, dt * 20);
          game.ball.x += (foot.x - game.ball.x) * blend; game.ball.y += (foot.y - game.ball.y) * blend;
          if (tackle.elapsed < .25) this.moveOpponent(dt);
        } else { this.moveOpponent(dt, true); this.syncBall(); }
      } else { this.moveOpponent(dt, true); this.syncBall(); }
      game.ball.rotation += dt * 3;
    }
    drawWorld(c) {
      if (this.finished) return;
      const game = this.game, scale = game.view.scale, player = game.player;
      c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
      if (this.phase === 'planning') {
        c.strokeStyle = '#d0f58da8'; c.lineWidth = 2 / scale;
        c.beginPath(); c.arc(player.x, player.y, (22 + Math.sin(game.time * 4) * 2) / scale, 0, Math.PI * 2); c.stroke();
      }
      c.setLineDash([]); c.strokeStyle = '#ff8b7966'; c.lineWidth = 1.5 / scale;
      c.beginPath(); this.trail.forEach((point, i) => i ? c.lineTo(point.x, point.y) : c.moveTo(point.x, point.y)); c.stroke();
      c.strokeStyle = '#ff8b79aa'; c.beginPath(); c.ellipse(this.opponent.x, this.opponent.y + 6, 15, 7, 0, 0, Math.PI * 2); c.stroke();
      if (this.phase === 'planning') {
        const x = this.opponent.x + 45, y = this.opponent.y + 18;
        c.beginPath(); c.moveTo(x - 18, y - 7); c.lineTo(x, y); c.lineTo(x - 8, y - 8); c.moveTo(x, y); c.lineTo(x - 12, y + 2); c.stroke();
      }
      c.restore();
    }
    drawTiming(c) {
      if (this.finished) return;
      const timing = this.timing(), game = this.game, v = game.view, ball = game.ball;
      const x = v.x + ball.x * v.scale, y = v.y + ball.y * v.scale;
      const ready = timing.ready, radius = Math.max(17, game.ballGeometry(ball).radius * v.scale + 7);
      c.save(); c.lineWidth = ready ? 4 : 2;
      c.strokeStyle = ready ? '#c6ff70' : '#ffc477';
      c.beginPath(); c.arc(x, y, radius, 0, Math.PI * 2); c.stroke();
      const text = this.phase === 'planning' ? 'HOLD TO CHASE' : ready ? 'RELEASE!' : 'HOLD…';
      c.font = 'bold 12px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
      const tx = clamp(x, 75, v.width - 75), ty = clamp(y + radius + 22, 110, v.height - 30);
      const width = text.length * 7 + 20;
      c.fillStyle = '#0b2019ee'; c.fillRect(tx - width / 2, ty - 13, width, 26);
      c.fillStyle = ready ? '#c6ff70' : '#fff2d8'; c.fillText(text, tx, ty); c.restore();
    }
  }
  window.DefensiveHighlight = DefensiveHighlight;
})();

/* A standalone defensive pass interception: tap a destination, then meet the live ball. */
(() => {
  'use strict';
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  class PassInterception {
    constructor(game) {
      this.game = game; this.passer = game.defenders[0]; this.receiver = game.defenders[1];
      this.elapsed = 0; this.phase = 'planning'; this.finished = false; this.target = null;
      this.passAt = 2.8; this.instruction = 'Tap to move · cut out the pass'; this.carry(this.passer);
    }
    carry(player) { Object.assign(this.game.ball, this.game.possessionPosition(player), { z: 0, vx: 0, vy: 0, vz: 0, spin: 0 }); }
    selectTarget(point) {
      if (this.finished) return;
      this.target = { x: clamp(point.x, 96, 904), y: clamp(point.y, 110, 660) };
      this.game.ripples.push({ ...this.target, age: 0 }); this.game.audio.play('tap');
    }
    cancelHold() {}
    isMoving(player) {
      return player === this.receiver && (!this.finished || this.game.resolution?.kind === 'pass_through') || !this.finished && player === this.game.player && this.target && distance(player, this.target) > 1;
    }
    launch() {
      this.phase = 'passing';
      const b = this.game.ball, target = this.game.possessionPosition({ ...this.receiver, y: this.receiver.y + 28 });
      const dx = target.x - b.x, dy = target.y - b.y, span = Math.hypot(dx, dy);
      Object.assign(b, { vx: dx / span * 390, vy: dy / span * 390, age: 0 });
      this.game.audio.play('kick');
    }
    resolve(kind) {
      if (this.finished) return;
      this.finished = true; this.phase = 'resolved'; this.game.cancelPointer(this.game.pointer?.id);
      this.game.finish(kind, kind === 'pass_won' ? 'You read the pass and reached the ball before the receiver.' : 'The receiver reached the pass. Move into the passing lane sooner.');
    }
    update(dt) {
      const g = this.game, steps = Math.max(1, Math.ceil(dt * 120)), step = dt / steps;
      for (let i = 0; i < steps && !this.finished; i++) {
        this.elapsed += step;
        g.movePlayer(this.receiver, this.receiver.startX, this.receiver.startY + this.elapsed * 18, 24, step);
        const previousPlayer = { x: g.player.x, y: g.player.y };
        if (this.target) g.movePlayer(g.player, this.target.x, this.target.y, 98, step);
        if (this.phase === 'planning') { this.carry(this.passer); if (this.elapsed >= this.passAt) this.launch(); }
        else {
          const previousBall = { x: g.ball.x, y: g.ball.y };
          g.integrateBall(g.ball, step);
          // Swept relative motion makes contact fair at any supported frame rate.
          const dx = g.ball.x - previousBall.x - (g.player.x - previousPlayer.x);
          const dy = g.ball.y - previousBall.y - (g.player.y - previousPlayer.y);
          const rx = previousBall.x - previousPlayer.x, ry = previousBall.y - previousPlayer.y;
          const t = clamp(-(rx * dx + ry * dy) / (dx * dx + dy * dy || 1), 0, 1);
          if (Math.hypot(rx + dx * t, ry + dy * t) <= 23) this.resolve('pass_won');
          else if (distance(g.ball, this.receiver) < 26 || g.ball.x > this.receiver.x + 35 || this.elapsed >= 6.2) this.resolve('pass_through');
          g.trail.push({ x: g.ball.x, y: g.ball.y, z: 0, age: 0 }); if (g.trail.length > 70) g.trail.shift();
          g.trail.forEach(p => p.age += step);
        }
      }
      if (!this.finished) document.getElementById('bottom-hint').textContent = this.phase === 'planning' ? 'Tap a destination to cut the passing lane. You can change it.' : 'Meet the ball before the red receiver.';
    }
    updateResult(dt) {
      const g = this.game; g.resolution.elapsed += dt;
      const owner = g.resolution.kind === 'pass_won' ? g.player : this.receiver;
      if (owner === this.receiver) g.movePlayer(owner, owner.x + 20, owner.y + 15, 35, dt);
      const foot = g.possessionPosition(owner), blend = 1 - Math.exp(-dt * 18);
      g.ball.x += (foot.x - g.ball.x) * blend; g.ball.y += (foot.y - g.ball.y) * blend;
      g.ball.vx = g.ball.vy = g.ball.vz = 0;
    }
    drawWorld(c) {
      if (this.finished) return;
      const scale = this.game.view.scale;
      c.save(); c.lineWidth = 2 / scale;
      if (this.target) {
        c.strokeStyle = '#d0f58d'; c.beginPath(); c.ellipse(this.target.x, this.target.y, 15 / scale, 7 / scale, 0, 0, Math.PI * 2); c.stroke();
        c.setLineDash([4 / scale, 5 / scale]); c.strokeStyle = '#d0f58d66'; c.beginPath();
        c.moveTo(this.game.player.x, this.game.player.y); c.lineTo(this.target.x, this.target.y); c.stroke(); c.setLineDash([]);
      }
      // Show the receiver's run, rather than revealing the exact future interception point.
      c.strokeStyle = '#ffb399'; c.beginPath(); c.moveTo(this.receiver.x + 22, this.receiver.y - 10); c.lineTo(this.receiver.x + 22, this.receiver.y + 25);
      c.lineTo(this.receiver.x + 16, this.receiver.y + 17); c.moveTo(this.receiver.x + 22, this.receiver.y + 25); c.lineTo(this.receiver.x + 28, this.receiver.y + 17); c.stroke();
      c.restore();
    }
    drawTiming(c) {
      if (this.finished || this.target) return;
      const g = this.game, v = g.view, p = g.player;
      const x = clamp(v.x + p.x * v.scale, 85, v.width - 85), y = clamp(v.y + p.y * v.scale + 36, 110, v.height - 30);
      c.save(); c.fillStyle = '#0b2019ee'; c.fillRect(x - 80, y - 14, 160, 28);
      c.font = 'bold 12px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#d0f58d'; c.fillText('TAP TO CUT THE PASS', x, y); c.restore();
    }
  }
  window.PassInterception = PassInterception;
})();
