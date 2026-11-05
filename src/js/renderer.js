/* Canvas presentation only: no DOM, input, controller instances or gameplay writes. */
(() => {
  'use strict';
  const Core = window.ShoparFootball.Core;
  const { State, HEIGHT_PROJECTION, BACKDROP_SHIFT, STADIUM_OFFSET, GOAL, FIELD, clamp, lerp } = Core;
  class CanvasRenderer {
    constructor(scene, drawing = null) { this.scene = scene; this.drawing = drawing || this; }
    initCrowd() {
      const crowd = [];
      const shirtColors = ['#e53935', '#1e88e5', '#fbc02d', '#ffffff', '#43a047', '#ff7043', '#8e24aa', '#00acc1', '#ff4081', '#3949ab'];
      const skinColors = ['#ffcc80', '#f5b041', '#e0ac69', '#8d5524', '#c68642'];
      const hairColors = ['#212121', '#4e342e', '#ffd54f', '#6d4c41'];
      for (let row = 0; row < 4; row++) {
        const y = 11 + row * 8.5;
        for (let x = 80; x <= 920; x += 11) {
          const seed = row * 99 + x;
          crowd.push({
            x: x + ((seed % 5) - 2), y, row,
            shirt: shirtColors[(seed * 7) % shirtColors.length],
            skin: skinColors[(seed * 3) % skinColors.length],
            hair: hairColors[(seed * 11) % hairColors.length],
            phase: (seed % 30) * 0.25
          });
        }
      }
      return crowd;
    }
    // Rendering has no gameplay side effects.
    render() {
      const c = this.scene.ctx, v = this.scene.view;
      const projection = v.projection, presentation = this.scene.presentation();
      c.setTransform(this.scene.dpr, 0, 0, this.scene.dpr, 0, 0);
      c.fillStyle = projection ? this.scene.environment.palette.outside : '#16331d'; c.fillRect(0, 0, v.width, v.height);
      c.save(); c.translate(v.x, v.y); c.scale(v.scale, v.scale);
      if (this.scene.shake > 0) c.translate(Math.sin(this.scene.time * 86) * this.scene.shake, Math.cos(this.scene.time * 73) * this.scene.shake * .55);
      this.drawing.drawPitch(c, projection); this.drawing.drawGoalBack(c);
      this.drawing.drawRunMarkers(c);
      c.save();
      if (projection) c.transform(...projection.ground);
      this.scene.drawWorld(c);
      c.restore();
      if (this.scene.state === State.AIMING && this.scene.aim?.power > .03) this.drawing.drawAim(c);
      const preview = presentation.shotPreview, aimingPath = presentation.projectedAim?.path || presentation.aimingPath;
      const groundPoint = point => projection ? projection.project({ x: point.x, y: point.y }) : point;
      if (!aimingPath && preview?.length) {
        const airborne = preview.some(p => p.z > 1);
        c.save(); c.lineWidth = 2 / v.scale;
        if (airborne) {
          c.strokeStyle = '#d0f58d66'; c.setLineDash([5 / v.scale, 5 / v.scale]); c.beginPath();
          preview.forEach((point, i) => {
            const p = groundPoint(point);
            if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y);
          }); c.stroke(); c.setLineDash([]);
          for (let i = Math.floor(preview.length / 4); i < preview.length; i += Math.max(1, Math.floor(preview.length / 4))) {
            const p = groundPoint(preview[i]), air = this.ballRenderPoint(preview[i]);
            c.strokeStyle = '#d0f58d88'; c.lineWidth = 1 / v.scale;
            c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(air.x, air.y); c.stroke();
            c.fillStyle = '#061b10aa'; c.beginPath(); c.ellipse(p.x, p.y, 7 / v.scale, 2.5 / v.scale, 0, 0, Math.PI * 2); c.fill();
            c.fillStyle = '#f7ffe9'; c.strokeStyle = '#163126'; c.beginPath();
            c.arc(air.x, air.y, 3.5 / v.scale, 0, Math.PI * 2); c.fill(); c.stroke();
          }
        }
        c.strokeStyle = '#d0f58d'; c.lineWidth = 3 / v.scale; c.beginPath();
        preview.forEach((point, i) => {
          const p = i ? this.ballRenderPoint(point) : groundPoint(point);
          if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y);
        });
        c.stroke();
        if (airborne) {
          const p = this.ballRenderPoint(preview.at(-1)); c.beginPath(); c.arc(p.x, p.y, 4 / v.scale, 0, Math.PI * 2); c.stroke();
        }
        c.restore();
      }
      this.drawing.drawTrail(c); this.drawing.drawBallShadow(c, this.scene.ball);
      const aboveGoal = this.drawing.ballAboveGoal(), held = this.scene.resolution?.kind === 'save' || presentation.ballHeld;
      if (projection) this.drawProjectedActors(c, aboveGoal, held);
      else {
        const actors = [this.scene.player, ...this.scene.mates, ...this.scene.defenders, this.scene.keeper].sort((a, b) => a.y - b.y);
        let drawn = false;
        for (const p of actors) {
          if (!aboveGoal && !held && !drawn && this.scene.ball.z < 35 && this.scene.ball.y <= p.y) { this.drawing.drawBall(c, this.scene.ball); drawn = true; }
          this.drawing.drawPlayer(c, p);
        }
        if (!aboveGoal && !drawn) this.drawing.drawBall(c, this.scene.ball);
        if (this.scene.resolution?.kind === 'goal' || this.scene.presentation().ballInNet) this.drawing.drawGoalBack(c, true);
        this.drawing.drawGoalFront(c);
      }
      if (aimingPath?.length > 1) {
        c.save(); c.lineJoin = 'round'; c.lineCap = 'round'; c.beginPath();
        aimingPath.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y));
        c.strokeStyle = '#10261bcc'; c.lineWidth = 5 / v.scale; c.stroke();
        c.strokeStyle = '#d0f58d'; c.lineWidth = 3 / v.scale; c.stroke(); c.restore();
      }
      const target = presentation.shotTarget;
      const cursor = presentation.projectedAim
        ? { ...aimingPath.at(-1), finger: presentation.projectedAim.finger } : presentation.aimCursor;
      if (target && !aimingPath) {
        const { x, y } = this.ballRenderPoint(target), radius = 8 / v.scale;
        c.save(); c.fillStyle = '#10261b99'; c.strokeStyle = '#e5ffc0bb'; c.lineWidth = 1.5 / v.scale;
        if (!cursor) {
          c.beginPath(); c.arc(x, y, radius, 0, Math.PI * 2); c.fill(); c.stroke();
          c.beginPath(); c.moveTo(x - radius * 1.5, y); c.lineTo(x + radius * 1.5, y);
          c.moveTo(x, y - radius * 1.5); c.lineTo(x, y + radius * 1.5); c.stroke();
        }
        c.font = `bold ${10 / v.scale}px Arial`; c.textBaseline = 'middle';
        const width = (target.label.length * 6 + 10) / v.scale;
        c.fillStyle = '#10261bcc'; c.fillRect(x + 14 / v.scale, y - 9 / v.scale, width, 18 / v.scale);
        c.fillStyle = '#e5ffc0'; c.fillText(target.label, x + 19 / v.scale, y); c.restore();
      }
      if (cursor) {
        const unit = 1 / v.scale;
        c.save();
        if (cursor.finger) {
          c.strokeStyle = '#e5ffc055'; c.lineWidth = unit; c.setLineDash([2 * unit, 4 * unit]);
          c.beginPath(); c.moveTo(cursor.finger.x, cursor.finger.y); c.lineTo(cursor.x, cursor.y); c.stroke(); c.setLineDash([]);
        }
        c.beginPath(); c.arc(cursor.x, cursor.y, 5 * unit, 0, Math.PI * 2);
        c.moveTo(cursor.x - 10 * unit, cursor.y); c.lineTo(cursor.x - 3 * unit, cursor.y);
        c.moveTo(cursor.x + 3 * unit, cursor.y); c.lineTo(cursor.x + 10 * unit, cursor.y);
        c.moveTo(cursor.x, cursor.y - 10 * unit); c.lineTo(cursor.x, cursor.y - 3 * unit);
        c.moveTo(cursor.x, cursor.y + 3 * unit); c.lineTo(cursor.x, cursor.y + 10 * unit);
        c.strokeStyle = '#10261bdd'; c.lineWidth = 4 * unit; c.stroke();
        c.strokeStyle = '#e5ffc0'; c.lineWidth = 1.5 * unit; c.stroke(); c.restore();
      }
      if (aboveGoal) this.drawing.drawBall(c, this.scene.ball);
      this.drawing.drawCrossingMarker(c);
      c.save();
      if (projection) c.transform(...projection.ground);
      for (const r of this.scene.ripples) {
        if (r.bounce) {
          c.strokeStyle = `rgba(255,245,210,${Math.max(0, 1 - r.age / .38) * .75})`;
          c.lineWidth = 1.5; c.beginPath();
          c.ellipse(r.x, r.y + 3, 7 + r.age * 30, 3 + r.age * 12, 0, 0, Math.PI * 2);
        } else {
          c.strokeStyle = `rgba(198,255,0,${1 - r.age})`; c.lineWidth = 2; c.beginPath();
          c.arc(r.x, r.y, 16 + r.age * 25, 0, Math.PI * 2);
        }
        c.stroke();
      }
      c.restore();
      for (const p of this.scene.particles) {
        c.save(); c.globalAlpha = Math.min(1, p.life); c.fillStyle = p.color;
        const anchor = groundPoint(p);
        c.translate(anchor.x, anchor.y); c.rotate(p.rot || p.life * 4);
        c.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * .7);
        c.restore();
      }
      this.scene.environment.drawAtmosphere(c, this.scene.time, this.scene.reducedMotion, v);
      if (this.scene.state === State.AIMING && !this.scene.aim) this.drawing.drawPossessionHint(c);
      if (this.scene.state === State.BALL_CONTACT) this.drawing.drawContact(c);
      if (this.scene.flash > 0 && !this.scene.reducedMotion) { c.fillStyle = `rgba(255,255,255,${this.scene.flash * .4})`; c.fillRect(-v.x / v.scale, -v.y / v.scale, v.width / v.scale, v.height / v.scale); }
      c.restore();
      const { shotPower: power, shotTutorial: tutorial } = presentation;
      if (power) {
        const anchor = this.ballRenderPoint(power);
        const x = clamp(v.x + anchor.x * v.scale, 54, v.width - 54);
        const y = clamp(v.y + anchor.y * v.scale - 38, 64, v.height - 38);
        c.save(); c.fillStyle = '#10261bf2'; c.fillRect(x - 50, y, 100, 28);
        c.strokeStyle = '#bad29888'; c.lineWidth = 1; c.strokeRect(x - 50, y, 100, 28);
        c.fillStyle = power.locked ? '#d0f58d' : '#fff6a0'; c.font = 'bold 10px "Courier New", monospace';
        c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText(`POWER ${Math.round(power.value * 100)}%`, x, y + 4);
        c.fillStyle = '#40554a'; c.fillRect(x - 44, y + 19, 88, 5);
        c.fillStyle = power.locked ? '#d0f58d' : '#fff6a0'; c.fillRect(x - 44, y + 19, Math.round(88 * power.value), 5); c.restore();
      }
      if (tutorial) {
        const x = v.width / 2, y = v.height < 500 ? 68 : 84;
        c.save(); c.fillStyle = '#10261bed'; c.fillRect(x - 96, y, 192, 60);
        c.font = 'bold 11px "Courier New", monospace'; c.textAlign = 'center'; c.textBaseline = 'top'; c.fillStyle = '#d0f58d';
        tutorial.forEach((line, i) => c.fillText(line, x, y + 9 + i * 16)); c.restore();
      }
      this.scene.drawOverlay(c);
      this.drawing.drawArcadeBanner(c);
    }
    drawProjectedActors(c, above, held) {
      const scene = this.scene, p = scene.view.projection;
      const layers = [scene.player, ...scene.mates, ...scene.defenders, scene.keeper];
      if (!above && !held) layers.push(scene.ball);
      layers.sort((a, b) => p.depth(a) - p.depth(b));
      const drawLayer = actor => {
        if (actor === scene.ball) this.drawing.drawBall(c, actor);
        else this.drawing.drawPlayer(c, actor);
      };
      // The goal mouth separates the net interior from actors on the pitch.
      for (const actor of layers) if (actor.y < FIELD.top) drawLayer(actor);
      this.drawing.drawGoalBack(c, true);
      this.drawing.drawGoalFront(c);
      for (const actor of layers) if (actor.y >= FIELD.top) drawLayer(actor);
      if (held && !above) this.drawing.drawBall(c, scene.ball);
    }
    ballAboveGoal() {
      return this.scene.resolution?.kind === 'high' || this.scene.ball.z - this.scene.geometry.ballGeometry(this.scene.ball).radius / HEIGHT_PROJECTION > FIELD.crossbar;
    }
    drawCrossingMarker(c) {
      const r = this.scene.resolution;
      if (!r || !['goal', 'bar', 'post'].includes(r.kind) || r.elapsed > 1.2) return;
      const scale = this.scene.view.scale, p = r.crossing, color = r.kind === 'goal' ? '#d0f69a' : '#ffca70';
      const anchor = this.ballRenderPoint(p);
      c.save(); c.translate(anchor.x, anchor.y);
      c.globalAlpha = clamp(1.4 - r.elapsed, 0, .9); c.strokeStyle = color; c.lineWidth = 2 / scale;
      c.beginPath(); c.arc(0, 0, (10 + Math.min(r.elapsed, .4) * 12) / scale, 0, Math.PI * 2); c.stroke();
      c.fillStyle = color; c.font = `bold ${12 / scale}px Arial`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(r.kind === 'goal' ? '✓' : '×', 0, 0); c.restore();
    }
    drawStadium(c, projection) {
      // --- Retro Tribün / Taraftarlar (New Star Soccer Crowd) ---
      c.save();
      if (projection) {
        const rear = -32;
        c.transform(...projection.upright(0, rear));
        c.translate(0, -80);
      } else c.translate(0, STADIUM_OFFSET);
      c.fillStyle = '#1e3324'; c.fillRect(70, 6, 860, 10);
      c.fillStyle = '#27402f'; c.fillRect(70, 16, 860, 10);
      c.fillStyle = '#304e39'; c.fillRect(70, 26, 860, 10);
      c.fillStyle = '#395b43'; c.fillRect(70, 36, 860, 10);
      c.fillStyle = '#b0bec5'; c.fillRect(70, 46, 860, 2); // Tribün parmaklığı

      const excited = this.scene.excited;
      for (const fan of this.scene.crowd) {
        const hop = excited ? -Math.abs(Math.sin(this.scene.time * 14 + fan.phase)) * 6 : Math.sin(this.scene.time * 2.5 + fan.phase) * 1.2;
        // Saç & Kafa
        c.fillStyle = fan.hair; c.fillRect(fan.x - 2, fan.y - 6 + hop, 5, 3);
        c.fillStyle = fan.skin; c.fillRect(fan.x - 2, fan.y - 3 + hop, 5, 3);
        // Gövde
        c.fillStyle = fan.shirt; c.fillRect(fan.x - 3, fan.y + hop, 7, 5);
        if (excited) {
          c.fillStyle = fan.shirt; c.fillRect(fan.x - 5, fan.y - 4 + hop, 2, 5); c.fillRect(fan.x + 4, fan.y - 4 + hop, 2, 5);
          c.fillStyle = fan.skin; c.fillRect(fan.x - 5, fan.y - 6 + hop, 2, 2); c.fillRect(fan.x + 4, fan.y - 6 + hop, 2, 2);
        }
      }

      // --- Retro Reklam Panoları (Pitchside Boards) ---
      // Sol üst reklam 1
      c.fillStyle = '#d32f2f'; c.fillRect(76, 50, 154, 30);
      c.fillStyle = '#ffffff'; c.font = '900 10px Impact, sans-serif'; c.textAlign = 'center';
      c.fillText('★ NEW STAR ★', 153, 69);
      // Sol üst reklam 2
      c.fillStyle = '#fbc02d'; c.fillRect(234, 50, 158, 30);
      c.fillStyle = '#212121'; c.font = '900 10px Impact, sans-serif';
      c.fillText('ARCADE SOCCER', 313, 69);
      // Sağ üst reklam 1
      c.fillStyle = '#1976d2'; c.fillRect(608, 50, 154, 30);
      c.fillStyle = '#ffffff'; c.font = '900 10px Impact, sans-serif';
      c.fillText('SHOPAR FC', 685, 69);
      // Sağ üst reklam 2
      c.fillStyle = '#00bfa5'; c.fillRect(766, 50, 158, 30);
      c.fillStyle = '#004d40'; c.font = '900 10px Impact, sans-serif';
      c.fillText('POWER STRIKE', 845, 69);
      c.restore();

      // Yan panolar
      c.save();
      if (projection) c.transform(...projection.ground);
      c.fillStyle = '#263238'; c.fillRect(52, 84, 20, 600); c.fillRect(928, 84, 20, 600);
      for (let y = 90; y < 680; y += 60) {
        c.fillStyle = ((y / 60) % 2) ? '#e53935' : '#fdd835'; c.fillRect(54, y, 16, 24);
        c.fillStyle = ((y / 60) % 2) ? '#1e88e5' : '#43a047'; c.fillRect(930, y, 16, 24);
      }
      c.restore();
    }
    drawPitch(c, projection) {
      const env = this.scene.environment;
      if (projection) {
        c.save(); c.transform(...projection.ground); env.drawRunoff(c); c.restore();
        if (env.pitch === 'stadium') this.drawStadium(c, projection);
        else env.drawSurroundings(c, BACKDROP_SHIFT, projection);
        c.save(); c.transform(...projection.ground);
      } else {
        c.fillStyle = env.palette.outside; c.fillRect(-4000, -4000, 8000, 8000);
        env.drawRunoff(c);
        if (env.pitch === 'stadium') this.drawing.drawStadium(c);
        else env.drawSurroundings(c, BACKDROP_SHIFT);
      }
      env.drawSurface(c);

      // --- Saha Çizgileri (Parlak Tebeşir) ---
      c.strokeStyle = env.palette.line; c.lineWidth = 2.5; c.strokeRect(76, 84, 848, 600);
      c.strokeRect(280, 84, 440, 180); // Ceza sahası
      c.strokeRect(386, 84, 228, 68);  // Altıpas
      c.beginPath(); c.arc(500, 210, 88, .65, Math.PI - .65); c.stroke(); // Ceza yayı
      c.beginPath(); c.arc(500, 210, 3.5, 0, Math.PI * 2); c.fillStyle = env.palette.line; c.fill(); // Penaltı noktası
      c.beginPath(); c.moveTo(76, 619); c.lineTo(924, 619); c.stroke(); // Orta saha çizgisi
      c.beginPath(); c.arc(500, 619, 95, 0, Math.PI * 2); c.stroke(); // Orta saha dairesi
      c.beginPath(); c.arc(500, 619, 3.5, 0, Math.PI * 2); c.fill();
      for (const x of [76, 924]) { c.beginPath(); c.arc(x, 84, 15, x === 76 ? 0 : Math.PI / 2, x === 76 ? Math.PI / 2 : Math.PI); c.stroke(); }

      // Köşe bayrakları (rüzgarda hafif sallanan üçgen bayrak)
      const flagWave = Math.sin(this.scene.time * 6) * 3;
      if (projection) c.restore();
      for (const x of env.pitch === 'street' ? [] : [76, 924]) {
        c.save();
        if (projection) {
          c.transform(...projection.upright(x, FIELD.top));
          c.translate(-x, -FIELD.top);
        }
        c.strokeStyle = '#cfd8dc'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, 82); c.lineTo(x, 60); c.stroke();
        c.fillStyle = '#ffeb3b'; c.beginPath();
        c.moveTo(x, 60); c.lineTo(x + (x === 76 ? 13 : -13) + flagWave, 65); c.lineTo(x, 71); c.fill(); c.restore();
      }
    }
    goalRenderCorners() {
      const projection = this.scene.view.projection;
      if (projection) return Core.goalCorners().map(point => {
        const { x, y } = projection.project(point);
        return [x, y];
      });
      const g = this.scene.geometry.goalGeometry();
      return [[g.left, g.top], [g.right, g.top], [g.left, g.bottom], [g.right, g.bottom],
        [g.left + g.inset, g.backTop], [g.right - g.inset, g.backTop],
        [g.left + g.inset, g.backBottom], [g.right - g.inset, g.backBottom]];
    }
    drawGoalBack(c, roofOnly = false) {
      const [frontTL, frontTR, frontBL, frontBR, backTL, backTR, backBL, backBR] = this.goalRenderCorners();
      const projection = this.scene.view.projection;
      const impact = this.scene.resolution?.netImpact;
      const age = impact ? this.scene.time - impact.time : Infinity;
      const amplitude = projection && !this.scene.reducedMotion && age >= 0 && age < .45
        ? 4 * impact.strength * Math.sin(age * 24) * (1 - age / .45) ** 2 : 0;
      const corners = projection && Core.goalCorners();
      const panel = (points, columns, rows, fill, surface, indices) => {
        c.save(); c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath();
        c.fillStyle = fill; c.fill(); c.clip(); c.strokeStyle = 'rgba(235,247,235,.48)'; c.lineWidth = .85;
        const active = amplitude && impact.surface === surface;
        const world = active && indices.map(index => corners[index]);
        const sample = (u, v) => {
          const point = {};
          for (const axis of ['x', 'y', 'z']) {
            point[axis] = lerp(lerp(world[0][axis], world[1][axis], u), lerp(world[3][axis], world[2][axis], u), v);
          }
          const distance = Math.hypot(point.x - impact.x, point.y - impact.y, (point.z - impact.z) * HEIGHT_PROJECTION);
          const edge = Math.min(1, u * 8, (1 - u) * 8, v * 6, (1 - v) * 6);
          const wave = amplitude * edge * Math.exp(-((distance / 24) ** 2));
          if (surface === 'back') point.y -= wave;
          else if (surface === 'roof') point.z += wave / HEIGHT_PROJECTION;
          else point.x += surface === 'left' ? -wave : wave;
          const { x, y } = projection.project(point);
          return [x, y];
        };
        const between = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
        const strand = (a, b, t, vertical) => {
          c.beginPath(); c.moveTo(...a);
          if (active) {
            for (let i = 1; i < 16; i++) c.lineTo(...(vertical ? sample(t, i / 16) : sample(i / 16, t)));
          }
          c.lineTo(...b); c.stroke();
        };
        for (let i = 0; i <= columns; i++) {
          const t = i / columns;
          strand(between(points[0], points[1], t), between(points[3], points[2], t), t, true);
        }
        for (let i = 0; i <= rows; i++) {
          const t = i / rows;
          strand(between(points[0], points[3], t), between(points[1], points[2], t), t, false);
        }
        c.restore();
      };
      if (roofOnly) {
        panel([backTL, backTR, frontTR, frontTL], 22, 3, 'rgba(230,246,232,.16)', 'roof', [4, 5, 1, 0]);
        if (this.scene.view.projection) panel([frontTR, backTR, backBR, frontBR], 3, 7, 'rgba(141,180,154,.18)', 'right', [1, 5, 7, 3]);
        return;
      }
      c.save();
      c.fillStyle = 'rgba(8,27,14,.28)'; c.beginPath(); c.moveTo(...backBL); c.lineTo(...backBR); c.lineTo(...frontBR); c.lineTo(...frontBL); c.closePath(); c.fill();
      panel([backTL, backTR, backBR, backBL], 22, 7, 'rgba(220,243,224,.06)', 'back', [4, 5, 7, 6]);
      if (!this.scene.view.projection) panel([backTL, backTR, frontTR, frontTL], 22, 3, 'rgba(230,246,232,.08)');
      panel([backTL, frontTL, frontBL, backBL], 3, 7, 'rgba(225,245,228,.05)', 'left', [4, 0, 2, 6]);
      if (!this.scene.view.projection) panel([frontTR, backTR, backBR, frontBR], 3, 7, 'rgba(225,245,228,.05)');
      c.strokeStyle = '#b8cec0'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(...frontTL); c.lineTo(...backTL); c.lineTo(...backTR); c.lineTo(...frontTR);
      c.moveTo(...backTL); c.lineTo(...backBL); c.lineTo(...frontBL); c.moveTo(...backTR); c.lineTo(...backBR); c.lineTo(...frontBR); c.stroke();
      if (this.scene.view.projection) {
        // Rear tubing stays darker than the mouth; roof rails catch the light.
        c.strokeStyle = '#edf4e8'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(...frontTL); c.lineTo(...backTL); c.lineTo(...backTR); c.lineTo(...frontTR); c.stroke();
        c.strokeStyle = '#789583'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(...backBL); c.lineTo(...backBR); c.stroke();
      }
      c.restore();
    }
    drawGoalFront(c) {
      const [tl, tr, bl, br] = this.goalRenderCorners();
      const stroke = (points, offset) => {
        c.beginPath();
        points.forEach(([x, y], i) => i ? c.lineTo(x + offset, y + offset) : c.moveTo(x + offset, y + offset));
        c.stroke();
      };
      c.save(); c.lineCap = 'round';
      c.strokeStyle = '#6e8877'; c.lineWidth = GOAL.postWidth + 2; stroke([bl, tl, tr, br], 1);
      c.strokeStyle = '#ffffff'; c.lineWidth = GOAL.postWidth; stroke([bl, tl, tr, br], 0);
      c.strokeStyle = '#e0ede1'; c.lineWidth = 1;
      if (this.scene.view.projection) stroke([bl, tl, tr], -1);
      else {
        c.beginPath(); c.moveTo(bl[0] - 1, bl[1]); c.lineTo(tl[0] - 1, tl[1] - 1);
        c.lineTo(tr[0], tr[1] - 1); c.stroke();
      }
      c.restore();
    }
    drawRunMarkers(c) {
      const markers = this.scene.presentation().runMarkers;
      if (!markers) return;
      const projection = this.scene.view.projection, scale = this.scene.view.scale;
      const labels = [];
      c.save();
      if (projection) c.transform(...projection.ground);
      if (markers.incoming) {
        const incoming = markers.incoming, t = incoming.suggested; c.save(); c.strokeStyle = '#c6ff00'; c.lineWidth = 2; c.setLineDash([5, 5]);
        c.beginPath(); c.moveTo(incoming.from.x, incoming.from.y); c.lineTo(incoming.to.x, incoming.to.y); c.stroke(); c.setLineDash([]);
        c.beginPath(); c.arc(t.x, t.y, 28 + Math.sin(this.scene.time * 5) * 4, 0, Math.PI * 2); c.stroke(); c.fillStyle = 'rgba(198,255,0,0.18)'; c.fill();
        labels.push({ text: 'MEET THE PASS', color: '#ffff00', point: { x: t.x, y: t.y - 42 }, size: Math.max(12, 11 / scale) });
        if (incoming.route) { c.strokeStyle = '#76ff03'; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(incoming.route.from.x, incoming.route.from.y); c.lineTo(incoming.route.to.x, incoming.route.to.y); c.stroke(); }
        c.restore();
      } else {
        for (const marker of markers.receivers) {
          const tx = marker.x, ty = marker.y;
          c.save(); c.strokeStyle = '#00e676'; c.lineWidth = 2; c.setLineDash([4, 5]); c.beginPath(); c.arc(tx, ty, 28, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
          if (marker.route) { c.beginPath(); c.moveTo(marker.route.from.x, marker.route.from.y); c.lineTo(marker.route.to.x, marker.route.to.y); c.stroke(); }
          labels.push({ text: 'INTO SPACE', color: '#69f0ae', point: { x: tx, y: ty - 38 }, size: Math.max(11, 10 / scale) }); c.restore();
        }
      }
      c.restore();
      c.save(); c.textAlign = 'center';
      for (const label of labels) {
        const point = projection ? projection.project(label.point) : label.point;
        c.font = `900 ${label.size}px Impact, sans-serif`;
        c.fillStyle = label.color;
        c.fillText(label.text, point.x, point.y);
      }
      c.restore();
    }
    drawPlayer(c, p) {
      const pose = this.scene.actorPose(p), isControlled = pose.controlled, moving = pose.moving;
      const isShooting = pose.kicking, celebration = pose.celebrating, hop = pose.hop, stride = pose.stride;
      const tackling = pose.tackling;
      if (pose.hidden) return;

      c.save();
      const projection = this.scene.view.projection, scale = this.scene.geometry.playerScale(p);
      // Limit the visual trial to the original outfield player, even after a pass.
      const threeQuarter = !!projection && p === this.scene.player && p.team !== 'keeper';
      if (projection) {
        c.save(); c.transform(...projection.ground);
        c.fillStyle = 'rgba(10,32,18,0.45)';
        c.beginPath(); c.ellipse(p.x, p.y + 10 * scale, 11 * scale, (threeQuarter ? 8 : 5) * scale, 0, 0, Math.PI * 2); c.fill();
        c.restore();
        // Explicit keeper hands use the same vertical plane as glove contact.
        const footOffset = pose.keeperHands ? 0 : 10 * scale;
        c.transform(...projection.upright(p.x, p.y + footOffset));
        c.translate(0, hop - footOffset);
      } else c.translate(p.x, p.y + hop);
      c.scale(scale, scale);
      if (pose.tackling || pose.stumbling) c.rotate(pose.lean);

      // 1. Zemin Gölgelendirmesi
      if (!projection) {
        c.fillStyle = 'rgba(10,32,18,0.45)';
        c.beginPath(); c.ellipse(0, 10 - hop * 0.3, 11, 5, 0, 0, Math.PI * 2); c.fill();
      }

      // Kaleci plonjon rotasyonu
      if (pose.diving) {
        c.rotate(pose.diveLean);
      }

      // Renk paleti
      let shirtMain, shirtDark, shortColor, sockColor;
      const skinColor = '#f5b078';
      const hairColor = p.number === 9 ? '#fbc02d' : p.number % 2 === 0 ? '#4e342e' : '#212121';

      if (p.team === 'blue') {
        shirtMain = '#1e88e5'; shirtDark = '#1565c0'; shortColor = '#ffffff'; sockColor = '#1e88e5';
      } else if (p.team === 'red') {
        shirtMain = '#e53935'; shirtDark = '#c62828'; shortColor = '#212121'; sockColor = '#e53935';
      } else { // keeper
        shirtMain = '#c6ff00'; shirtDark = '#aeea00'; shortColor = '#212121'; sockColor = '#212121';
      }

      if (threeQuarter) {
        // Depth edges use the pitch basis expressed in this upright local frame.
        const depthX = projection.ground[2] / projection.ground[0];
        const depthY = projection.ground[3] - projection.ground[1] * depthX;
        const face = (points, color) => {
          c.fillStyle = color; c.beginPath();
          points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
          c.closePath(); c.fill();
        };
        const block = (x, y, width, height, depth, main, side, top) => {
          const dx = -depth * depthX, dy = -depth * depthY;
          face([[x, y], [x + dx, y + dy], [x + width + dx, y + dy], [x + width, y]], top);
          face([[x + width, y], [x + width + dx, y + dy], [x + width + dx, y + height + dy], [x + width, y + height]], side);
          c.fillStyle = main; c.fillRect(x, y, width, height);
        };
        const left = isShooting ? -stride * 1.5 : stride;
        const right = tackling ? 12 : isShooting ? 6 : -stride;
        for (const [x, step] of [[2, right], [-6, left]]) {
          block(x, 2 + step, 4, 6, 3, sockColor, shirtDark, '#e5eff3');
          block(x, 8 + step, 4, 3, 6, '#151d22', '#38434b', '#4b5860');
          c.fillStyle = '#e3e9df'; c.fillRect(x, 10 + step, 4, 1);
        }
        // The far arm sits behind the torso; existing stride and celebration drive both arms.
        const armFar = celebration ? -22 : -14 + (moving ? stride * .8 : 0);
        const armNear = celebration ? -22 : -14 - (moving ? stride * .8 : 0);
        block(6, armFar, 3, 8, 3, shirtDark, shirtDark, shirtMain);
        block(6, celebration ? -25 : armFar + 8, 3, 3, 2, '#d58b5b', '#bf764e', skinColor);
        block(-7, -4, 13, 7, 5, shortColor, '#b1bdc4', '#f2f5ee');
        c.fillStyle = 'rgba(0,0,0,.22)'; c.fillRect(-1, 0, 2, 3);
        block(-8, -15, 14, 12, 6, shirtMain, shirtDark, '#53a6eb');
        c.fillStyle = '#e8f1eb'; c.fillRect(-3, -15, 5, 1.5);
        c.font = 'bold 7px monospace'; c.textAlign = 'center'; c.fillText(String(p.number), -1, -7);
        block(-10, armNear, 3, 8, 3, shirtMain, shirtDark, '#53a6eb');
        block(-10, celebration ? -25 : armNear + 8, 3, 3, 2, skinColor, '#d58b5b', '#ffd09a');
        block(-5, -23, 9, 8, 5, skinColor, '#d58b5b', '#ffd09a');
        // Back three-quarter head: visible crown and one ear, facing upfield.
        block(-5.5, -26, 10, 5, 5, hairColor, '#b28a35', '#ffe078');
        c.fillStyle = skinColor; c.fillRect(3, -21, 2, 3);
      } else {
        // 2. Bacaklar & Kramponlar (16-bit Pixel Art)
        const legL_stride = isShooting ? -stride * 1.5 : stride;
        const legR_stride = tackling ? 12 : isShooting ? 6 : -stride;

        // Çoraplar
        c.fillStyle = sockColor;
        c.fillRect(-6, 2 + legL_stride, 4, 6);
        c.fillRect(2, 2 + legR_stride, 4, 6);
        c.fillStyle = '#ffffff'; // üst beyaz şerit
        c.fillRect(-6, 2 + legL_stride, 4, 1.5);
        c.fillRect(2, 2 + legR_stride, 4, 1.5);

        // Kramponlar (siyah krampon + beyaz taban)
        c.fillStyle = '#111111';
        c.fillRect(-6, 8 + legL_stride, 4, 3);
        c.fillRect(2, 8 + legR_stride, 4, 3);
        c.fillStyle = '#ffffff';
        c.fillRect(-6, 10 + legL_stride, 4, 1);
        c.fillRect(2, 10 + legR_stride, 4, 1);

        // 3. Şort
        c.fillStyle = shortColor;
        c.fillRect(-7, -4, 14, 7);
        c.fillStyle = 'rgba(0,0,0,0.22)';
        c.fillRect(-1, -1, 2, 4);

        // 4. Forma / Gövde
        c.fillStyle = shirtMain;
        c.fillRect(-8, -15, 16, 12);
        c.fillStyle = shirtDark;
        c.fillRect(-8, -15, 2.5, 12);
        c.fillRect(5.5, -15, 2.5, 12);
        c.fillStyle = '#ffffff'; // Yaka
        c.fillRect(-3, -15, 6, 2);

        // Sırt Numarası
        c.fillStyle = p.team === 'keeper' ? '#212121' : '#ffffff';
        c.font = 'bold 7px monospace'; c.textAlign = 'center';
        c.fillText(String(p.number), 0, -7);

        // 5. Kollar & Eller
        if (celebration) {
          c.fillStyle = shirtMain;
          c.fillRect(-11, -22, 3, 9); c.fillRect(8, -22, 3, 9);
          c.fillStyle = skinColor;
          c.fillRect(-11, -24, 3, 3); c.fillRect(8, -24, 3, 3);
        } else if (pose.keeperHands) {
          for (const hand of pose.keeperHands) {
            c.strokeStyle = shirtMain; c.lineWidth = 4; c.beginPath(); c.moveTo(0, -12); c.lineTo(hand.x, hand.y); c.stroke();
            c.fillStyle = '#ffffff'; c.fillRect(hand.x - 2.5, hand.y - 2.5, 5, 5);
          }
        } else if (pose.diving) {
          c.fillStyle = shirtMain;
          c.fillRect(-12, -18, 4, 10); c.fillRect(8, -18, 4, 10);
          c.fillStyle = '#ffffff'; // Kaleci beyaz eldivenleri
          c.fillRect(-13, -22, 5, 5); c.fillRect(8, -22, 5, 5);
        } else if (pose.holdingBall) {
          c.fillStyle = shirtMain; c.fillRect(-11, -13, 7, 5); c.fillRect(4, -13, 7, 5);
          c.fillStyle = '#ffffff'; c.fillRect(-6, -12, 5, 5); c.fillRect(1, -12, 5, 5);
        } else if (p.team === 'keeper') {
          // A wider ready stance makes the keeper's coverage readable in the goalmouth.
          c.fillStyle = shirtMain;
          c.fillRect(-14, -14, 6, 4); c.fillRect(8, -14, 6, 4);
          c.fillRect(-17, -18, 4, 7); c.fillRect(13, -18, 4, 7);
          c.fillStyle = '#ffffff';
          c.fillRect(-18, -22, 5, 5); c.fillRect(13, -22, 5, 5);
        } else {
          const armL = moving ? -stride * 0.8 : 0;
          const armR = moving ? stride * 0.8 : 0;
          c.fillStyle = shirtMain;
          c.fillRect(-10, -14 + armL, 3, 8); c.fillRect(7, -14 + armR, 3, 8);
          c.fillStyle = p.team === 'keeper' ? '#ffffff' : skinColor;
          c.fillRect(-10, -6 + armL, 3, 3); c.fillRect(7, -6 + armR, 3, 3);
        }

        // 6. Kafa & Saç
        c.fillStyle = skinColor;
        c.fillRect(-5, -23, 10, 8);
        c.fillStyle = '#212121'; // Gözler
        c.fillRect(-3, -20, 2, 2); c.fillRect(1, -20, 2, 2);
        c.fillStyle = hairColor;
        c.fillRect(-6, -26, 12, 4); c.fillRect(-6, -23, 2, 3); c.fillRect(4, -23, 2, 3);

      }

      // 7. Kontrol İşaretçisi (NSS Tarzı Yanıp Sönen Sarı Ok)
      if (isControlled) {
        const bounce = Math.sin(this.scene.time * 7) * 3.5;
        c.fillStyle = '#ffeb3b';
        c.beginPath(); c.moveTo(0, -33 + bounce); c.lineTo(-6, -42 + bounce); c.lineTo(6, -42 + bounce); c.closePath(); c.fill();
        c.strokeStyle = '#f57f17'; c.lineWidth = 1; c.stroke();
        c.strokeStyle = '#c6ff00'; c.lineWidth = 2; c.setLineDash([4, 3]);
        c.beginPath(); c.ellipse(0, 10, 16, 8, 0, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
      }

      c.restore();
    }
    drawBallShadow(c, b) {
      if (this.scene.resolution?.kind === 'save' || this.scene.presentation().ballHeld) return;
      const geometry = this.scene.geometry.ballGeometry(b);
      const baseR = geometry.groundRadius, height = geometry.height;
      const projection = this.scene.view.projection;
      c.save();

      // 1. Yerdeki gölge (NSS tarzı yükseldikçe küçülen ve solan gölge)
      const shadowScale = Math.max(0.32, 1 - b.z * 0.0035);
      const shadowAlpha = Math.max(0.24, 0.5 / (1 + b.z * 0.008));
      c.fillStyle = `rgba(10,32,16,${shadowAlpha})`;
      c.beginPath();
      c.save();
      if (projection) c.transform(...projection.ground);
      c.ellipse(b.x + 2, b.y + 4, baseR * 1.15 * shadowScale, baseR * 0.5 * shadowScale, 0, 0, Math.PI * 2);
      c.fill();

      c.restore();
      // Havalandığında yükseklik kılavuz çizgisi
      if (b.z > 8) {
        c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = Math.max(1.1, .8 / this.scene.view.scale); c.setLineDash([3, 5]);
        const ground = projection ? projection.project({ x: b.x, y: b.y }) : b;
        const air = this.ballRenderPoint(b, height);
        c.beginPath(); c.moveTo(ground.x, ground.y); c.lineTo(air.x, air.y); c.stroke(); c.setLineDash([]);
      }
      c.restore();
    }
    ballRenderPoint(ball, height = (ball.z || 0) * HEIGHT_PROJECTION) {
      const projection = this.scene.view.projection;
      return projection ? projection.project(ball) : { x: ball.x, y: ball.y - height };
    }
    drawBall(c, b) {
      const geometry = this.scene.geometry.ballGeometry(b), visualR = geometry.radius;
      const point = this.ballRenderPoint(b, geometry.height);
      c.save();
      if ([State.BALL_IN_MOTION, State.INTERCEPTION].includes(this.scene.state)) {
        c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 1 / this.scene.view.scale;
        c.beginPath(); c.arc(point.x, point.y, visualR + 2 / this.scene.view.scale, 0, Math.PI * 2); c.stroke();
      }
      // 2. Topun Kendisi (Telstar Klasik 32 Panel)
      c.translate(point.x, point.y);
      c.rotate(b.rotation);

      const sphereGrad = c.createRadialGradient(-visualR * 0.3, -visualR * 0.3, visualR * 0.05, 0, 0, visualR);
      sphereGrad.addColorStop(0, '#ffffff'); sphereGrad.addColorStop(0.7, '#f5f5f5'); sphereGrad.addColorStop(1, '#bdbdbd');
      c.fillStyle = sphereGrad; c.beginPath(); c.arc(0, 0, visualR, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#37474f'; c.lineWidth = .65; c.stroke();

      // Siyah deri beşgen paneller
      c.fillStyle = '#212121';
      this.drawing.polygon(c, 0, 0, visualR * 0.38, 5, -Math.PI / 2); c.fill();
      for (let i = 0; i < 5; i++) {
        const angle = i * Math.PI * 2 / 5 - Math.PI / 2;
        c.beginPath();
        c.arc(Math.cos(angle) * visualR * 0.88, Math.sin(angle) * visualR * 0.88, visualR * 0.22, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = '#757575'; c.lineWidth = 0.45;
        c.beginPath();
        c.moveTo(Math.cos(angle) * visualR * 0.35, Math.sin(angle) * visualR * 0.35);
        c.lineTo(Math.cos(angle) * visualR * 0.72, Math.sin(angle) * visualR * 0.72);
        c.stroke();
      }

      c.restore();
    }
    polygon(c, x, y, r, sides, rotation = 0) { c.beginPath(); for (let i = 0; i < sides; i++) { const a = rotation + i * Math.PI * 2 / sides; i ? c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } c.closePath(); }
    drawTrail(c) {
      if (this.scene.trail.length < 2) return;
      c.save(); c.lineCap = 'round';
      for (let i = 1; i < this.scene.trail.length; i++) {
        const a = this.scene.trail[i - 1], b = this.scene.trail[i], alpha = (i / this.scene.trail.length) * .4 * Math.max(0, 1 - b.age / 1.4);
        c.strokeStyle = `rgba(255,255,235,${alpha * 1.8})`;
        // A trail must not be wider than the small on-field ball it follows.
        c.lineWidth = this.scene.geometry.ballGeometry(b).groundRadius * (.18 + i / this.scene.trail.length * .55);
        const from = this.ballRenderPoint(a), to = this.ballRenderPoint(b);
        c.beginPath(); c.moveTo(from.x, from.y); c.lineTo(to.x, to.y); c.stroke();
      } c.restore();
    }
    drawAim(c) {
      const a = this.scene.aim;
      if (!a || a.power < .02) return;

      const p = a.power; // 0.0 - 1.0
      const bx = this.scene.ball.x, by = this.scene.ball.y;
      const angle = Math.atan2(a.dy, a.dx), projection = this.scene.view.projection;

      c.save();
      if (projection) c.transform(...projection.ground);

      // 1. Gerideki Sapan Lastik Çekme Hattı (Slingshot Elastic Pull)
      const pull = a.distance * Math.min(1, this.scene.geometry.maxDrag() / (a.screenDistance ?? a.distance));
      const pullX = bx - a.dx * pull;
      const pullY = by - a.dy * pull;

      // Lastik ipi
      c.strokeStyle = 'rgba(255, 235, 59, 0.45)';
      c.lineWidth = 3;
      c.setLineDash([4, 4]);
      c.beginPath();
      c.moveTo(bx, by);
      c.lineTo(pullX, pullY);
      c.stroke();
      c.setLineDash([]);

      // Çekilen parmak dokunma noktası (Retro halka)
      c.fillStyle = 'rgba(255, 235, 59, 0.25)';
      c.beginPath(); c.arc(pullX, pullY, 14, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#ffeb3b';
      c.lineWidth = 2;
      c.beginPath(); c.arc(pullX, pullY, 8, 0, Math.PI * 2); c.stroke();

      // 2. NSS Tarzı Güce Göre Dinamik Büyüyen Kick Power Oku
      // Düşük güçte kısa ve ince, güç arttıkça sahada devasa uzayan ve kalınlaşan ok!
      const minLen = 48, maxLen = 220;
      const totalLen = minLen + p * (maxLen - minLen);

      const shaftW = 10 + p * 20;        // Gövde kalınlığı (10px -> 30px)
      const headLen = 22 + p * 28;      // Ok başı uzunluğu
      const headW = shaftW * 2.3 + 4;   // Ok başı genişliği (kanatlar)
      const startX = 13;                // Topun dışından başlama mesafesi
      const headBaseX = startX + totalLen - headLen;
      const tipX = startX + totalLen;

      c.save();
      c.translate(bx, by);
      c.rotate(angle);

      // Ok Poligonu (Gövde + Üçgen Ok Başı)
      c.beginPath();
      c.moveTo(startX, -shaftW / 2);
      c.lineTo(headBaseX, -shaftW / 2);
      c.lineTo(headBaseX, -headW / 2);
      c.lineTo(tipX, 0);                 // Okun en uç noktası
      c.lineTo(headBaseX, headW / 2);
      c.lineTo(headBaseX, shaftW / 2);
      c.lineTo(startX, shaftW / 2);
      c.closePath();

      // Dış 3D Zemin Gölgesi
      c.save();
      c.shadowColor = 'rgba(0, 0, 0, 0.55)';
      c.shadowBlur = 6;
      c.shadowOffsetY = 4;

      // Ok İç Gradyanı (NSS Canlı Güç Renkleri: Yeşil -> Sarı -> Turuncu -> Alev Kırmızı)
      const arrowGrad = c.createLinearGradient(startX, 0, tipX, 0);
      if (p < 0.40) {
        arrowGrad.addColorStop(0, '#76ff03');   // Neon yeşil
        arrowGrad.addColorStop(1, '#ffea00');   // Sarı
      } else if (p < 0.78) {
        arrowGrad.addColorStop(0, '#76ff03');
        arrowGrad.addColorStop(0.5, '#ffea00');
        arrowGrad.addColorStop(1, '#ff9100');   // Turuncu
      } else {
        arrowGrad.addColorStop(0, '#ffea00');
        arrowGrad.addColorStop(0.35, '#ff9100');
        arrowGrad.addColorStop(1, '#ff1744');   // Alev kırmızısı (Max güç!)
      }

      c.fillStyle = arrowGrad;
      c.fill();
      c.restore();

      // Kalın Siyah Retro Kontur
      c.strokeStyle = '#111111';
      c.lineWidth = 3;
      c.lineJoin = 'miter';
      c.stroke();

      // Ok Gövdesi İçi Güç Kademeleri / Segment Çizgileri (NSS Stili)
      const segmentCount = Math.max(2, Math.floor(totalLen / 24));
      c.strokeStyle = 'rgba(0, 0, 0, 0.28)';
      c.lineWidth = 2.5;
      for (let i = 1; i < segmentCount; i++) {
        const segX = startX + (i / segmentCount) * (headBaseX - startX);
        if (segX < headBaseX - 4) {
          c.beginPath();
          c.moveTo(segX - 4, -shaftW / 2 + 1);
          c.lineTo(segX + 4, 0);
          c.lineTo(segX - 4, shaftW / 2 - 1);
          c.stroke();
        }
      }

      // Ok Başı İçi Parlama (Highlight)
      c.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(headBaseX + 3, -headW / 2 + 6);
      c.lineTo(tipX - 4, 0);
      c.stroke();

      c.restore(); // Arrow rotation.
      c.restore();

      c.save();

      // 3. Okun İlerisindeki Hafif Yörünge İzi (Hedefe doğru kesik hat)
      const preview = { ...this.scene.ball, ...this.scene.physics.kickVelocity({ dx: a.dx, dy: a.dy, power: Math.max(.16, a.power) }, { x: 0, y: 0, timedOut: false }) };
      c.strokeStyle = p > 0.8 ? 'rgba(255, 23, 68, 0.55)' : 'rgba(255, 235, 59, 0.55)';
      c.lineWidth = 2;
      c.setLineDash([4, 6]);
      c.beginPath();
      const leadX = bx + a.dx * (totalLen + 18);
      const leadY = by + a.dy * (totalLen + 18);
      const lead = this.ballRenderPoint({ x: leadX, y: leadY });
      c.moveTo(lead.x, lead.y);
      for (let i = 0; i < 28; i++) {
        this.scene.physics.integrateBall(preview, .034);
        if (i > 4) {
          const point = this.ballRenderPoint(preview);
          c.lineTo(point.x, point.y);
        }
        if (preview.y < 84 || preview.x < 76 || preview.x > 924) break;
      }
      c.stroke();
      c.setLineDash([]);

      // 4. Sahada Okun Yanında Güç Yüzdesi Etiketi
      const percent = Math.round(p * 100);
      const labelDist = totalLen * 0.52;
      const sideOffset = shaftW + 18;
      const labelX = bx + a.dx * labelDist - a.dy * sideOffset;
      const labelY = by + a.dy * labelDist + a.dx * sideOffset;

      c.save();
      const label = this.ballRenderPoint({ x: labelX, y: labelY });
      c.translate(label.x, label.y);
      c.fillStyle = 'rgba(12, 18, 24, 0.9)';
      const boxW = p >= 0.95 ? 68 : 50;
      c.fillRect(-boxW / 2, -12, boxW, 24);
      c.strokeStyle = p > 0.8 ? '#ff1744' : '#ffeb3b';
      c.lineWidth = 1.5;
      c.strokeRect(-boxW / 2, -12, boxW, 24);

      c.font = `900 ${Math.max(12, 11 / this.scene.view.scale)}px Impact, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      if (p >= 0.95) {
        c.fillStyle = '#ff1744';
        c.fillText('MAX!!', 0, 0);
      } else {
        c.fillStyle = p > 0.7 ? '#ff9100' : '#ffeb3b';
        c.fillText(`${percent}%`, 0, 0);
      }
      c.restore();

      c.restore(); // ana save/restore
    }
    drawPossessionHint(c) {
      const b = this.ballRenderPoint(this.scene.ball), pulse = 1 + Math.sin(this.scene.time * 4) * .09;
      c.save(); c.strokeStyle = '#ffeb3b88'; c.lineWidth = 2; c.beginPath(); c.arc(b.x, b.y, 35 * pulse, 0, Math.PI * 2); c.stroke();
      if (this.scene.presentation().drawToShoot) { c.restore(); return; }
      c.strokeStyle = '#ffeb3b'; c.lineWidth = 2; c.beginPath(); c.moveTo(b.x, b.y + 69); c.lineTo(b.x, b.y + 86); c.lineTo(b.x - 4, b.y + 82); c.moveTo(b.x, b.y + 86); c.lineTo(b.x + 4, b.y + 82); c.stroke(); c.restore();
    }
    drawContact(c) {
      // İkonik New Star Soccer Telstar Ball Contact Ekranı
      const g = this.scene.geometry.contactGeometry(), appear = this.scene.reducedMotion ? 1 : clamp(this.scene.stateTime / .18, 0, 1), r = g.r * (.88 + appear * .12);
      c.save();
      c.fillStyle = `rgba(10,24,18,${.92 * appear})`; c.fillRect(-1000, -1000, 3000, 3000);
      c.translate(g.x, g.y);

      // Yerdeki büyük derinlik gölgesi
      c.fillStyle = 'rgba(0,10,5,0.52)'; c.beginPath(); c.ellipse(10, r + 26, r * 0.9, 18, 0, 0, Math.PI * 2); c.fill();
      // Dış parlama halkası
      c.strokeStyle = 'rgba(198,255,0,0.22)'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, r + 16, 0, Math.PI * 2); c.stroke();

      // Topun Küresi ve Deri Dokusu (3D)
      const gradient = c.createRadialGradient(-r * .35, -r * .45, 2, 0, 0, r);
      gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(.65, '#ecefdc'); gradient.addColorStop(1, '#9e9e9e');
      c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fillStyle = gradient; c.fill();

      c.save(); c.clip();
      // Merkez beşgen
      c.fillStyle = '#1e2422'; this.drawing.polygon(c, 0, 0, r * .30, 5, -Math.PI / 2); c.fill();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * Math.PI * 2 / 5, x = Math.cos(a) * r * .85, y = Math.sin(a) * r * .85;
        this.drawing.polygon(c, x, y, r * .25, 5, a + Math.PI); c.fill();
        c.strokeStyle = '#616161'; c.lineWidth = 2.2;
        c.beginPath(); c.moveTo(Math.cos(a) * r * .30, Math.sin(a) * r * .30); c.lineTo(x - Math.cos(a) * r * .20, y - Math.sin(a) * r * .20); c.stroke();
      }
      c.restore();

      c.strokeStyle = '#212121'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke();

      // Kesik Kılavuz Çizgileri
      c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 1.5; c.setLineDash([4, 6]);
      c.beginPath(); c.moveTo(-r * .82, 0); c.lineTo(r * .82, 0); c.moveTo(0, -r * .82); c.lineTo(0, r * .82); c.stroke(); c.setLineDash([]);

      // Sweet Spot Merkezi
      c.strokeStyle = 'rgba(255,235,59,0.5)'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(0, 0, r * 0.18, 0, Math.PI * 2); c.stroke();

      // Kırmızı Hedef Dürbünü (Target Reticle)
      if (this.scene.contact) {
        const cx = this.scene.contact.x * r, cy = this.scene.contact.y * r;
        const wave = this.scene.contact.age * 55;
        c.strokeStyle = `rgba(255,50,50,${Math.max(0, 1 - this.scene.contact.age * 3.5)})`; c.lineWidth = 3;
        c.beginPath(); c.arc(cx, cy, 14 + wave, 0, Math.PI * 2); c.stroke();

        c.strokeStyle = '#ff1744'; c.lineWidth = 2.5;
        c.beginPath(); c.arc(cx, cy, 11, 0, Math.PI * 2); c.stroke();
        c.beginPath();
        c.moveTo(cx - 16, cy); c.lineTo(cx - 6, cy); c.moveTo(cx + 6, cy); c.lineTo(cx + 16, cy);
        c.moveTo(cx, cy - 16); c.lineTo(cx, cy - 6); c.moveTo(cx, cy + 6); c.lineTo(cx, cy + 16);
        c.stroke();
        c.fillStyle = '#ffea00'; c.beginPath(); c.arc(cx, cy, 4.5, 0, Math.PI * 2); c.fill();
      }
      c.restore();
    }
    drawArcadeBanner(c) {
      if (!this.scene.banner) return;
      const b = this.scene.banner;
      const progress = clamp((b.max - b.time) / 0.25, 0, 1);
      const scale = progress < 1 ? 0.6 + 0.4 * Math.sin(progress * Math.PI / 2) : 1;
      const alpha = b.time < 0.3 ? b.time / 0.3 : 1;

      c.save();
      c.globalAlpha = alpha;
      const width = Math.min(420, this.scene.view.width - 24), half = width / 2;
      c.translate(this.scene.view.width / 2, Math.max(50, this.scene.view.height - 57));
      c.scale(scale, scale);

      // Banner Arka Planı (Retro Arcade Şerit)
      c.fillStyle = 'rgba(12,18,24,0.92)';
      c.fillRect(-half, -37, width, 74);
      c.fillStyle = b.color;
      c.fillRect(-half, -37, width, 3); c.fillRect(-half, 34, width, 3);

      // Ana Yazı ("GOAL!!", "SAVED!", vb.)
      c.font = `900 ${clamp(width * .085, 24, 34)}px Impact, Arial Black, sans-serif`;
      c.textAlign = 'center';
      c.fillStyle = '#000000';
      c.fillText(b.text, 3, 4);
      c.fillStyle = b.color;
      c.fillText(b.text, 0, 0);

      // Alt Başlık ("WHAT A FINISH!", "KEEPER DENIES!", vb.)
      c.font = `bold ${width < 300 ? 9 : 11}px Arial, sans-serif`;
      c.letterSpacing = '.7px';
      c.fillStyle = '#ffffff';
      c.fillText(b.sub, 0, 23);

      c.restore();
    }
  }
  // Application bridge. CanvasRenderer receives this bounded presentation surface,
  // never FootballGame or a controller instance. Getters stay live for inspection.
  function createScene(game) {
    const scene = {
      get excited() { return game.pendingResult?.kind === 'goal' || game.player.celebration > 0; },
      presentation: () => game.controllerPresentation(), actorPose: actor => game.actorPose(actor),
      drawWorld: c => game.drawHighlightWorld(c), drawOverlay: c => game.drawHighlightOverlay(c),
      geometry: Object.freeze({
        playerScale: actor => game.playerScale(actor), ballGeometry: ball => game.ballGeometry(ball), goalGeometry: () => game.goalGeometry(),
        maxDrag: () => game.maxDrag(), contactGeometry: () => game.contactGeometry()
      }),
      // Preview integration is restricted to the renderer's local ball copy.
      physics: Object.freeze({ kickVelocity: (...args) => game.kickVelocity(...args), integrateBall: (...args) => game.integrateBall(...args) })
    };
    for (const field of ['aim', 'ball', 'banner', 'contact', 'crowd', 'ctx', 'defenders', 'dpr', 'environment', 'flash', 'keeper', 'mates', 'netWobble', 'particles', 'player', 'reducedMotion', 'resolution', 'ripples', 'shake', 'state', 'stateTime', 'time', 'trail', 'view']) {
      Object.defineProperty(scene, field, { enumerable: true, get: () => game[field] });
    }
    return Object.freeze(scene);
  }
  CanvasRenderer.createScene = createScene;
  CanvasRenderer.drawMethods = Object.freeze(['ballAboveGoal', 'drawCrossingMarker', 'drawStadium', 'drawPitch', 'drawGoalBack', 'drawGoalFront', 'drawRunMarkers', 'drawPlayer', 'drawBallShadow', 'drawBall', 'polygon', 'drawTrail', 'drawAim', 'drawPossessionHint', 'drawContact', 'drawArcadeBanner']);
  window.ShoparFootball.CanvasRenderer = CanvasRenderer;
})();
