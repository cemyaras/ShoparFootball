/* Native pointer ownership and normalized input delivery to highlight controllers. */
(() => {
  'use strict';
  const { State } = window.ShoparFootball.Core;
  class PointerInput {
    constructor(game) { this.game = game; this.pointer = null; }
    bindCanvas() {
      const game = this.game;
      game.listen(game.canvas, 'pointerdown', e => game.onPointerDown(e));
      game.listen(game.canvas, 'pointermove', e => game.onPointerMove(e));
      game.listen(game.canvas, 'pointerup', e => game.onPointerUp(e));
      game.listen(game.canvas, 'pointercancel', e => game.cancelPointer(e.pointerId));
      game.listen(game.canvas, 'lostpointercapture', e => { if (game.pointer?.id === e.pointerId) game.cancelPointer(e.pointerId); });
      game.listen(game.canvas, 'contextmenu', e => e.preventDefault());
    }
    bindWindow() {
      const game = this.game;
      game.listen(window, 'blur', () => game.cancelPointer(game.pointer?.id));
      game.listen(document, 'visibilitychange', () => { game.lastTime = null; if (document.hidden) game.cancelPointer(game.pointer?.id); });
    }
    onPointerDown(e) {
      const game = this.game;
      if (e.button !== 0 || game.pointer || e.isPrimary === false) return;
      const p = game.toWorld(e);
      if (game.state === State.TITLE) { game.startSession(); return; }
      if (![State.AIMING, State.BALL_CONTACT, State.BALL_IN_MOTION, State.INTERCEPTION, State.DEFENDING].includes(game.state)) return;
      const reply = game.controller?.handleInput({ type: 'down', point: p, pointerId: e.pointerId });
      if (reply?.handled) {
        e.preventDefault();
        if (reply.capture && !game.pendingResult) {
          game.pointer = { id: e.pointerId, start: p, last: p, updateOnRelease: Boolean(reply.updateOnRelease) };
          game.canvas.setPointerCapture(e.pointerId);
        }
        if (reply.dismissToast !== false) game.toastTime = 0;
      }
    }
    onPointerMove(e) {
      const game = this.game;
      if (!game.pointer || e.pointerId !== game.pointer.id) return;
      e.preventDefault(); game.pointer.last = game.toWorld(e);
      game.controller?.handleInput({ type: 'move', point: game.pointer.last, start: game.pointer.start, pointerId: e.pointerId });
    }
    onPointerUp(e) {
      const game = this.game;
      if (!game.pointer || e.pointerId !== game.pointer.id) return;
      e.preventDefault(); const p = game.toWorld(e), start = game.pointer.start;
      if (game.pointer.updateOnRelease) game.onPointerMove(e);
      game.releasePointer();
      game.controller?.handleInput({ type: 'up', point: p, start, pointerId: e.pointerId });
    }
    releasePointer() {
      const game = this.game; const p = game.pointer; game.pointer = null; if (p && game.canvas.hasPointerCapture(p.id)) game.canvas.releasePointerCapture(p.id); }
    cancelPointer(id) {
      const game = this.game;
      if (game.pointer && id === game.pointer.id) { game.releasePointer(); game.controller?.cancelInput('cancel'); }
    }
  }
  window.ShoparFootball.PointerInput = PointerInput;
})();
