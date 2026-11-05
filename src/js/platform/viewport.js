/* Canvas dimensions and world/screen mapping. */
(() => {
  'use strict';
  const Core = window.ShoparFootball.Core;
  const { clamp, FIELD, State, STADIUM_OFFSET, HEIGHT_PROJECTION, SPRITES } = Core;
  // One fixed camera for every device: yaw in degrees and ground compression.
  const CAMERA = Object.freeze({ yaw: 30, ground: .52 });
  // Phase 13 projection, used only to keep the previous player scale.
  const REFERENCE = window.ShoparFootball.Projection.create(20, .75);
  // Project world bounds and upright points before fitting the CSS viewport.
  function fitProjection(projection, bounds, points, width, height, maxScale = Infinity) {
    const { left, top } = bounds, right = left + bounds.width, bottom = top + bounds.height;
    const projected = [...points, { x: left, y: top }, { x: right, y: top },
      { x: right, y: bottom }, { x: left, y: bottom }].map(projection.project);
    const xs = projected.map(p => p.x), ys = projected.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const padding = 16;
    const scale = Math.min(maxScale, Math.max(1, width - 2 * padding) / (maxX - minX),
      Math.max(1, height - 2 * padding) / (maxY - minY));
    return { projection, width, height, scale, x: (width - (minX + maxX) * scale) / 2,
      y: (height - (minY + maxY) * scale) / 2 };
  }

  function worldToScreen(view, point) {
    const p = view.projection?.project(point) || { x: point.x, y: point.y - (point.z || 0) * HEIGHT_PROJECTION };
    return { x: view.x + p.x * view.scale, y: view.y + p.y * view.scale };
  }

  function fromScreen(view, point) {
    return { x: (point.x - view.x) / view.scale, y: (point.y - view.y) / view.scale };
  }

  class Viewport {
    constructor(game, definitions) {
      this.game = game; this.definitions = definitions;
      this.projection = window.ShoparFootball.Projection.create(CAMERA.yaw, CAMERA.ground);
      this.view = { scale: 1, x: 0, y: 0, width: 1000, height: 740 };
    }
    bindEvents() {
      const game = this.game;
      game.listen(window, 'resize', () => game.resize());
      if (window.visualViewport) game.listen(window.visualViewport, 'resize', () => game.resize());
    }
    prefersReducedMotion() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    observe() {
      this.resizeObserver = new ResizeObserver(() => this.game.resize());
      this.resizeObserver.observe(this.game.ui.canvasWrap);
    }
    resize(reframe = false) {
      const game = this.game;
      const rect = game.canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 3);
      if (!rect.width || !rect.height) return;
      const compact = window.matchMedia('(max-width: 1024px), (max-width: 1180px) and (max-height: 600px)').matches;
      const changed = rect.width !== this.view.width || rect.height !== this.view.height || compact !== game.compact;
      const width = Math.round(rect.width * dpr), height = Math.round(rect.height * dpr);
      if (game.canvas.width !== width) game.canvas.width = width;
      if (game.canvas.height !== height) game.canvas.height = height;
      game.dpr = dpr;
      if (!reframe && !changed && this.view.projection) return;
      if (changed && game.pointer) game.cancelPointer(game.pointer.id);
      game.compact = compact;
      const bounds = game.cameraBounds();
      const hudTop = rect.height < 500 ? 48 : 68, dragBottom = rect.height < 500 ? 48 : 72;
      const usableHeight = Math.max(80, rect.height - hudTop - dragBottom);
      const camera = game.controllerPresentation().camera;
      const maxScale = camera?.maxScale ?? Infinity;
      const actors = [game.controlled, ...game.mates, ...game.defenders];
      const points = actors.map(actor => ({
        x: actor === game.controlled ? actor.x : actor.startX,
        y: actor === game.controlled ? actor.y : actor.startY, z: SPRITES.playerHeight * Core.playerScale(actor) / HEIGHT_PROJECTION
      }));
      if (bounds.top <= FIELD.top) points.push(...Core.goalCorners());
      points.push(game.ball, ...(camera?.anchors || []));
      const preferred = { ...bounds, top: Math.max(bounds.top, FIELD.top),
        height: bounds.top + bounds.height - Math.max(bounds.top, FIELD.top) };
      const frame = (projection, cap) => {
        const fitted = fitProjection(projection, preferred, points, rect.width, usableHeight, Math.min(maxScale, cap));
        const minimumScale = .95 * Math.min(maxScale, cap, rect.width / bounds.width, usableHeight / bounds.height);
        // Let optional runoff crop before shrinking actors below the old framing scale.
        return fitted.scale < minimumScale ? Object.assign(fitted, fitProjection(projection,
          { left: game.ball.x, top: game.ball.y, width: 0, height: 0 }, points, rect.width, usableHeight, minimumScale)) : fitted;
      };
      // Players keep the Phase 13 on-screen size; the new angle never enlarges them noticeably.
      const target = frame(REFERENCE, Infinity).scale;
      const next = frame(this.projection, target * 1.05);
      if (next.scale < target * .9) {
        // Prefer clear action over the full scene: keep only what the play needs visible.
        const required = [game.ball, ...(camera?.anchors || []), points[0]];
        if (bounds.top <= FIELD.top) required.push(...Core.goalCorners().slice(0, 4));
        Object.assign(next, fitProjection(this.projection, { left: game.ball.x, top: game.ball.y, width: 0, height: 0 },
          required, rect.width, usableHeight, target * .9));
      }
      this.makeDragRoom(next, game, points, rect, hudTop, usableHeight);
      next.height = rect.height;
      next.y += hudTop;
      game.view = next;
      game.ui.setContactTight(game.compact && rect.height < 300);
    }
    // Dragging pulls back toward the lower left, so keep that side of the ball on screen.
    makeDragRoom(view, game, points, rect, hudTop, usableHeight) {
      const presentation = game.controllerPresentation();
      if (!presentation.camera?.dragRoom || presentation.drawToShoot) return;
      const room = clamp(Math.min(rect.width, rect.height) * .25, 68, 110) + 16;
      const ball = this.projection.project(game.ball), pad = 8;
      const projected = points.map(this.projection.project);
      const left = Math.min(...projected.map(p => p.x)), right = Math.max(...projected.map(p => p.x));
      const top = Math.min(...projected.map(p => p.y));
      const screenX = view.x + ball.x * view.scale, screenY = view.y + hudTop + ball.y * view.scale;
      const shiftX = Math.min(Math.max(0, room - screenX), Math.max(0, rect.width - pad - (view.x + right * view.scale)));
      const shiftY = Math.max(Math.min(0, rect.height - room - screenY), Math.min(0, hudTop - (view.y + hudTop + top * view.scale)));
      view.x += shiftX; view.y += shiftY;
    }
    cameraBounds() {
      const game = this.game;
      const bounds = game.controllerPresentation().camera?.bounds;
      if (bounds) return bounds;
      // Frame the opportunity on every screen, leaving the arena to fill the display.
      // Bounds are stable during play; they update at possession/state changes only.
      const actors = [game.player, ...game.mates, ...game.defenders];
      const xs = actors.map(p => p.startX), ys = actors.map(p => p.startY);
      xs.push(game.controlled.x); ys.push(game.controlled.y);
      xs.push(...(this.definitions[game.index].cameraExtraX || []));
      const left = Math.max(30, Math.min(370, ...xs) - 75);
      const right = Math.min(970, Math.max(630, ...xs) + 75);
      const bottom = Math.min(725, Math.max(...ys) + 130);
      return { left, top: STADIUM_OFFSET, width: right - left, height: bottom - STADIUM_OFFSET };
    }
    screenPoint(e) {
      const r = this.game.canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    toWorld(e) {
      const point = fromScreen(this.view, this.screenPoint(e));
      // Contact selection uses its own circular overlay, in camera-local coordinates.
      return this.game.state === State.BALL_CONTACT ? point : (this.view.projection?.toGround(point) || point);
    }
    update(dt) {
      const game = this.game, view = this.view;
      if (!dt || game.reducedMotion || game.pointer || game.pendingResult || game.ui.isPaused()) return;
      if ([State.AIMING, State.BALL_CONTACT, State.RESULT, State.SESSION_SUMMARY].includes(game.state)) return;
      const camera = game.controllerPresentation().camera;
      if (camera?.lock || !camera?.followBall) return;
      const anchors = camera.anchors || [];
      const ball = this.projection.project(game.ball);
      const points = anchors.map(this.projection.project);
      const radius = Core.ballGeometry(game.ball).radius;
      const left = Math.min(ball.x - radius, ...points.map(point => point.x));
      const right = Math.max(ball.x + radius, ...points.map(point => point.x));
      const top = Math.min(ball.y - radius, ...points.map(point => point.y));
      const bottom = Math.max(ball.y + radius, ...points.map(point => point.y));
      const pad = 12, safeTop = view.height < 500 ? 60 : 80;
      const safeBottom = view.height - (view.height < 500 ? 48 : 72);
      const scale = Math.min(view.scale, Math.max(1, view.width - 2 * pad) / (right - left),
        Math.max(1, safeBottom - safeTop) / (bottom - top));
      const blend = 1 - Math.exp(-dt / .25);
      const x = view.x + ((view.width - scale * (left + right)) / 2 - view.x) * blend;
      const y = view.y + ((safeTop + safeBottom - scale * (top + bottom)) / 2 - view.y) * blend;
      this.view = { ...view, scale,
        x: clamp(x, pad - left * scale, view.width - pad - right * scale),
        y: clamp(y, safeTop - top * scale, safeBottom - bottom * scale) };
    }
    maxDrag() {
      const game = this.game; return clamp(Math.min(game.view.width, game.view.height) * .25, 68, 110) / game.view.scale; }
    contactGeometry() {
      const game = this.game;
      const v = game.view, tight = game.compact && v.height < 300;
      const top = game.compact ? (tight ? 48 : 92) : v.height * .29;
      const bottom = game.compact ? v.height - (tight ? 38 : 50) : v.height * .82;
      const radius = Math.max(20, Math.min(game.compact ? 115 : 140, v.width * .32, (bottom - top) / 2));
      return { x: (v.width / 2 - v.x) / v.scale, y: ((top + bottom) / 2 - v.y) / v.scale, r: radius / v.scale };
    }
  }
  Viewport.CAMERA = CAMERA;
  Viewport.fitProjection = fitProjection;
  Viewport.worldToScreen = worldToScreen;
  Viewport.screenToGround = (view, point) => view.projection.toGround(fromScreen(view, point));
  Viewport.screenToGoal = (view, point) => view.projection.toGoal(fromScreen(view, point));
  window.ShoparFootball.Viewport = Viewport;
})();
