/* Canvas dimensions and world/screen mapping. */
(() => {
  'use strict';
  const { clamp, STADIUM_OFFSET } = window.ShoparFootball.Core;
  class Viewport {
    constructor(game, definitions) {
      this.game = game; this.definitions = definitions;
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
    resize() {
      const game = this.game;
      const rect = game.canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 3);
      if (!rect.width || !rect.height) return;
      game.compact = window.matchMedia('(max-width: 1024px), (max-width: 1180px) and (max-height: 600px)').matches;
      const bounds = game.cameraBounds();
      const hudTop = rect.height < 500 ? 48 : 68, dragBottom = rect.height < 500 ? 48 : 72;
      const usableHeight = Math.max(80, rect.height - hudTop - dragBottom);
      const scale = Math.min(game.controllerPresentation().camera?.maxScale ?? Infinity, rect.width / bounds.width, usableHeight / bounds.height);
      const next = { width: rect.width, height: rect.height, scale, x: (rect.width - bounds.width * scale) / 2 - bounds.left * scale, y: hudTop + (usableHeight - bounds.height * scale) / 2 - bounds.top * scale };
      // Repeated visualViewport events need not cancel a gesture if mapping is unchanged.
      const changed = Math.abs(next.scale - game.view.scale) > .0001 || Math.abs(next.x - game.view.x) > .25 || Math.abs(next.y - game.view.y) > .25;
      if (changed && game.pointer) game.cancelPointer(game.pointer.id);
      const width = Math.round(rect.width * dpr), height = Math.round(rect.height * dpr);
      if (game.canvas.width !== width) game.canvas.width = width;
      if (game.canvas.height !== height) game.canvas.height = height;
      game.dpr = dpr; game.view = next;
      game.ui.setContactTight(game.compact && rect.height < 300);
    }
    cameraBounds() {
      const game = this.game;
      if (game.controllerPresentation().camera) return game.controllerPresentation().camera.bounds;
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
    toWorld(e) {
      const game = this.game; const r = game.canvas.getBoundingClientRect(), v = game.view; return { x: (e.clientX - r.left - v.x) / v.scale, y: (e.clientY - r.top - v.y) / v.scale }; }
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
  window.ShoparFootball.Viewport = Viewport;
})();
