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

  const { HighlightController } = window.ShoparFootball.Controllers;
  const { State } = window.ShoparFootball.Core;
  class DefensiveHighlight extends HighlightController {
    constructor(context) {
      super(context); this.opponent = context.defenders[0];
      context.memory.variant = ((context.memory.variant ?? -1) + 1) % VARIANTS.length;
      this.variant = VARIANTS[context.memory.variant];
      Object.assign(context.player, { x: this.variant.player[0], y: this.variant.player[1] });
      this.windowCycle = -1;
      this.elapsed = 0; this.phase = 'planning'; this.finished = false; this.tackle = null;
      this.trail = []; this.syncBall();
    }
    enter() { return { state: State.DEFENDING, toast: 'Hold to chase · release when green', duration: 2.4 }; }
    handleInput(input) {
      if (this.finished) return { handled: false, capture: false };
      if (input.type === 'down') { this.beginHold(); return { handled: true, capture: true }; }
      if (input.type === 'up') this.attemptTackle();
      return { handled: true, capture: false };
    }
    cancelInput() { this.cancelHold(); }
    getPresentation() {
      const timing = this.timing();
      return { ariaLabel: 'Win the Ball. Hold anywhere on the pitch to chase. Release when the ring around the ball turns green to tackle.',
        hint: this.phase === 'planning' ? 'Hold anywhere to chase. Release when green.' : timing.ready ? 'Release now!' : 'Keep holding · watch the ball.',
        hideHelp: this.finished, camera: { bounds: { left: 270, top: 240, width: 600, height: 360 }, maxScale: 1.5 } };
    }
    getActorPose(player) {
      const tackle = this.tackle;
      const tackling = player === this.context.player && tackle && tackle.elapsed < .55;
      const stumbling = player === this.opponent && tackle?.success && tackle.elapsed < .5;
      const lean = tackling ? Math.sign(tackle.target.x - tackle.from.x || 1) * Math.sin(Math.min(1, tackle.elapsed / .55) * Math.PI) * .7
        : stumbling ? -.2 * Math.sin(tackle.elapsed / .5 * Math.PI) : 0;
      return { moving: player === this.context.player ? this.phase === 'running' : player === this.opponent && (!this.finished || !tackle?.success), tackling, stumbling, lean };
    }
    beginHold() { if (!this.finished) this.phase = 'running'; }
    cancelHold() { if (!this.finished) { this.phase = 'planning'; this.windowCycle = -1; } }
    dribblePhase() { return ((this.elapsed + this.variant.offset) % this.variant.period) / this.variant.period; }
    timing() {
      const player = this.context.player, opponent = this.opponent, ball = this.context.ball;
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
      const player = this.context.player, ball = this.context.ball;
      this.tackle = { elapsed: 0, from: { x: player.x, y: player.y }, target: { x: ball.x, y: ball.y }, success: timing.ready };
      this.resolve(timing.ready ? 'ball_won' : 'missed_tackle');
    }
    resolve(kind) {
      if (this.finished) return;
      this.finished = true; this.phase = 'resolved';
      const details = {
        ball_won: 'You reached the exposed ball from a good position and timed the tackle.',
        missed_tackle: 'The tackle was mistimed or the ball was still out of reach.',
        opponent_escaped: 'Hold to chase sooner. Release when the ball ring turns green.'
      };
      this.context.complete(kind, details[kind]);
    }
    chase(dt) {
      // Approach the exposed side of the dribble, then match the moving opponent.
      const opponent = this.opponent;
      this.context.physics.movePlayer(this.context.player, opponent.x + 15, opponent.y + 32, this.variant.speed, dt);
    }
    moveOpponent(dt, escape = false) {
      const opponent = this.opponent;
      if (escape) this.context.physics.movePlayer(opponent, opponent.x + 28, opponent.y + 11, 64, dt);
      else this.context.physics.movePlayer(opponent, opponent.startX + this.elapsed * 28, opponent.startY + this.elapsed * 11 + Math.sin(this.elapsed * 1.6) * 5, 40, dt);
    }
    syncBall() {
      const ball = this.context.ball, opponent = this.opponent;
      const phase = this.dribblePhase();
      const lead = 8 + 24 * Math.sin(Math.PI * phase) ** 2;
      Object.assign(ball, { x: opponent.x + lead * .93, y: opponent.y + lead * .36 + 5, z: 0, vx: 0, vy: 0, vz: 0 });
    }
    update(dt) {
      const steps = Math.max(1, Math.ceil(dt * 120)), step = dt / steps;
      for (let i = 0; i < steps && !this.finished; i++) {
        this.elapsed += step; this.moveOpponent(step);
        if (this.phase === 'running') this.chase(step);
        this.syncBall(); this.context.ball.rotation += step * 5;
        const timing = this.timing();
        // Skip a fleeting opportunity when arriving at the very end of a dribble.
        if (timing.visible && timing.inReach && timing.positioned && timing.phase >= RULES.windowStart && (RULES.windowEnd - timing.phase) * this.variant.period >= .42) {
          this.windowCycle = Math.floor((this.elapsed + this.variant.offset) / this.variant.period);
        }
        if (this.elapsed >= RULES.duration) this.resolve('opponent_escaped');
      }
      this.trail.push({ x: this.opponent.x, y: this.opponent.y }); if (this.trail.length > 16) this.trail.shift();
    }

    updateResult(dt, resolution) {
      const game = this.context, player = game.player, tackle = this.tackle;
      resolution.elapsed += dt;
      if (tackle) {
        tackle.elapsed += dt;
        const progress = Math.min(1, tackle.elapsed / .24), ease = 1 - (1 - progress) ** 2;
        const dx = tackle.target.x - tackle.from.x, dy = tackle.target.y - tackle.from.y, span = Math.hypot(dx, dy), reach = Math.min(38, span) / Math.max(1, span);
        player.x = tackle.from.x + dx * reach * ease; player.y = tackle.from.y + dy * reach * ease;
        player.step += dt * 9;
        if (tackle.success) {
          const foot = game.geometry.possessionPosition(player), blend = Math.min(1, dt * 20);
          game.ball.x += (foot.x - game.ball.x) * blend; game.ball.y += (foot.y - game.ball.y) * blend;
          if (tackle.elapsed < .25) this.moveOpponent(dt);
        } else { this.moveOpponent(dt, true); this.syncBall(); }
      } else { this.moveOpponent(dt, true); this.syncBall(); }
      game.ball.rotation += dt * 3;
    }
    drawWorld(c) {
      if (this.finished) return;
      const game = this.context, scale = game.view.scale, player = game.player;
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
    drawOverlay(c) {
      if (this.finished) return;
      const timing = this.timing(), game = this.context, v = game.view, ball = game.ball;
      const x = v.x + ball.x * v.scale, y = v.y + ball.y * v.scale;
      const ready = timing.ready, radius = Math.max(17, game.geometry.ballGeometry(ball).radius * v.scale + 7);
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
  window.ShoparFootball.WinBallController = DefensiveHighlight;
})();

