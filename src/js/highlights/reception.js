/* Read the game: meet an incoming pass, then reuse attacking possession. */
(() => {
  'use strict';
  const { State, FIELD, clamp, distance } = window.ShoparFootball.Core;
  class ReceptionController extends window.ShoparFootball.AttackController {
    enter() { this.startInterception(); }
    getPresentation() {
      const c = this.context;
      if (c.flow.state !== State.INTERCEPTION) return super.getPresentation();
      return { camera: { followBall: true, anchors: [c.play.interceptTarget || c.play.interceptSuggested] }, runMarkers: { incoming: { from: c.ball, to: { x: 850, y: 320 }, suggested: c.play.interceptSuggested,
        route: c.play.interceptTarget ? { from: c.player, to: c.play.interceptTarget } : null } } };
    }
    handleInput(input) {
      const c = this.context, play = c.play, p = input.point;
      if (input.type === 'down' && c.flow.state === State.INTERCEPTION) {
        play.interceptTarget = { x: clamp(p.x, FIELD.left + 12, FIELD.right - 12), y: clamp(p.y, FIELD.top + 25, FIELD.bottom - 20) };
        c.effects.ripple({ ...play.interceptTarget, age: 0 }); c.audio.play('tap');
        return { handled: true, capture: false, dismissToast: false };
      }
      return super.handleInput(input);
    }
    update(dt) {
      if (this.context.flow.state === State.INTERCEPTION) this.advanceMotion(dt, step => this.updateInterception(step));
      else super.update(dt);
    }
    startInterception() {
      Object.assign(this.context.ball, { x: 200, y: 320, z: 0, vx: 215, vy: 0, vz: 0, spin: 0, age: 0 });
      this.context.play.controlled = this.context.player; this.context.play.interceptTarget = null; this.context.play.motionTime = 0; this.context.flow.transition(State.INTERCEPTION);
      this.context.feedback.toast('Tap to receive', 1.8);
    }
    updateInterception(dt) {
      const b = this.context.ball; b.age += dt; b.x += b.vx * dt; b.rotation += dt * 6;
      this.context.effects.trail.push({ x: b.x, y: b.y, z: 0, age: 0 }); if (this.context.effects.trail.length > 40) this.context.effects.trail.shift(); this.context.effects.trail.forEach(t => t.age += dt);
      if (this.context.play.interceptTarget) this.context.physics.movePlayer(this.context.player, this.context.play.interceptTarget.x, this.context.play.interceptTarget.y, 168, dt);
      for (const d of this.context.defenders) if (b.x > 565) this.context.physics.movePlayer(d, b.x, b.y, 75, dt);
      if (distance(this.context.player, b) < 29) { this.receive(this.context.player, true); return; }
      for (const d of this.context.defenders) if (distance(d, b) < 24) { this.context.complete('intercepted', 'The defender got there first. Next time, meet the pass earlier.'); return; }
      if (b.x > 890 || this.context.play.motionTime > 4.2) this.context.complete('lost', 'The pass slipped past. Tap the mint ring early and let your player meet the ball.');
    }
  }
  window.ShoparFootball.ReceptionController = ReceptionController;
})();
