/* Win the Ball: drawn routes, moving possession, and one position-dependent tackle. */
(() => {
  'use strict';
  const RULES = Object.freeze({ duration: 7.2, runSpeed: 108, period: 1.2, windowStart: .4, windowEnd: .75, noticeRange: 82, tackleReach: 43, maxRoute: 680 });
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  class DefensiveHighlight {
    constructor(game) {
      this.game = game; this.opponent = game.defenders[0];
      this.elapsed = 0; this.phase = 'planning'; this.route = []; this.preview = [];
      this.routeIndex = 0; this.routeLength = 0; this.finished = false; this.tackle = null;
      this.trail = []; this.syncBall();
    }
    beginRoute() { this.preview = [{ x: this.game.player.x, y: this.game.player.y }]; this.routeLength = 0; }
    extendRoute(point) {
      if (!this.preview.length || this.preview.length >= 80) return;
      const last = this.preview[this.preview.length - 1];
      let next = { x: clamp(point.x, 96, 904), y: clamp(point.y, 110, 660) };
      const span = distance(last, next), remaining = RULES.maxRoute - this.routeLength;
      if (span < 7 || remaining < 1) return;
      if (span > remaining) next = { x: last.x + (next.x - last.x) * remaining / span, y: last.y + (next.y - last.y) * remaining / span };
      this.routeLength += distance(last, next); this.preview.push(next);
    }
    commitRoute() {
      if (this.preview.length < 2 || this.routeLength < 24) { this.cancelRoute(); return false; }
      this.route = this.preview.map(point => ({ ...point })); this.preview = [];
      this.routeIndex = 1; this.phase = 'running';
      this.game.toast('Get alongside · tap when green', 1.8);
      return true;
    }
    cancelRoute() { this.preview = []; this.routeLength = 0; }
    timing() {
      const player = this.game.player, opponent = this.opponent, ball = this.game.ball;
      const phase = (this.elapsed % RULES.period) / RULES.period;
      const visible = this.phase === 'running' && !this.finished && distance(player, opponent) <= RULES.noticeRange;
      const inReach = distance(player, ball) <= RULES.tackleReach;
      // Approaching from the side/front reaches the exposed ball; directly behind is shielded.
      const positioned = ((player.x - opponent.x) * 28 + (player.y - opponent.y) * 11) / Math.hypot(28, 11) >= -12;
      return { phase, visible, inReach, positioned, ready: visible && inReach && positioned && phase >= RULES.windowStart && phase <= RULES.windowEnd };
    }
    attemptTackle() {
      if (this.finished || this.phase !== 'running') return;
      const timing = this.timing();
      if (!timing.visible) { this.game.toast('Get closer', .8); return; }
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
        opponent_escaped: 'The opponent escaped. Draw a route ahead of their run and arrive sooner.'
      };
      this.game.finish(kind, details[kind]);
    }
    runRoute(dt) {
      let budget = RULES.runSpeed * dt;
      const player = this.game.player;
      while (budget > 0 && this.routeIndex < this.route.length) {
        const target = this.route[this.routeIndex], span = distance(player, target), travel = Math.min(budget, span);
        this.game.movePlayer(player, target.x, target.y, RULES.runSpeed, travel / RULES.runSpeed);
        budget -= travel;
        if (span <= travel + .001) this.routeIndex++; else break;
      }
    }
    moveOpponent(dt, escape = false) {
      const opponent = this.opponent;
      if (escape) this.game.movePlayer(opponent, opponent.x + 28, opponent.y + 11, 64, dt);
      else this.game.movePlayer(opponent, opponent.startX + this.elapsed * 28, opponent.startY + this.elapsed * 11 + Math.sin(this.elapsed * 1.6) * 5, 40, dt);
    }
    syncBall() {
      const ball = this.game.ball, opponent = this.opponent;
      const phase = (this.elapsed % RULES.period) / RULES.period;
      const lead = 8 + 12 * Math.sin(Math.PI * phase) ** 2;
      Object.assign(ball, { x: opponent.x + lead * .93, y: opponent.y + lead * .36 + 5, z: 0, vx: 0, vy: 0, vz: 0 });
    }
    update(dt) {
      const steps = Math.max(1, Math.ceil(dt * 120)), step = dt / steps;
      for (let i = 0; i < steps && !this.finished; i++) {
        this.elapsed += step; this.moveOpponent(step);
        if (this.phase === 'running') this.runRoute(step);
        this.syncBall(); this.game.ball.rotation += step * 5;
        if (this.elapsed >= RULES.duration) this.resolve('opponent_escaped');
      }
      this.trail.push({ x: this.opponent.x, y: this.opponent.y }); if (this.trail.length > 16) this.trail.shift();
      if (!this.finished) {
        const timing = this.timing();
        const hint = this.phase === 'planning' ? 'Draw a running path from the blue player, then release.' : timing.ready ? 'Tap now to tackle.' : timing.visible ? 'Get alongside and wait for green.' : 'Running along your path.';
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
      const route = this.preview.length ? this.preview : this.route;
      c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
      c.strokeStyle = '#d0f58da8'; c.lineWidth = 2 / scale; c.setLineDash([5 / scale, 5 / scale]);
      if (route.length) {
        c.beginPath(); route.forEach((point, i) => i ? c.lineTo(point.x, point.y) : c.moveTo(point.x, point.y)); c.stroke();
        const end = route[route.length - 1]; c.setLineDash([]); c.beginPath(); c.arc(end.x, end.y, 6 / scale, 0, Math.PI * 2); c.stroke();
      } else if (this.phase === 'planning') {
        c.setLineDash([]); c.beginPath(); c.arc(player.x, player.y, (22 + Math.sin(game.time * 4) * 2) / scale, 0, Math.PI * 2); c.stroke();
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
      const timing = this.timing(); if (!timing.visible) return;
      const v = this.game.view, opponent = this.opponent;
      const opponentX = v.x + opponent.x * v.scale, opponentY = v.y + opponent.y * v.scale;
      const clearance = 37 * this.game.playerScale(opponent) * v.scale + 40;
      const above = opponentY - clearance >= 100;
      const x = clamp(opponentX + (above ? 0 : 60), 38, v.width - 38), y = clamp(above ? opponentY - clearance : opponentY + 8, 80, v.height - 80), radius = 25;
      c.save(); c.translate(x, y); c.lineWidth = 5; c.lineCap = 'round';
      c.fillStyle = '#0b2019ee'; c.beginPath(); c.arc(0, 0, radius + 7, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#6c7566'; c.beginPath(); c.arc(0, 0, radius, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = '#d0f58d'; c.beginPath(); c.arc(0, 0, radius, -Math.PI / 2 + RULES.windowStart * Math.PI * 2, -Math.PI / 2 + RULES.windowEnd * Math.PI * 2); c.stroke();
      const angle = -Math.PI / 2 + timing.phase * Math.PI * 2;
      c.fillStyle = timing.ready ? '#d0f58d' : '#ffbf73'; c.beginPath(); c.arc(Math.cos(angle) * radius, Math.sin(angle) * radius, 4, 0, Math.PI * 2); c.fill();
      c.fillStyle = timing.ready ? '#d0f58d' : '#d6dfca'; c.font = 'bold 10px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(timing.ready ? 'TAP!' : !timing.inReach ? 'CLOSER' : !timing.positioned ? 'SIDE' : 'WAIT', 0, 0); c.restore();
    }
  }
  window.DefensiveHighlight = DefensiveHighlight;
})();
